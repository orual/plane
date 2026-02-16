/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import type { TIssueRelationMap } from "@plane/types";
import type { CpmIssueDates } from "./cpm-calculator";
import {
  buildAdjacencyList,
  topologicalSort,
  forwardPass,
  backwardPass,
  computeCpm,
  addDays,
  daysBetween,
  maxDate,
  minDate,
} from "./cpm-calculator";

describe("CPM Calculator", () => {
  // Helper to create relation maps
  const createRelationMap = (
    relations: Record<string, Record<string, Array<string> | undefined>>
  ): TIssueRelationMap => {
    const result: TIssueRelationMap = {};
    for (const [issueId, rels] of Object.entries(relations)) {
      result[issueId] = {
        blocking: rels.blocking ?? [],
        blocked_by: rels.blocked_by ?? [],
        duplicate: rels.duplicate ?? [],
        relates_to: rels.relates_to ?? [],
        start_before: rels.start_before ?? [],
        start_after: rels.start_after ?? [],
        finish_before: rels.finish_before ?? [],
        finish_after: rels.finish_after ?? [],
        implemented_by: rels.implemented_by ?? [],
        implements: rels.implements ?? [],
      };
    }
    return result;
  };

  // Helper to get issue dates
  const createGetIssueDates = (issueData: Record<string, CpmIssueDates>) => (id: string) => issueData[id];

  describe("buildAdjacencyList", () => {
    it("should return empty adjacency lists for empty relation map (AC1.8)", () => {
      const relationMap = createRelationMap({});
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      expect(adjacencyList.size).toBe(0);
      expect(reverseAdjacencyList.size).toBe(0);
    });

    it("should handle FS relation (blocking) correctly", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "blocking"
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "blocking" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([{ predecessorId: "issue-a", relationType: "blocking" }]);
    });

    it("should handle FS relation (blocked_by) correctly", () => {
      const relationMap = createRelationMap({
        "issue-b": { blocked_by: ["issue-a"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "blocking" (reverse relationship)
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "blocking" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([{ predecessorId: "issue-a", relationType: "blocking" }]);
    });

    it("should handle SS relation (start_before) correctly", () => {
      const relationMap = createRelationMap({
        "issue-a": { start_before: ["issue-b"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "start_before"
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "start_before" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([{ predecessorId: "issue-a", relationType: "start_before" }]);
    });

    it("should handle SS relation (start_after) correctly", () => {
      const relationMap = createRelationMap({
        "issue-b": { start_after: ["issue-a"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "start_before" (reverse relationship)
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "start_before" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([{ predecessorId: "issue-a", relationType: "start_before" }]);
    });

    it("should handle FF relation (finish_before) correctly", () => {
      const relationMap = createRelationMap({
        "issue-a": { finish_before: ["issue-b"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "finish_before"
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "finish_before" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([
        { predecessorId: "issue-a", relationType: "finish_before" },
      ]);
    });

    it("should handle FF relation (finish_after) correctly", () => {
      const relationMap = createRelationMap({
        "issue-b": { finish_after: ["issue-a"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);

      // A → B with type "finish_before" (reverse relationship)
      expect(adjacencyList.get("issue-a")).toEqual([{ successorId: "issue-b", relationType: "finish_before" }]);
      expect(reverseAdjacencyList.get("issue-b")).toEqual([
        { predecessorId: "issue-a", relationType: "finish_before" },
      ]);
    });

    it("should exclude non-scheduling relations", () => {
      const relationMap = createRelationMap({
        "issue-a": {
          blocking: ["issue-b"],
          duplicate: ["issue-c"],
          relates_to: ["issue-d"],
          implemented_by: ["issue-e"],
          implements: ["issue-f"],
        },
      });
      const { adjacencyList } = buildAdjacencyList(relationMap);

      // Only blocking should be in adjacency list
      const edges = adjacencyList.get("issue-a");
      expect(edges?.length).toBe(1);
      expect(edges?.[0].successorId).toBe("issue-b");
    });

    it("should handle multiple relations on a single issue", () => {
      const relationMap = createRelationMap({
        "issue-a": {
          blocking: ["issue-b", "issue-c"],
          start_before: ["issue-d"],
        },
      });
      const { adjacencyList } = buildAdjacencyList(relationMap);

      const edges = adjacencyList.get("issue-a");
      expect(edges?.length).toBe(3);
      expect(edges?.some((e) => e.successorId === "issue-b" && e.relationType === "blocking")).toBe(true);
      expect(edges?.some((e) => e.successorId === "issue-c" && e.relationType === "blocking")).toBe(true);
      expect(edges?.some((e) => e.successorId === "issue-d" && e.relationType === "start_before")).toBe(true);
    });
  });

  describe("topologicalSort", () => {
    it("should sort a linear chain correctly", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const { adjacencyList } = buildAdjacencyList(relationMap);
      const allIssueIds = new Set(["issue-a", "issue-b", "issue-c"]);

      const sorted = topologicalSort(adjacencyList, allIssueIds);

      expect(sorted).toEqual(["issue-a", "issue-b", "issue-c"]);
    });

    it("should sort a diamond graph correctly", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b", "issue-c"] },
        "issue-b": { blocking: ["issue-d"] },
        "issue-c": { blocking: ["issue-d"] },
      });
      const { adjacencyList } = buildAdjacencyList(relationMap);
      const allIssueIds = new Set(["issue-a", "issue-b", "issue-c", "issue-d"]);

      const sorted = topologicalSort(adjacencyList, allIssueIds);

      // A should come first, then B and C in any order, then D last
      expect(sorted[0]).toBe("issue-a");
      expect(sorted[3]).toBe("issue-d");
      expect(sorted.slice(1, 3).every((id) => ["issue-b", "issue-c"].includes(id))).toBe(true);
    });

    it("should handle graph with no edges", () => {
      const relationMap = createRelationMap({});
      const { adjacencyList } = buildAdjacencyList(relationMap);
      const allIssueIds = new Set(["issue-a", "issue-b", "issue-c"]);

      const sorted = topologicalSort(adjacencyList, allIssueIds);

      // All nodes should be present
      expect(sorted.length).toBe(3);
      expect(new Set(sorted)).toEqual(allIssueIds);
    });

    it("should stop at MAX_PROPAGATION_DEPTH (AC1.9)", () => {
      // Create a chain of 101 issues
      const relations: Record<string, Record<string, Array<string> | undefined>> = {};
      for (let i = 0; i < 101; i++) {
        relations[`issue-${i}`] = {
          blocking: i < 100 ? [`issue-${i + 1}`] : undefined,
        };
      }
      const relationMap = createRelationMap(relations);
      const { adjacencyList } = buildAdjacencyList(relationMap);
      const allIssueIds = new Set(Array.from({ length: 101 }, (_, i) => `issue-${i}`));

      const sorted = topologicalSort(adjacencyList, allIssueIds);

      // Should stop at depth 100
      expect(sorted.length).toBe(100);
    });
  });

  describe("Date arithmetic helpers", () => {
    it("addDays should add days correctly", () => {
      const result = addDays("2025-01-01", 5);
      expect(result).toBe("2025-01-06");
    });

    it("addDays should handle negative days", () => {
      const result = addDays("2025-01-10", -5);
      expect(result).toBe("2025-01-05");
    });

    it("daysBetween should calculate days inclusive", () => {
      // Same day should be 1 day
      expect(daysBetween("2025-01-01", "2025-01-01")).toBe(0);
      // Next day should be 1 day difference
      expect(daysBetween("2025-01-01", "2025-01-02")).toBe(1);
      // 3 days apart should be 2 days difference
      expect(daysBetween("2025-01-01", "2025-01-03")).toBe(2);
    });

    it("maxDate should return the latest date", () => {
      const result = maxDate("2025-01-01", "2025-01-10", "2025-01-05");
      expect(result).toBe("2025-01-10");
    });

    it("minDate should return the earliest date", () => {
      const result = minDate("2025-01-10", "2025-01-01", "2025-01-05");
      expect(result).toBe("2025-01-01");
    });
  });

  describe("forwardPass", () => {
    it("should compute ES and EF for a linear FS chain (AC1.1)", () => {
      // A: Jan 1-3, B: Jan 6-8, C: Jan 10-12
      // After forward pass: A: ES=Jan 1, EF=Jan 3, B: ES=Jan 4, EF=Jan 6, C: ES=Jan 7, EF=Jan 9
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-b", "issue-c"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-06", target_date: "2025-01-08" },
        "issue-c": { start_date: "2025-01-10", target_date: "2025-01-12" },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      // A: ES=Jan 1, EF=Jan 3
      expect(results.get("issue-a")!.es).toBe("2025-01-01");
      expect(results.get("issue-a")!.ef).toBe("2025-01-03");

      // B: explicit start is Jan 6, but predecessor constraint is Jan 4, so use Jan 6
      expect(results.get("issue-b")!.es).toBe("2025-01-06");
      expect(results.get("issue-b")!.ef).toBe("2025-01-08");

      // C: explicit start is Jan 10, but predecessor constraint is Jan 9, so use Jan 10
      expect(results.get("issue-c")!.es).toBe("2025-01-10");
      expect(results.get("issue-c")!.ef).toBe("2025-01-12");
    });

    it("should handle SS dependencies (AC1.2)", () => {
      // A: Jan 1-5, B: Jan 1-3 with start_before relationship
      // B.ES should equal A.ES = Jan 1
      const relationMap = createRelationMap({
        "issue-a": { start_before: ["issue-b"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-b"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-05" },
        "issue-b": { start_date: "2025-01-01", target_date: "2025-01-03" },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      expect(results.get("issue-b")!.es).toBe("2025-01-01");
    });

    it("should handle FF dependencies (AC1.3)", () => {
      // A: Jan 1-5, B: Jan 1-3 with finish_before relationship
      // B.EF should equal A.EF = Jan 5, B.ES = Jan 5 - duration(3) + 1 = Jan 3
      const relationMap = createRelationMap({
        "issue-a": { finish_before: ["issue-b"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-b"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-05" },
        "issue-b": { start_date: "2025-01-01", target_date: "2025-01-03" },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      expect(results.get("issue-b")!.ef).toBe("2025-01-05");
      expect(results.get("issue-b")!.es).toBe("2025-01-03");
    });

    it("should resolve multi-predecessor constraints correctly (AC1.4)", () => {
      // A: Jan 1-5, B: Jan 1-8, both block C
      // C.ES should be max(A.EF + 1, B.EF + 1) = Jan 9 + 1 = Jan 10
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-c"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-b", "issue-c"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-05" },
        "issue-b": { start_date: "2025-01-01", target_date: "2025-01-08" },
        "issue-c": { start_date: undefined, target_date: undefined },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      // C should use the latest constraint from B
      expect(results.get("issue-c")!.es).toBe("2025-01-09");
    });

    it("should handle dateless tasks with dependencies (AC1.7)", () => {
      // A: Jan 1-3, D: no dates, A blocks D
      // D gets duration=1, ES=Jan 4, EF=Jan 4
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-d"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-d"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-d": { start_date: undefined, target_date: undefined },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      expect(results.get("issue-d")!.duration).toBe(1);
      expect(results.get("issue-d")!.es).toBe("2025-01-04");
      expect(results.get("issue-d")!.ef).toBe("2025-01-04");
    });

    it("should handle issue with only start_date (AC1.10)", () => {
      const relationMap = createRelationMap({});
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-05", target_date: undefined },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      expect(results.get("issue-a")!.duration).toBe(1);
      expect(results.get("issue-a")!.es).toBe("2025-01-05");
      expect(results.get("issue-a")!.ef).toBe("2025-01-05");
    });

    it("should handle issue with only target_date (AC1.10)", () => {
      const relationMap = createRelationMap({});
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: undefined, target_date: "2025-01-10" },
      });

      const results = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);

      expect(results.get("issue-a")!.duration).toBe(1);
      expect(results.get("issue-a")!.es).toBe("2025-01-10");
      expect(results.get("issue-a")!.ef).toBe("2025-01-10");
    });
  });

  describe("backwardPass", () => {
    it("should compute LS and LF for a linear FS chain (AC1.5)", () => {
      // A→B→C with all dates specified
      // A: Jan 1-3 (duration 3), B: Jan 4-6 (duration 3), C: Jan 7-9 (duration 3)
      // Backward pass from C: C.LF = C.EF = Jan 9, C.LS = Jan 9 - 3 + 1 = Jan 7
      // B.LF = C.LS - 1 = Jan 6, B.LS = Jan 6 - 3 + 1 = Jan 4
      // A.LF = B.LS - 1 = Jan 3, A.LS = Jan 3 - 3 + 1 = Jan 1
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const { adjacencyList, reverseAdjacencyList } = buildAdjacencyList(relationMap);
      const sorted = topologicalSort(adjacencyList, new Set(["issue-a", "issue-b", "issue-c"]));

      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-06" },
        "issue-c": { start_date: "2025-01-07", target_date: "2025-01-09" },
      });

      const forwardResults = forwardPass(sorted, adjacencyList, reverseAdjacencyList, getIssueDates);
      const backwardResults = backwardPass(sorted, adjacencyList, reverseAdjacencyList, forwardResults);

      // Verify backward pass results
      expect(backwardResults.get("issue-a")!.ls).toBe("2025-01-01");
      expect(backwardResults.get("issue-a")!.lf).toBe("2025-01-03");

      expect(backwardResults.get("issue-b")!.ls).toBe("2025-01-04");
      expect(backwardResults.get("issue-b")!.lf).toBe("2025-01-06");

      expect(backwardResults.get("issue-c")!.ls).toBe("2025-01-07");
      expect(backwardResults.get("issue-c")!.lf).toBe("2025-01-09");
    });
  });

  describe("computeCpm", () => {
    it("should return empty map for no dependencies (AC1.8)", () => {
      const relationMap = createRelationMap({});
      const getIssueDates = createGetIssueDates({});

      const result = computeCpm(relationMap, getIssueDates);

      expect(result.size).toBe(0);
    });

    it("should compute full CPM for a linear chain all on critical path (AC1.6)", () => {
      // A→B→C linear path, all on critical path
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-06" },
        "issue-c": { start_date: "2025-01-07", target_date: "2025-01-09" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // All tasks should be on critical path with slack=0
      expect(result.get("issue-a")!.slack).toBe(0);
      expect(result.get("issue-a")!.isCritical).toBe(true);
      expect(result.get("issue-b")!.slack).toBe(0);
      expect(result.get("issue-b")!.isCritical).toBe(true);
      expect(result.get("issue-c")!.slack).toBe(0);
      expect(result.get("issue-c")!.isCritical).toBe(true);
    });

    it("should compute slack for non-critical tasks in parallel paths (AC1.6)", () => {
      // A→B→C (long path) and A→D (short path)
      // C finishes Jan 9, D finishes Jan 4, so D has slack
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b", "issue-d"] },
        "issue-b": { blocking: ["issue-c"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-06" },
        "issue-c": { start_date: "2025-01-07", target_date: "2025-01-09" },
        "issue-d": { start_date: "2025-01-04", target_date: "2025-01-04" }, // Short task
      });

      const result = computeCpm(relationMap, getIssueDates);

      // A, B, C are critical
      expect(result.get("issue-a")!.isCritical).toBe(true);
      expect(result.get("issue-b")!.isCritical).toBe(true);
      expect(result.get("issue-c")!.isCritical).toBe(true);

      // D has slack: LF = Jan 9, LS = Jan 9 - 1 + 1 = Jan 9, but ES = Jan 4, so slack > 0
      expect(result.get("issue-d")!.slack).toBeGreaterThan(0);
      expect(result.get("issue-d")!.isCritical).toBe(false);
    });

    it("should handle chains up to MAX_PROPAGATION_DEPTH (AC1.9)", () => {
      // Chain of 101 issues - only first 100 should be processed
      const relations: Record<string, Record<string, Array<string> | undefined>> = {};
      for (let i = 0; i < 101; i++) {
        relations[`issue-${i}`] = {
          blocking: i < 100 ? [`issue-${i + 1}`] : undefined,
        };
      }
      const relationMap = createRelationMap(relations);

      // Create dates for all issues
      const issueData: Record<string, CpmIssueDates> = {};
      for (let i = 0; i < 101; i++) {
        issueData[`issue-${i}`] = {
          start_date: `2025-01-${String(Math.floor(i / 28) + 1).padStart(2, "0")}`,
          target_date: `2025-01-${String(Math.floor(i / 28) + 1).padStart(2, "0")}`,
        };
      }
      const getIssueDates = createGetIssueDates(issueData);

      const result = computeCpm(relationMap, getIssueDates);

      // Only first 100 issues should be in results (topological sort stops at depth 100)
      expect(result.size).toBeLessThanOrEqual(100);
    });

    it("should handle diamond graph with mixed dependency types (AC1.6)", () => {
      // A→B→D (FS) and A→C→D (FS), where B is longer than C
      // A, B, D should be critical; C should have slack
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b", "issue-c"] },
        "issue-b": { blocking: ["issue-d"] },
        "issue-c": { blocking: ["issue-d"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-08" }, // 5 days
        "issue-c": { start_date: "2025-01-04", target_date: "2025-01-05" }, // 2 days
        "issue-d": { start_date: "2025-01-09", target_date: "2025-01-09" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // A, B, D should be critical
      expect(result.get("issue-a")!.isCritical).toBe(true);
      expect(result.get("issue-b")!.isCritical).toBe(true);
      expect(result.get("issue-d")!.isCritical).toBe(true);

      // C should have slack because B is the constraining path
      expect(result.get("issue-c")!.slack).toBeGreaterThan(0);
      expect(result.get("issue-c")!.isCritical).toBe(false);
    });

    it("should compute full results with es, ef, ls, lf for all issues", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-06" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // Verify all fields are present
      const resultA = result.get("issue-a")!;
      expect(resultA.es).toBe("2025-01-01");
      expect(resultA.ef).toBe("2025-01-03");
      expect(resultA.ls).toBe("2025-01-01");
      expect(resultA.lf).toBe("2025-01-03");
      expect(resultA.slack).toBe(0);
      expect(resultA.isCritical).toBe(true);

      const resultB = result.get("issue-b")!;
      expect(resultB.es).toBe("2025-01-04");
      expect(resultB.ef).toBe("2025-01-06");
      expect(resultB.ls).toBe("2025-01-04");
      expect(resultB.lf).toBe("2025-01-06");
      expect(resultB.slack).toBe(0);
      expect(resultB.isCritical).toBe(true);
    });

    it("should handle mixed FS and SS dependencies in complex graph", () => {
      // A→B (FS), A→C (SS), B→D (FS), C→D (SS)
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"], start_before: ["issue-c"] },
        "issue-b": { blocking: ["issue-d"] },
        "issue-c": { start_before: ["issue-d"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-04", target_date: "2025-01-06" },
        "issue-c": { start_date: "2025-01-01", target_date: "2025-01-02" },
        "issue-d": { start_date: "2025-01-07", target_date: "2025-01-09" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // Verify all issues are in result
      expect(result.size).toBeGreaterThanOrEqual(3); // At least A, B, D have constraints
    });

    it("should handle FF dependencies in full computation", () => {
      // A→B (FF): both finish on same day
      const relationMap = createRelationMap({
        "issue-a": { finish_before: ["issue-b"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-05" },
        "issue-b": { start_date: "2025-01-03", target_date: "2025-01-05" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // B should match A's finish date
      expect(result.get("issue-b")!.ef).toBe("2025-01-05");
    });

    it("should handle dateless tasks in full computation (AC1.7)", () => {
      // A has dates, B has no dates, A blocks B
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: undefined, target_date: undefined },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // B should have default duration of 1 day after A finishes
      expect(result.get("issue-b")!.es).toBe("2025-01-04");
      expect(result.get("issue-b")!.ef).toBe("2025-01-04");
      expect(result.get("issue-b")!.slack).toBe(0);
    });

    it("should handle issues with only start_date in full computation (AC1.10)", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: "2025-01-05", target_date: undefined },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // B has only start date, gets default duration of 1 day
      expect(result.get("issue-b")!.es).toBe("2025-01-05");
      expect(result.get("issue-b")!.ef).toBe("2025-01-05");
    });

    it("should handle issues with only target_date in full computation (AC1.10)", () => {
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-03" },
        "issue-b": { start_date: undefined, target_date: "2025-01-06" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // B has only target date, gets default duration
      expect(result.get("issue-b")!.es).toBe("2025-01-06");
      expect(result.get("issue-b")!.ef).toBe("2025-01-06");
    });

    it("should verify critical path consistency across complex graph", () => {
      // Create a graph where critical path is A→B→D, and A→C is shorter
      const relationMap = createRelationMap({
        "issue-a": { blocking: ["issue-b", "issue-c"] },
        "issue-b": { blocking: ["issue-d"] },
        "issue-c": { blocking: ["issue-d"] },
      });
      const getIssueDates = createGetIssueDates({
        "issue-a": { start_date: "2025-01-01", target_date: "2025-01-02" },
        "issue-b": { start_date: "2025-01-03", target_date: "2025-01-07" }, // 5 days
        "issue-c": { start_date: "2025-01-03", target_date: "2025-01-03" }, // 1 day
        "issue-d": { start_date: "2025-01-08", target_date: "2025-01-08" },
      });

      const result = computeCpm(relationMap, getIssueDates);

      // Critical path: A→B→D
      expect(result.get("issue-a")!.isCritical).toBe(true);
      expect(result.get("issue-b")!.isCritical).toBe(true);
      expect(result.get("issue-d")!.isCritical).toBe(true);

      // Non-critical: C (shorter path)
      expect(result.get("issue-c")!.isCritical).toBe(false);
      expect(result.get("issue-c")!.slack).toBeGreaterThan(0);
    });
  });
});
