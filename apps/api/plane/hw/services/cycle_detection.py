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
    source_issue_id: str,
    target_issue_id: str,
    relation_type: str,
) -> list[str] | None:
    """
    Detect if creating a relation would form a cycle in the dependency graph.

    Given a proposed source and target issue for a relation, this function checks
    whether creating the relation would form a cycle. Only dependency relation
    types participate in cycle detection; symmetric types are excluded.

    Args:
        source_issue_id: The issue ID that would be the source of the new relation.
        target_issue_id: The issue ID that would be the target of the new relation.
        relation_type: The relation type (after normalization to stored form).

    Returns:
        None if no cycle would be formed, or a list of issue ID strings
        forming the cycle path (including source_issue_id at both ends).
        For example, [A, B, C, A] represents the cycle A→B→C→A.
    """

    # Self-referencing is a degenerate cycle (A→A).
    if source_issue_id == target_issue_id:
        # Cycle path for self-reference is just [A, A].
        return [source_issue_id, source_issue_id]

    # Only check dependency relation types; symmetric types don't form cycles.
    if relation_type not in DEPENDENCY_RELATION_TYPES:
        return None

    # DFS to check if source is reachable from target.
    # Returns the path if found, None otherwise.
    path = _dfs_find_cycle(target_issue_id, source_issue_id, set(), [])

    if path:
        # Prepend source_issue_id to complete the cycle.
        # path is the chain from target to source, so prepending source gives:
        # source → target → ... → source
        return [source_issue_id] + path

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
