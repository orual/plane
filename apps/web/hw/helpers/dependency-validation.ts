/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Dependency validation for relations on the frontend.
 *
 * This module provides pure functions to:
 * 1. Detect cycles in the in-memory relation graph from the MobX store.
 *    It operates on a plain Record structure (relationMap) and performs DFS
 *    to check if creating a new relation would form a cycle.
 * 2. Infer the relation type from drag endpoint pairs.
 *
 * Only scheduling/dependency types participate in cycle detection:
 * blocking, blocked_by, start_before, start_after, finish_before,
 * finish_after, implemented_by, implements.
 * Symmetric types (relates_to, duplicate) are excluded.
 */

import type { TIssueRelationTypes } from "../types/gantt-chart";

/**
 * The in-memory relation map structure from the MobX store.
 * Shape: { issueId: { relationType: [relatedIssueId, ...] } }
 */
export type DependencyRelationMap = Record<string, Record<string, string[]>>;

/**
 * Dependency relation types that participate in cycle detection.
 * These include both directions of scheduling and structural relations.
 */
const DEPENDENCY_RELATION_TYPES: Set<TIssueRelationTypes> = new Set([
  "blocking",
  "blocked_by",
  "start_before",
  "start_after",
  "finish_before",
  "finish_after",
  "implemented_by",
  "implements",
]);

/**
 * Maximum depth for DFS traversal to prevent unbounded search in large graphs.
 */
const MAX_DEPTH = 100;

/**
 * Detect if creating a relation would form a cycle in the dependency graph.
 *
 * This is a pure function that checks whether adding a relation from
 * sourceIssueId to targetIssueId would create a cycle. It operates on
 * the in-memory relationMap from the MobX store.
 *
 * Only dependency relation types participate in cycle detection; symmetric
 * types (relates_to, duplicate) are excluded.
 *
 * @param relationMap The in-memory relation map from the store.
 * @param sourceIssueId The issue ID that would be the source of the new relation.
 * @param targetIssueId The issue ID that would be the target of the new relation.
 * @returns null if no cycle would be formed, or a list of issue IDs forming
 *          the cycle path (including sourceIssueId at both ends).
 *          For example, [A, B, C, A] represents the cycle A→B→C→A.
 */
export function detectCycleInMemory(
  relationMap: DependencyRelationMap,
  sourceIssueId: string,
  targetIssueId: string
): string[] | null {
  // Self-referencing is a degenerate cycle (A→A).
  if (sourceIssueId === targetIssueId) {
    return [sourceIssueId];
  }

  // DFS to check if sourceIssueId is reachable from targetIssueId.
  // Returns the path if found, null otherwise.
  const path = dfsTraverseCycle(relationMap, targetIssueId, sourceIssueId, new Set(), [], 0);

  if (path) {
    // Prepend sourceIssueId to complete the cycle.
    // path is the chain from targetIssueId to sourceIssueId, so prepending
    // sourceIssueId gives: sourceIssueId → targetIssueId → ... → sourceIssueId
    return [sourceIssueId, ...path];
  }

  return null;
}

/**
 * DFS helper to find if targetIssueId is reachable from currentIssueId.
 *
 * Traverses the dependency graph following dependency relations outward
 * from the current issue. If targetIssueId is reached, returns the path.
 * Otherwise, returns null.
 *
 * @param relationMap The in-memory relation map from the store.
 * @param currentIssueId The current issue being explored.
 * @param targetIssueId The target issue to find.
 * @param visited Set of already-visited issue IDs to avoid cycles during traversal.
 * @param path The current path being explored.
 * @param depth Current depth in the traversal.
 * @returns The path from current to target if found, null otherwise.
 */
function dfsTraverseCycle(
  relationMap: DependencyRelationMap,
  currentIssueId: string,
  targetIssueId: string,
  visited: Set<string>,
  path: string[],
  depth: number
): string[] | null {
  // Depth limit to prevent unbounded search in large graphs.
  if (depth >= MAX_DEPTH) {
    return null;
  }

  // Check if we've reached the target.
  if (currentIssueId === targetIssueId) {
    // Include the target node in the path to complete the chain.
    return [...path, currentIssueId];
  }

  // Avoid revisiting nodes to prevent infinite loops in traversal.
  if (visited.has(currentIssueId)) {
    return null;
  }

  visited.add(currentIssueId);
  const currentPath = [...path, currentIssueId];

  // Get all relations originating from the current issue.
  const issueRelations = relationMap[currentIssueId];
  if (!issueRelations) {
    return null;
  }

  // Iterate through all dependency relation types.
  for (const relationType of DEPENDENCY_RELATION_TYPES) {
    const relatedIssueIds = issueRelations[relationType];

    if (!relatedIssueIds) {
      continue;
    }

    // Follow each related issue in this relation type.
    for (const relatedIssueId of relatedIssueIds) {
      const result = dfsTraverseCycle(relationMap, relatedIssueId, targetIssueId, visited, currentPath, depth + 1);

      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Infer the relation type from source and target drag endpoints.
 *
 * Mapping based on project scheduling conventions:
 * - right → left: "blocking" (Finish-to-Start, blocking relation)
 * - left → left: "start_before" (Start-to-Start)
 * - right → right: "finish_before" (Finish-to-Finish)
 * - left → right: "finish_before" (unusual direction, mapped to FF as closest match)
 *
 * @param sourceEndpoint The endpoint of the source block ("left" or "right")
 * @param targetEndpoint The endpoint of the target block ("left" or "right")
 * @returns The inferred relation type
 */
export function inferRelationType(
  sourceEndpoint: "left" | "right",
  targetEndpoint: "left" | "right"
): TIssueRelationTypes {
  if (sourceEndpoint === "right" && targetEndpoint === "left") {
    return "blocking";
  }
  if (sourceEndpoint === "left" && targetEndpoint === "left") {
    return "start_before";
  }
  // Both "right → right" and "left → right" map to finish_before
  return "finish_before";
}
