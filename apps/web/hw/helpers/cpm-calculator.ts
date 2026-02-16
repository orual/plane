/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationMap } from "@plane/types";

// Constants
const MAX_PROPAGATION_DEPTH = 100;
const DEFAULT_DURATION_DAYS = 1;

// Output types
export type CpmResult = {
  es: string; // Early Start (ISO date string YYYY-MM-DD)
  ef: string; // Early Finish (ISO date string YYYY-MM-DD)
  ls: string; // Late Start (ISO date string YYYY-MM-DD)
  lf: string; // Late Finish (ISO date string YYYY-MM-DD)
  slack: number; // Total float in days
  isCritical: boolean; // slack === 0
};

export type CpmResultMap = Map<string, CpmResult>;

// Input types
export type CpmIssueDates = {
  start_date: string | undefined;
  target_date: string | undefined;
};

// Scheduling edge in adjacency list
export type SchedulingEdge = {
  successorId: string;
  relationType: "blocking" | "start_before" | "finish_before";
};

// Adjacency list: predecessor_id -> [(successor_id, relation_type)]
export type AdjacencyList = Map<string, Array<SchedulingEdge>>;

// Reverse adjacency list: successor_id -> [(predecessor_id, relation_type)]
export type ReverseAdjacencyList = Map<
  string,
  Array<{ predecessorId: string; relationType: "blocking" | "start_before" | "finish_before" }>
>;

/**
 * Convert TIssueRelationMap into AdjacencyList (forward) and ReverseAdjacencyList
 *
 * The relation map is issue-centric:
 * - issueA.blocking = [issueB] means A blocks B (A → B with type "blocking")
 * - issueA.blocked_by = [issueB] means B blocks A (B → A with type "blocking")
 * - issueA.start_before = [issueB] means A starts before B (A → B with type "start_before")
 * - issueA.start_after = [issueB] means B starts before A (B → A with type "start_before")
 * - issueA.finish_before = [issueB] means A finishes before B (A → B with type "finish_before")
 * - issueA.finish_after = [issueB] means B finishes before A (B → A with type "finish_before")
 */
