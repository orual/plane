# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Cycle detection service for dependency relations.

This module provides a DFS-based cycle detection algorithm to prevent circular
dependencies in the issue relation graph. Only scheduling/dependency relation
types participate in cycle detection: blocked_by, start_before, finish_before,
and implemented_by. Symmetric relations (relates_to, duplicate) are excluded.

The IssueRelation model stores relations with the direction: issue is related to
related_issue by the given relation_type. For blocking relations (blocked_by),
this means: issue is blocked by related_issue.

To detect cycles, we traverse the dependency graph starting from the target issue
and follow all downstream dependents (issues that depend on the target). If we
reach the source issue, creating the relation would form a cycle.
"""

from plane.db.models import IssueRelation


# Dependency relation types that participate in cycle detection.
# These are the stored relation types in IssueRelation.relation_type.
DEPENDENCY_RELATION_TYPES = {
    "blocked_by",
    "start_before",
    "finish_before",
    "implemented_by",
}

# Maximum depth for DFS traversal to prevent unbounded search in large graphs.
MAX_DEPTH = 100


def detect_dependency_cycle(
    blocker_issue_id: str,
    dependent_issue_id: str,
    relation_type: str,
) -> list[str] | None:
    """
    Detect if creating a dependency relation would form a cycle.

    The proposed relation means: dependent_issue depends on blocker_issue.
    A cycle exists if blocker_issue already (transitively) depends on
    dependent_issue through existing dependency edges.

    Args:
        blocker_issue_id: The issue being depended on (the blocker/predecessor).
            In the view, this is the ``source_issue_id`` (the ``related_issue``
            for non-swap types, or ``issue_id`` for swap types).
        dependent_issue_id: The issue that would depend on the blocker.
            In the view, this is the ``target_issue_id``.
        relation_type: The stored relation type (after normalization).

    Returns:
        None if no cycle would be formed, or a list of issue ID strings
        forming the cycle path. For example, [A, B, C, A] represents A→B→C→A.
    """

    # Self-referencing is a degenerate cycle (A→A).
    if blocker_issue_id == dependent_issue_id:
        return [blocker_issue_id, blocker_issue_id]

    # Only check dependency relation types; symmetric types don't form cycles.
    if relation_type not in DEPENDENCY_RELATION_TYPES:
        return None

    # DFS from the blocker, following its dependency chain (what the blocker
    # depends on). If we reach the dependent, the proposed edge would close
    # a cycle: dependent → blocker → ... → dependent.
    path = _dfs_find_cycle(blocker_issue_id, dependent_issue_id, set(), [])

    if path:
        # path is [blocker, ..., dependent]. Prepend dependent to show the
        # full cycle: dependent → blocker → ... → dependent.
        return [dependent_issue_id] + path

    return None


def _dfs_find_cycle(
    current_issue_id: str,
    target_issue_id: str,
    visited: set[str],
    path: list[str],
    depth: int = 0,
) -> list[str] | None:
    """
    DFS helper to find if target_issue_id is reachable from current_issue_id.

    Traverses the dependency graph following the direction of dependents
    (issues that depend on the current issue). If target is reached, returns
    the path. Otherwise, returns None.

    Args:
        current_issue_id: The current issue being explored.
        target_issue_id: The target issue to find.
        visited: Set of already-visited issue IDs to avoid cycles during traversal.
        path: The current path being explored.
        depth: Current depth in the traversal.

    Returns:
        The path from current to target if found, None otherwise.
    """

    # Depth limit to prevent unbounded search in large graphs.
    if depth >= MAX_DEPTH:
        return None

    # Check if we've reached the target.
    if current_issue_id == target_issue_id:
        # Include the target node in the path to complete the chain.
        return path + [current_issue_id]

    # Avoid revisiting nodes to prevent infinite loops in traversal.
    if current_issue_id in visited:
        return None

    visited.add(current_issue_id)
    current_path = path + [current_issue_id]

    # Follow the current issue's own dependencies.
    # IssueRelation(issue=A, related_issue=B, relation_type='blocked_by') means
    # A depends on B. Query issue_id=current to find what current depends on.
    dependency_targets = IssueRelation.objects.filter(
        issue_id=current_issue_id,
        relation_type__in=DEPENDENCY_RELATION_TYPES,
    ).values_list("related_issue_id", flat=True)

    for dependent_issue_id in dependency_targets:
        result = _dfs_find_cycle(str(dependent_issue_id), target_issue_id, visited, current_path, depth + 1)
        if result is not None:
            return result

    return None
