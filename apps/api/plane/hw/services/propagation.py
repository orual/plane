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
from datetime import timedelta
from typing import Optional

from django.db import transaction

from plane.db.models import Issue, IssueRelation
from plane.bgtasks.issue_tasks import issue_activity

from .dependency_graph import (
    DEPENDENCY_RELATION_TYPES,
    build_dependency_graph,
    get_downstream_dependents,
)

logger = logging.getLogger(__name__)


def propagate_dates(
    changed_issue_id: str,
    old_start_date: Optional[object],
    old_target_date: Optional[object],
    new_start_date: Optional[object],
    new_target_date: Optional[object],
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

    # Fetch all dependent issues in a single query.
    dependents = {
        str(issue.id): issue
        for issue in Issue.objects.filter(id__in=dependent_ids).values("id", "start_date", "target_date")
    }

    # Fetch all relations needed to determine predecessors and constraint types.
    relations = IssueRelation.objects.filter(
        relation_type__in=DEPENDENCY_RELATION_TYPES,
        deleted_at__isnull=True,
    ).values("issue_id", "related_issue_id", "relation_type")

    # Build a map of issue_id -> list of (predecessor_id, relation_type)
    predecessor_map: dict[str, list[tuple[str, str]]] = {}
    for issue_id, related_issue_id, relation_type in relations:
        key = str(issue_id)
        if key not in predecessor_map:
            predecessor_map[key] = []
        predecessor_map[key].append((str(related_issue_id), relation_type))

    # Track which issues to update.
    updated_issues = []
    updates_dict = {}

    # Fetch full Issue objects for dependent issues (to preserve duration).
    dependent_issue_objects = Issue.objects.filter(id__in=dependent_ids)
    dependent_dict = {str(issue.id): issue for issue in dependent_issue_objects}

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

        # Compute the constraint date from all predecessors.
        max_constraint_date = None

        for predecessor_id, relation_type in predecessors:
            # Get predecessor's current dates.
            # If this predecessor was already updated in this propagation, use its new date.
            if predecessor_id in updates_dict:
                pred_start = updates_dict[predecessor_id]["start_date"]
                pred_target = updates_dict[predecessor_id]["target_date"]
            else:
                # Otherwise, fetch from database (or use fresh if not yet saved).
                try:
                    pred_issue = Issue.objects.get(id=predecessor_id)
                    pred_start = pred_issue.start_date
                    pred_target = pred_issue.target_date
                except Issue.DoesNotExist:
                    continue

            # Compute constraint based on relation type.
            constraint_date = None

            if relation_type == "blocked_by":
                # Finish-to-Start: successor start_date >= predecessor target_date + 1 day
                if pred_target:
                    constraint_date = pred_target + timedelta(days=1)
            elif relation_type == "start_before":
                # Start-to-Start: successor start_date >= predecessor start_date
                if pred_start:
                    constraint_date = pred_start
            elif relation_type == "finish_before":
                # Finish-to-Finish: successor target_date >= predecessor target_date
                if pred_target:
                    constraint_date = pred_target

            # Take the maximum constraint date across all predecessors.
            if constraint_date:
                if max_constraint_date is None:
                    max_constraint_date = constraint_date
                else:
                    max_constraint_date = max(max_constraint_date, constraint_date)

        if max_constraint_date is None:
            continue

        # Determine which date field(s) to update based on relation types.
        update_start_date = False
        update_target_date = False

        for _predecessor_id, relation_type in predecessors:
            if relation_type in ("blocked_by", "start_before"):
                update_start_date = True
            if relation_type == "finish_before":
                update_target_date = True

        # Update dates if the constraint is later than the current date.
        new_start = dependent_issue.start_date
        new_target = dependent_issue.target_date

        if update_start_date and max_constraint_date > dependent_issue.start_date:
            # Shift start_date and preserve duration by shifting target_date.
            date_delta = max_constraint_date - dependent_issue.start_date
            new_start = max_constraint_date
            if new_target:
                new_target = new_target + date_delta

        if update_target_date and max_constraint_date > dependent_issue.target_date:
            new_target = max_constraint_date

        # If dates changed, mark for update.
        if new_start != dependent_issue.start_date or new_target != dependent_issue.target_date:
            dependent_issue.start_date = new_start
            dependent_issue.target_date = new_target
            updated_issues.append(dependent_issue)
            updates_dict[dependent_id] = {
                "id": dependent_id,
                "start_date": new_start,
                "target_date": new_target,
            }

    # Perform bulk update in a transaction (AC5.7).
    if updated_issues:
        with transaction.atomic():
            Issue.objects.bulk_update(updated_issues, ["start_date", "target_date"])

            # Fire activity tasks for each updated issue.
            for issue_obj in updated_issues:
                issue_activity.delay(
                    type="issue.activity.updated",
                    issue_id=str(issue_obj.id),
                    project_id=str(issue_obj.project_id),
                    actor_id=None,
                    origin="propagation",
                )

    # Return the list of updates.
    return list(updates_dict.values())