export function buildAdjacencyList(relationMap: TIssueRelationMap): {
  adjacencyList: AdjacencyList;
  reverseAdjacencyList: ReverseAdjacencyList;
} {
  const adjacencyList: AdjacencyList = new Map();
  const reverseAdjacencyList: ReverseAdjacencyList = new Map();

  // Iterate through each issue in the relation map
  for (const [issueId, relations] of Object.entries(relationMap)) {
    // Process blocking relations (FS edges)
    const blocking = relations.blocking ?? [];
    for (const successorId of blocking) {
      // issueId → successorId (type: blocking)
      if (!adjacencyList.has(issueId)) {
        adjacencyList.set(issueId, []);
      }
      adjacencyList.get(issueId)!.push({ successorId, relationType: "blocking" });

      if (!reverseAdjacencyList.has(successorId)) {
        reverseAdjacencyList.set(successorId, []);
      }
      reverseAdjacencyList.get(successorId)!.push({ predecessorId: issueId, relationType: "blocking" });
    }

    // Process blocked_by relations (reverse FS edges)
    const blockedBy = relations.blocked_by ?? [];
    for (const predecessorId of blockedBy) {
      // predecessorId → issueId (type: blocking)
      if (!adjacencyList.has(predecessorId)) {
        adjacencyList.set(predecessorId, []);
      }
      adjacencyList.get(predecessorId)!.push({ successorId: issueId, relationType: "blocking" });

      if (!reverseAdjacencyList.has(issueId)) {
        reverseAdjacencyList.set(issueId, []);
      }
      reverseAdjacencyList.get(issueId)!.push({ predecessorId, relationType: "blocking" });
    }

    // Process start_before relations (SS edges)
    const startBefore = relations.start_before ?? [];
    for (const successorId of startBefore) {
      // issueId → successorId (type: start_before)
      if (!adjacencyList.has(issueId)) {
        adjacencyList.set(issueId, []);
      }
      adjacencyList.get(issueId)!.push({ successorId, relationType: "start_before" });

      if (!reverseAdjacencyList.has(successorId)) {
        reverseAdjacencyList.set(successorId, []);
      }
      reverseAdjacencyList.get(successorId)!.push({ predecessorId: issueId, relationType: "start_before" });
    }

    // Process start_after relations (reverse SS edges)
    const startAfter = relations.start_after ?? [];
    for (const predecessorId of startAfter) {
      // predecessorId → issueId (type: start_before)
      if (!adjacencyList.has(predecessorId)) {
        adjacencyList.set(predecessorId, []);
      }
      adjacencyList.get(predecessorId)!.push({ successorId: issueId, relationType: "start_before" });

      if (!reverseAdjacencyList.has(issueId)) {
        reverseAdjacencyList.set(issueId, []);
      }
      reverseAdjacencyList.get(issueId)!.push({ predecessorId, relationType: "start_before" });
    }

    // Process finish_before relations (FF edges)
    const finishBefore = relations.finish_before ?? [];
    for (const successorId of finishBefore) {
      // issueId → successorId (type: finish_before)
      if (!adjacencyList.has(issueId)) {
        adjacencyList.set(issueId, []);
      }
      adjacencyList.get(issueId)!.push({ successorId, relationType: "finish_before" });

      if (!reverseAdjacencyList.has(successorId)) {
        reverseAdjacencyList.set(successorId, []);
      }
      reverseAdjacencyList.get(successorId)!.push({ predecessorId: issueId, relationType: "finish_before" });
    }

    // Process finish_after relations (reverse FF edges)
    const finishAfter = relations.finish_after ?? [];
    for (const predecessorId of finishAfter) {
      // predecessorId → issueId (type: finish_before)
      if (!adjacencyList.has(predecessorId)) {
        adjacencyList.set(predecessorId, []);
      }
      adjacencyList.get(predecessorId)!.push({ successorId: issueId, relationType: "finish_before" });

      if (!reverseAdjacencyList.has(issueId)) {
        reverseAdjacencyList.set(issueId, []);
      }
      reverseAdjacencyList.get(issueId)!.push({ predecessorId, relationType: "finish_before" });
    }
  }

  return { adjacencyList, reverseAdjacencyList };
}

/**
 * Topological sort using Kahn's algorithm.
 *
 * Returns sorted issue IDs in topological order. If a cycle exists,
 * returns only the acyclic portion (cycle detection handled elsewhere).
 */
export function topologicalSort(adjacencyList: AdjacencyList, allIssueIds: Set<string>): Array<string> {
  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  const issueIdsArray = Array.from(allIssueIds);
  for (let i = 0; i < issueIdsArray.length; i++) {
    inDegree.set(issueIdsArray[i], 0);
  }

  const adjacencyEntries = Array.from(adjacencyList.entries());
  for (let i = 0; i < adjacencyEntries.length; i++) {
    const edges = adjacencyEntries[i][1];
    for (let j = 0; j < edges.length; j++) {
      const edge = edges[j];
      inDegree.set(edge.successorId, (inDegree.get(edge.successorId) ?? 0) + 1);
    }
  }

  // Find all nodes with in-degree 0
  const queue: Array<string> = [];
  for (let i = 0; i < issueIdsArray.length; i++) {
    const issueId = issueIdsArray[i];
    if ((inDegree.get(issueId) ?? 0) === 0) {
      queue.push(issueId);
    }
  }

  const sorted: Array<string> = [];
  let depth = 0;

  while (queue.length > 0 && depth < MAX_PROPAGATION_DEPTH) {
    const issueId = queue.shift()!;
    sorted.push(issueId);
    depth++;

    const edges = adjacencyList.get(issueId);
    if (edges) {
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const newInDegree = (inDegree.get(edge.successorId) ?? 1) - 1;
        inDegree.set(edge.successorId, newInDegree);
        if (newInDegree === 0) {
          queue.push(edge.successorId);
        }
      }
    }
  }

  return sorted;
}

