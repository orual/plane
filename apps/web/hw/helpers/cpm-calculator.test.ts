/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import type { TIssueRelationMap } from "@plane/types";
import {
  buildAdjacencyList,
  topologicalSort,
  forwardPass,
  CpmIssueDates,
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
});
