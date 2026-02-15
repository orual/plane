# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Date propagation service for cascading date changes through dependency chains.

This module provides the `propagate_dates` function that automatically updates
the start_date and target_date of issues that depend on a changed issue.

The propagation follows dependency relation types:
- Finish-to-Start (blocked_by): successor start_date >= predecessor target_date + 1 day
- Start-to-Start (start_before): successor start_date >= predecessor start_date
- Finish-to-Finish (finish_before): successor target_date >= predecessor target_date

When an issue has multiple predecessors, the constraint is the maximum (latest) date.
"""

import logging
import json
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder

from plane.db.models import Issue, IssueRelation
from plane.bgtasks.issue_activities_task import issue_activity

from .dependency_graph import (
    DEPENDENCY_RELATION_TYPES,
    build_dependency_graph,
    get_downstream_dependents,
)

logger = logging.getLogger(__name__)


def propagate_dates(
    changed_issue_id: str,
    old_start_date: date | None,
    old_target_date: date | None,
    new_start_date: date | None,
    new_target_date: date | None,
) -> list[dict]:
    """
    Compute cascading date updates for issues depending on a changed issue.

    When an issue's dates change, this function finds all downstream dependents
    and computes their new dates based on dependency relation types. Multiple
    predecessors are resolved by taking the latest constraint date.

    Args:
        changed_issue_id: The issue ID whose dates changed.
        old_start_date: The previous start_date (date object or None).
        old_target_date: The previous target_date (date object or None).
        new_start_date: The new start_date (date object or None).
        new_target_date: The new target_date (date object or None).

    Returns:
        A list of dicts with keys: id, start_date, target_date.
        Each dict represents an issue that was updated.
    """

    # Build dependency graph and find downstream dependents.
    graph = build_dependency_graph()
    dependent_ids = get_downstream_dependents(changed_issue_id, graph)

    if not dependent_ids:
        return []

    # Seed updates_dict with the changed issue's new dates so predecessors
    # can reference them during propagation (makes parameters meaningful).
    updates_dict: dict[str, dict] = {
        changed_issue_id: {
            "id": changed_issue_id,
            "start_date": new_start_date,
            "target_date": new_target_date,
        }
    }

    # Build dependency graph already provides all relations; reuse it to build
    # a map of issue_id -> list of (predecessor_id, relation_type).
    # We need to query relations once to build the predecessor_map.
    predecessor_map: dict[str, list[tuple[str, str]]] = {}

    # Query relations once to build both the dependency graph direction
    # (which was already done) and the predecessor map.
    relations = IssueRelation.objects.filter(
        relation_type__in=DEPENDENCY_RELATION_TYPES,
        deleted_at__isnull=True,
    ).values_list("issue_id", "related_issue_id", "relation_type")

    for issue_id, related_issue_id, relation_type in relations:
        key = str(issue_id)
        if key not in predecessor_map:
            predecessor_map[key] = []
        predecessor_map[key].append((str(related_issue_id), relation_type))

    # Track which issues to update.
    updated_issues = []

    # Fetch full Issue objects for dependent issues (to preserve duration).
    dependent_issue_objects = Issue.objects.filter(id__in=dependent_ids)
    dependent_dict = {str(issue.id): issue for issue in dependent_issue_objects}

    # Pre-fetch all unique predecessor IDs to avoid N+1 queries.
    all_predecessor_ids = set()
    for predecessors in predecessor_map.values():
        for pred_id, _rel_type in predecessors:
            all_predecessor_ids.add(pred_id)

    # Remove the changed_issue_id from the set since we'll handle it from updates_dict
    all_predecessor_ids.discard(changed_issue_id)

    # Batch fetch all predecessor issues
    if all_predecessor_ids:
        predecessor_issues = Issue.objects.filter(id__in=all_predecessor_ids)
        predecessor_dict = {str(issue.id): issue for issue in predecessor_issues}
    else:
        predecessor_dict = {}

    # Process dependents in topological order (they come from BFS in topological order).
    for dependent_id in dependent_ids:
        if dependent_id not in dependent_dict:
            continue

        dependent_issue = dependent_dict[dependent_id]

        # Skip issues without dates (AC5.8).
        if dependent_issue.start_date is None:
            continue

        # Find all predecessors of this dependent.
        predecessors = predecessor_map.get(dependent_id, [])

        if not predecessors:
            continue

        # Compute constraint dates from all predecessors, maintaining separate constraints
        # for start_date and target_date since different relation types affect different fields.
        max_start_constraint = None
        max_target_constraint = None

        for predecessor_id, relation_type in predecessors:
            # Get predecessor's current dates.
            # If this predecessor was already updated in this propagation, use its new date.
            if predecessor_id in updates_dict:
                pred_start = updates_dict[predecessor_id]["start_date"]
                pred_target = updates_dict[predecessor_id]["target_date"]
            elif predecessor_id in predecessor_dict:
                # Use pre-fetched predecessor
                pred_issue = predecessor_dict[predecessor_id]
                pred_start = pred_issue.start_date
                pred_target = pred_issue.target_date
            else:
                # Predecessor not found (should not happen if relations are valid)
                continue

            # Compute constraints based on relation type.
            if relation_type == "blocked_by":
                # Finish-to-Start: successor start_date >= predecessor target_date + 1 day
                if pred_target:
                    constraint = pred_target + timedelta(days=1)
                    if max_start_constraint is None:
                        max_start_constraint = constraint
                    else:
                        max_start_constraint = max(max_start_constraint, constraint)
            elif relation_type == "start_before":
                # Start-to-Start: successor start_date >= predecessor start_date
                if pred_start:
                    if max_start_constraint is None:
                        max_start_constraint = pred_start
                    else:
                        max_start_constraint = max(max_start_constraint, pred_start)
            elif relation_type == "finish_before":
                # Finish-to-Finish: successor target_date >= predecessor target_date
                if pred_target:
                    if max_target_constraint is None:
                        max_target_constraint = pred_target
                    else:
                        max_target_constraint = max(max_target_constraint, pred_target)
            elif relation_type == "implemented_by":
                # implemented_by follows FS logic: successor start_date >= predecessor target_date + 1 day
                if pred_target:
                    constraint = pred_target + timedelta(days=1)
                    if max_start_constraint is None:
                        max_start_constraint = constraint
                    else:
                        max_start_constraint = max(max_start_constraint, constraint)

        if max_start_constraint is None and max_target_constraint is None:
            continue

        # Update dates if the constraint is later than the current date.
        new_start = dependent_issue.start_date
        new_target = dependent_issue.target_date

        if max_start_constraint and max_start_constraint > dependent_issue.start_date:
            # Shift start_date and preserve duration by shifting target_date.
            date_delta = max_start_constraint - dependent_issue.start_date
            new_start = max_start_constraint
            if new_target:
                new_target = new_target + date_delta

        if (
            max_target_constraint
            and dependent_issue.target_date
            and max_target_constraint > dependent_issue.target_date
        ):
            new_target = max_target_constraint

        # If dates changed, mark for update.
        if new_start != dependent_issue.start_date or new_target != dependent_issue.target_date:
            # Capture old dates BEFORE mutation for activity logging
            old_start_str = str(dependent_issue.start_date) if dependent_issue.start_date else ""
            old_target_str = str(dependent_issue.target_date) if dependent_issue.target_date else ""

            dependent_issue.start_date = new_start
            dependent_issue.target_date = new_target
            updated_issues.append(dependent_issue)
            updates_dict[dependent_id] = {
                "id": dependent_id,
                "start_date": new_start,
                "target_date": new_target,
                "old_start": old_start_str,
                "old_target": old_target_str,
            }

    # Perform bulk update in a transaction (AC5.7).
    if updated_issues:
        with transaction.atomic():
            Issue.objects.bulk_update(updated_issues, ["start_date", "target_date"])

            # Fire activity tasks for each updated issue.
            for issue_obj in updated_issues:
                update_info = updates_dict[str(issue_obj.id)]
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps(
                        {
                            "start_date": str(issue_obj.start_date),
                            "target_date": str(issue_obj.target_date),
                        },
                        cls=DjangoJSONEncoder,
                    ),
                    current_instance=json.dumps(
                        {
                            "id": str(issue_obj.id),
                            "start_date": update_info["old_start"],
                            "target_date": update_info["old_target"],
                        },
                        cls=DjangoJSONEncoder,
                    ),
                    issue_id=str(issue_obj.id),
                    project_id=str(issue_obj.project_id),
                    actor_id=None,
                    epoch=int(timezone.now().timestamp()),
                    origin="propagation",
                )

    # Return the list of updates (exclude old dates used for logging).
    return [
        {
            "id": update["id"],
            "start_date": update["start_date"],
            "target_date": update["target_date"],
        }
        for update in updates_dict.values()
        if update["id"] != changed_issue_id  # Don't include the changed issue itself
    ]
