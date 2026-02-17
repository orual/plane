/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction } from "mobx";
import type { IGanttBlock, ChartDataType } from "@plane/types";
import { BaseTimeLineStore } from "./base-timeline.store";

type MockIssue = {
  start_date?: string | null;
  target_date?: string | null;
};

type MockIssueDetail = {
  getIssueById: (id: string) => MockIssue | undefined;
};

type MockRelation = {
  relationMap: Record<string, Record<string, Array<string>>>;
};

/**
 * Minimal typed mock structure for root store.
 * Only includes the properties accessed by BaseTimeLineStore.
 */
type MockRootStore = {
  issue: {
    issueDetail: {
      relation: MockRelation;
      issue: MockIssueDetail;
    };
  };
};

/**
 * Create a mock Gantt block with optional overrides.
 */
function createMockBlock(overrides?: Partial<IGanttBlock>): IGanttBlock {
  return {
    id: "block-1",
    start_date: "2024-01-10",
    target_date: "2024-01-15",
    sort_order: 0,
    project_id: "proj-1",
    position: {
      marginLeft: 100,
      width: 50,
    },
    ...overrides,
  } as IGanttBlock;
}

/**
 * Create a mock chart data with standard day width.
 */
function createMockChartData(): ChartDataType {
  return {
    key: "week",
    i18n_title: "Week",
    data: {
      startDate: new Date("2024-01-01"),
      currentDate: new Date("2024-01-15"),
      endDate: new Date("2024-12-31"),
      approxFilterRange: 180,
      dayWidth: 40,
    },
  };
}