/**
 * Date arithmetic helper functions
 */

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diffTime = Math.abs(b.getTime() - a.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function maxDate(...dates: Array<string>): string {
  if (dates.length === 0) return "";
  return dates.reduce((max, current) => (current > max ? current : max));
}

export function minDate(...dates: Array<string>): string {
  if (dates.length === 0) return "";
  return dates.reduce((min, current) => (current < min ? current : min));
}

/**
 * Forward pass: compute ES and EF for each issue
 *
 * @param sortedIds - topologically sorted issue IDs
 * @param _adjacencyList - predecessor→successor edges (unused, for future extension)
 * @param reverseAdjacencyList - successor→predecessor edges
 * @param getIssueDates - function to look up dates by issue ID
 * @returns map of { es, ef, duration } for each processed issue
 */
export function forwardPass(
  sortedIds: ReadonlyArray<string>,
  _adjacencyList: AdjacencyList,
  reverseAdjacencyList: ReverseAdjacencyList,
  getIssueDates: (id: string) => CpmIssueDates | undefined
): Map<string, { es: string; ef: string; duration: number }> {
  const results = new Map<string, { es: string; ef: string; duration: number }>();

  for (const issueId of sortedIds) {
    const dates = getIssueDates(issueId);
    if (!dates) continue;

    // Compute duration
    let duration: number;
    let startDate: string | undefined;

    if (dates.start_date && dates.target_date) {
      // Both dates present: duration = days between inclusive
      duration = daysBetween(dates.start_date, dates.target_date) + 1;
      startDate = dates.start_date;
    } else if (dates.start_date && !dates.target_date) {
      // Only start_date: duration = DEFAULT_DURATION_DAYS
      duration = DEFAULT_DURATION_DAYS;
      startDate = dates.start_date;
    } else if (!dates.start_date && dates.target_date) {
      // Only target_date: duration = DEFAULT_DURATION_DAYS
      duration = DEFAULT_DURATION_DAYS;
      startDate = addDays(dates.target_date, -(duration - 1));
    } else {
      // No dates: duration = DEFAULT_DURATION_DAYS, dates computed from predecessors
      duration = DEFAULT_DURATION_DAYS;
    }

    // Compute ES (Early Start)
    const predecessors = reverseAdjacencyList.get(issueId);
    let es: string | undefined;

    if (predecessors && predecessors.length > 0) {
      // Multiple predecessors: take the maximum constraint
      const constraints: Array<string> = [];

      for (const pred of predecessors) {
        const predResult = results.get(pred.predecessorId);
        if (!predResult) continue;

        let constraint: string;
        if (pred.relationType === "blocking") {
          // FS: ES = predecessor EF + 1
          constraint = addDays(predResult.ef, 1);
        } else if (pred.relationType === "start_before") {
          // SS: ES = predecessor ES
          constraint = predResult.es;
        } else if (pred.relationType === "finish_before") {
          // FF: ES = predecessor EF - successor duration + 1
          constraint = addDays(predResult.ef, -(duration - 1));
        } else {
          continue;
        }
        constraints.push(constraint);
      }

      if (constraints.length > 0) {
        es = maxDate(...constraints);
      }
    } else if (startDate) {
      // No predecessors: ES = issue's start_date
      es = startDate;
    }

    // If no ES determined and no explicit start date, skip this issue
    if (!es && !startDate) {
      continue;
    }

    // Use the explicit start date as a minimum constraint if available
    if (startDate && es && startDate > es) {
      es = startDate;
    }

    if (!es) {
      es = startDate!;
    }

    // Compute EF: ES + duration - 1
    const ef = addDays(es, duration - 1);

    results.set(issueId, { es, ef, duration });
  }

  return results;
}

/**
 * Backward pass: compute LS and LF for each issue
 *
 * @param sortedIds - topologically sorted issue IDs (will be reversed)
 * @param adjacencyList - predecessor→successor edges
 * @param reverseAdjacencyList - successor→predecessor edges
 * @param forwardResults - forward pass results with ES, EF, duration
 * @returns map of { ls, lf } for each issue
 */
export function backwardPass(
  sortedIds: ReadonlyArray<string>,
  adjacencyList: AdjacencyList,
  _reverseAdjacencyList: ReverseAdjacencyList,
  forwardResults: Map<string, { es: string; ef: string; duration: number }>
): Map<string, { ls: string; lf: string }> {
  const results = new Map<string, { ls: string; lf: string }>();

  // Determine project deadline: max(EF) across all issues
  let projectDeadline = "";
  for (const [, forwardData] of forwardResults) {
    if (!projectDeadline || forwardData.ef > projectDeadline) {
      projectDeadline = forwardData.ef;
    }
  }

  if (!projectDeadline) {
    return results; // No issues in forward pass, return empty
  }

  // Walk backward through sorted IDs in reverse order
  const reversedIds = Array.from(sortedIds).reverse();
  for (const issueId of reversedIds) {
    const forwardData = forwardResults.get(issueId);
    if (!forwardData) continue;

    const { duration } = forwardData;

    // Compute LF (Late Finish)
    let lf: string | undefined;
    const successors = adjacencyList.get(issueId);

    if (successors && successors.length > 0) {
      // Multiple successors: take the minimum constraint
      const constraints: Array<string> = [];

      for (const succ of successors) {
        const succResult = results.get(succ.successorId);
        if (!succResult) continue;

        let constraint: string;
        if (succ.relationType === "blocking") {
          // FS: LF = successor LS - 1
          constraint = addDays(succResult.ls, -1);
        } else if (succ.relationType === "start_before") {
          // SS: LF = successor LS
          constraint = succResult.ls;
        } else if (succ.relationType === "finish_before") {
          // FF: LF = successor LF
          constraint = succResult.lf;
        } else {
          continue;
        }
        constraints.push(constraint);
      }

      if (constraints.length > 0) {
        lf = minDate(...constraints);
      }
    } else {
      // No successors (leaf node): LF = project deadline
      lf = projectDeadline;
    }

    // If no LF determined, skip this issue
    if (!lf) {
      continue;
    }

    // Compute LS: LF - duration + 1
    const ls = addDays(lf, -(duration - 1));

    results.set(issueId, { ls, lf });
  }

  return results;
}

/**
 * Main CPM computation entry point
 *
 * Orchestrates all passes: graph building, topological sort, forward pass,
 * backward pass, and slack calculation.
 *
 * @param relationMap - issue relation map from the store
 * @param getIssueDates - function to look up dates by issue ID
 * @returns CpmResultMap with ES, EF, LS, LF, slack, and isCritical for each issue
 */
export function computeCpm(
  relationMap: TIssueRelationMap,
  getIssueDates: (id: string) => CpmIssueDates | undefined
): CpmResultMap {
  // Step 1: Build adjacency lists
  const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

  // Step 2: Collect all issue IDs that appear in the graph
  const allIssueIds = new Set<string>();
  for (const issueId of Object.keys(relationMap)) {
    allIssueIds.add(issueId);
  }
  for (const [predId] of adjacencyList) {
    allIssueIds.add(predId);
  }
  for (const [succId] of reverseAdjacencyList) {
    allIssueIds.add(succId);
  }

  // Early exit: no issues
  if (allIssueIds.size === 0) {
    return new Map();
  }

  // Step 3: Topological sort
  const sortedIds = topologicalSort(adjacencyList, allIssueIds);

  // Step 4: Forward pass
  const forwardResults = forwardPass(sortedIds, adjacencyList, reverseAdjacencyList, getIssueDates);

  // Early exit: no forward pass results
  if (forwardResults.size === 0) {
    return new Map();
  }

  // Step 5: Backward pass
  const backwardResults = backwardPass(sortedIds, adjacencyList, reverseAdjacencyList, forwardResults);

  // Step 6: Compute final results with slack
  const cpmResults: CpmResultMap = new Map();
  for (const [issueId, fwdData] of forwardResults) {
    const bwdData = backwardResults.get(issueId);
    if (!bwdData) continue;

    const slack = daysBetween(fwdData.es, bwdData.ls);
    const isCritical = slack === 0;

    cpmResults.set(issueId, {
      es: fwdData.es,
      ef: fwdData.ef,
      ls: bwdData.ls,
      lf: bwdData.lf,
      slack,
      isCritical,
    });
  }

  return cpmResults;
}
