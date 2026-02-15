# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Dependency graph utilities for traversal and topological sorting.

This module provides functions to build the dependency graph from IssueRelation
data and traverse it to find all downstream dependents of an issue. The graph
is used by both cycle detection and date propagation services.

The dependency graph follows the "who depends on me" direction: each predecessor
maps to a list of successors (issues that depend on it).
"""

import logging
from collections import deque, defaultdict

from plane.db.models import IssueRelation

logger = logging.getLogger(__name__)

# Dependency relation types that participate in propagation and cycle detection.
DEPENDENCY_RELATION_TYPES = ("blocked_by", "start_before", "finish_before", "implemented_by")

# Maximum depth for graph traversal to prevent unbounded search in large graphs.
MAX_PROPAGATION_DEPTH = 100


def build_dependency_graph(issue_ids: list[str] | None = None) -> dict[str, list[tuple[str, str]]]:
    """
    Build the dependency graph from IssueRelation data.

    Constructs an adjacency list representing the dependency graph. The graph
    maps each issue (predecessor) to a list of (successor_id, relation_type) tuples
    representing issues that depend on it.

    The direction follows "who depends on me": if A is blocked_by B, then
    B → A in the graph (B is the predecessor, A is the dependent).

    Args:
        issue_ids: Optional list of issue IDs to limit the query scope.
                   If None, includes all relations.

    Returns:
        A dictionary mapping predecessor issue IDs to lists of
        (successor_id, relation_type) tuples.
    """
    graph: dict[str, list[tuple[str, str]]] = defaultdict(list)

    # Query all active (non-deleted) dependency relations.
    relations_query = IssueRelation.objects.filter(
        relation_type__in=DEPENDENCY_RELATION_TYPES,
        deleted_at__isnull=True,
    ).values_list("issue_id", "related_issue_id", "relation_type")

    # If issue_ids are specified, filter to those issues.
    if issue_ids:
        relations_query = relations_query.filter(issue_id__in=issue_ids)

    for issue_id, related_issue_id, relation_type in relations_query:
        # Map the predecessor (related_issue) to the dependent (issue).
        # For blocked_by: related_issue → issue (issue is blocked by related_issue)
        graph[str(related_issue_id)].append((str(issue_id), relation_type))

    return dict(graph)


def get_downstream_dependents(start_issue_id: str, graph: dict[str, list[tuple[str, str]]]) -> list[str]:
    """
    Find all downstream dependents of an issue using topological order.

    Performs a BFS traversal of the dependency graph starting from the given
    issue, following all transitive dependents. Returns issue IDs in topological
    order (predecessors before successors).

    Respects MAX_PROPAGATION_DEPTH and logs a warning if the depth is exceeded.

    Args:
        start_issue_id: The issue to start traversal from.
        graph: The dependency graph (adjacency list).

    Returns:
        A list of issue IDs in topological order, excluding the start issue.
    """
    if start_issue_id not in graph:
        # No dependents for this issue.
        return []

    visited = set()
    result = []
    queue = deque([(start_issue_id, 0)])  # (issue_id, depth)

    while queue:
        current_id, depth = queue.popleft()

        # Check depth limit.
        if depth >= MAX_PROPAGATION_DEPTH:
            logger.warning(
                f"Dependency propagation depth exceeded MAX_PROPAGATION_DEPTH ({MAX_PROPAGATION_DEPTH}) "
                f"at issue {current_id}. Stopping traversal."
            )
            break

        # Avoid revisiting nodes.
        if current_id in visited:
            continue

        visited.add(current_id)

        # Add dependents to queue and result.
        if current_id in graph:
            for dependent_id, _relation_type in graph[current_id]:
                if dependent_id not in visited:
                    result.append(dependent_id)
                    queue.append((dependent_id, depth + 1))

    return result