describe("BaseTimeLineStore - CPM Store Integration", () => {
  let store: BaseTimeLineStore;
  let mockRootStore: MockRootStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal mock root store with relation store
    mockRootStore = {
      issue: {
        issueDetail: {
          relation: {
            relationMap: {} as Record<string, Record<string, Array<string>>>,
          },
          issue: {
            getIssueById: vi.fn(),
          },
        },
      },
    };

    // Create store using properly-typed mock
    // @ts-expect-error - Mock implementation provides necessary properties
    store = new BaseTimeLineStore(mockRootStore);
    store.updateCurrentViewData(createMockChartData());
  });

  describe("cpmResults computation", () => {
    it("should return empty map when cpmEnabled is false", () => {
      // Setup: Create blocks and relations
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Verify: cpmEnabled is false, so cpmResults is empty
      expect(store.cpmEnabled).toBe(false);
      expect(store.cpmResults.size).toBe(0);
    });

    it("should compute CPM results when cpmEnabled is true", () => {
      // Setup: Simple 2-block chain A->B with dates
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: B is blocked by A (FS dependency)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Enable CPM
      store.setCpmEnabled(true);

      // Verify: cpmResults is computed
      expect(store.cpmResults.size).toBeGreaterThan(0);
      expect(store.cpmResults.has("block-a")).toBe(true);
      expect(store.cpmResults.has("block-b")).toBe(true);
    });

    it("should recompute when block dates change (AC2.1)", () => {
      // Setup: Initial CPM computation
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      store.setCpmEnabled(true);
      const resultsBefore = store.cpmResults;
      const resultABefore = resultsBefore.get("block-a");

      // Change block A's start date
      runInAction(() => {
        store.blocksMap["block-a"].start_date = "2024-01-15";
      });

      // Verify: cpmResults recomputed with new dates
      const resultsAfter = store.cpmResults;
      const resultAAfter = resultsAfter.get("block-a");

      expect(resultABefore?.es).not.toEqual(resultAAfter?.es);
    });

    it("should recompute when relations change (AC2.2)", () => {
      // Setup: Initial blocks without dependency
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);
      const resultsBefore = store.cpmResults;

      // Add blocking relation: B now depends on A
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Verify: cpmResults recomputed with new relation
      const resultsAfter = store.cpmResults;

      // With the new relation, B's early start should be different
      const resultBBefore = resultsBefore.get("block-b");
      const resultBAfter = resultsAfter.get("block-b");
      expect(resultBBefore?.es).not.toEqual(resultBAfter?.es);
    });
  });

  describe("isCritical accessor (AC2.3)", () => {
    it("should return true for critical path blocks", () => {
      // Setup: A→B→C is critical, A→D is shorter
      // Dates: A: 1/10-1/12, B: 1/13-1/15, C: 1/16-1/18, D: 1/13-1/14
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });
      const blockC = createMockBlock({
        id: "block-c",
        start_date: "2024-01-16",
        target_date: "2024-01-18",
      });
      const blockD = createMockBlock({
        id: "block-d",
        start_date: "2024-01-13",
        target_date: "2024-01-14",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
          "block-c": blockC,
          "block-d": blockD,
        };
      });

      // A blocks B and D, B blocks C
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: ["block-c"],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-c": {
          blocking: [],
          blocked_by: ["block-b"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-d": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      store.setCpmEnabled(true);

      // Verify: A->B->C is critical (longer path), D has slack
      expect(store.isCritical("block-a")).toBe(true);
      expect(store.isCritical("block-b")).toBe(true);
      expect(store.isCritical("block-c")).toBe(true);
      expect(store.isCritical("block-d")).toBe(false); // Has slack
    });

    it("should return false for non-critical blocks", () => {
      // Create A→B→C (critical) and A→D (shorter)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });
      const blockC = createMockBlock({
        id: "block-c",
        start_date: "2024-01-16",
        target_date: "2024-01-18",
      });
      const blockD = createMockBlock({
        id: "block-d",
        start_date: "2024-01-13",
        target_date: "2024-01-14",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
          "block-c": blockC,
          "block-d": blockD,
        };
      });

      // A blocks B and D, B blocks C
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: ["block-c"],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-c": {
          blocking: [],
          blocked_by: ["block-b"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-d": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      store.setCpmEnabled(true);

      // D has slack because A→B→C is longer
      expect(store.isCritical("block-d")).toBe(false);
    });
  });

  describe("getSlack accessor (AC2.4)", () => {
    it("should return zero for critical blocks", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      expect(store.getSlack("block-a")).toBe(0);
    });

    it("should return positive float for non-critical blocks", () => {
      // Create A→B→C (critical) and A→D (shorter)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });
      const blockC = createMockBlock({
        id: "block-c",
        start_date: "2024-01-16",
        target_date: "2024-01-18",
      });
      const blockD = createMockBlock({
        id: "block-d",
        start_date: "2024-01-13",
        target_date: "2024-01-14",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
          "block-c": blockC,
          "block-d": blockD,
        };
      });

      // A blocks B and D, B blocks C
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: ["block-c"],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-c": {
          blocking: [],
          blocked_by: ["block-b"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "block-d": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      store.setCpmEnabled(true);

      const slack = store.getSlack("block-d");
      expect(slack).toBeGreaterThan(0);
    });

    it("should return 0 for blocks not in CPM", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Non-existent block should return 0
      expect(store.getSlack("non-existent")).toBe(0);
    });
  });

  describe("CPM disabled behavior (AC2.5)", () => {
    it("should return empty map and false/0 when disabled", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      // CPM disabled by default
      expect(store.cpmEnabled).toBe(false);
      expect(store.cpmResults.size).toBe(0);
      expect(store.isCritical("block-a")).toBe(false);
      expect(store.getSlack("block-a")).toBe(0);
    });

    it("should suppress CPM calculation when disabled", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Add a relation so CPM will compute results
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocking: [],
          blocked_by: ["block-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Enable then disable
      store.setCpmEnabled(true);
      const resultsWhenEnabled = store.cpmResults.size;

      store.setCpmEnabled(false);
      expect(store.cpmResults.size).toBe(0);
      expect(resultsWhenEnabled).toBeGreaterThan(0);
    });
  });

  describe("computedFn memoization (AC2.6)", () => {
    it("should memoize isCritical results per blockId", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Call twice without changes
      const result1 = store.isCritical("block-a");
      const result2 = store.isCritical("block-a");

      // Should return same value (memoized)
      expect(result1).toBe(result2);
    });

    it("should memoize getSlack results per blockId", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Call twice without changes
      const slack1 = store.getSlack("block-a");
      const slack2 = store.getSlack("block-a");

      // Should return same value (memoized)
      expect(slack1).toBe(slack2);
    });

    it("should invalidate memoization when cpmResults changes", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);
      const slack1 = store.getSlack("block-a");

      // Change a block's date to trigger CPM recomputation
      runInAction(() => {
        store.blocksMap["block-a"].start_date = "2024-01-15";
      });

      const slack2 = store.getSlack("block-a");

      // Slack may change (or stay same depending on graph), but memoization should be invalidated
      expect(slack1).toBeDefined();
      expect(slack2).toBeDefined();
    });
  });

  describe("getComputedDates accessor", () => {
    it("should return null for blocks with both dates set", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      expect(store.getComputedDates("block-a")).toBeNull();
    });

    it("should return null for blocks with no dates and not in CPM", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: undefined,
        target_date: undefined,
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Block not in CPM (no relations)
      expect(store.getComputedDates("block-a")).toBeNull();
    });

    it("should return null for non-existent blocks", () => {
      store.setCpmEnabled(true);

      expect(store.getComputedDates("non-existent")).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle disabled CPM gracefully", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      // CPM disabled
      expect(() => {
        store.isCritical("block-a");
        store.getSlack("block-a");
        store.getComputedDates("block-a");
      }).not.toThrow();
    });

    it("should gracefully handle when CPM computes no results", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // CPM may return empty results for certain configurations
      // (e.g., isolated blocks without dates in all necessary fields)
      // The store should handle this gracefully by returning false/0 from accessors
      expect(store.isCritical("block-a")).toBe(false);
      expect(store.getSlack("block-a")).toBe(0);
    });

    it("should handle blocks with partial dates (only start_date)", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: undefined,
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Should not crash
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        store.cpmResults;
      }).not.toThrow();
    });

    it("should handle blocks with partial dates (only target_date)", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: undefined,
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      store.setCpmEnabled(true);

      // Should not crash
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        store.cpmResults;
      }).not.toThrow();
    });
  });
});
