/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction } from "mobx";
import type { IGanttBlock, ChartDataType } from "@plane/types";
import { BaseTimeLineStore } from "../../../store/timeline/base-timeline.store";

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

describe("cpm-critical-path.AC4 - Critical path visualization", () => {
  let store: BaseTimeLineStore;
  let mockRootStore: MockRootStore;

  beforeEach(() => {
    vi.clearAllMocks();

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

    // @ts-expect-error - Mock implementation provides necessary properties
    store = new BaseTimeLineStore(mockRootStore);
    store.updateCurrentViewData(createMockChartData());
  });

  describe("AC4.1 & AC4.7: CPM toggle state default and control", () => {
    it("should have cpmEnabled default to false (AC4.7)", () => {
      // Verify: CPM toggle is off by default on page load
      expect(store.cpmEnabled).toBe(false);
    });

    it("should allow setCpmEnabled to toggle CPM on", () => {
      // Verify initial state
      expect(store.cpmEnabled).toBe(false);

      // Enable CPM
      store.setCpmEnabled(true);

      // Verify enabled
      expect(store.cpmEnabled).toBe(true);
    });

    it("should allow setCpmEnabled to toggle CPM off", () => {
      // Setup: Enable CPM first
      store.setCpmEnabled(true);
      expect(store.cpmEnabled).toBe(true);

      // Disable CPM
      store.setCpmEnabled(false);

      // Verify disabled
      expect(store.cpmEnabled).toBe(false);
    });
  });

  describe("AC4.2 & AC4.4: Critical block styling (red background vs default)", () => {
    it("should return true for isCritical when block has zero slack and CPM is enabled (AC4.2)", () => {
      // Setup: Simple 2-block chain A→B (both critical)
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

      // Enable CPM
      store.setCpmEnabled(true);

      // Verify: Blocks in critical path are critical (zero slack)
      expect(store.isCritical("block-a")).toBe(true);
      expect(store.isCritical("block-b")).toBe(true);
    });

    it("should return false for isCritical when block has slack and CPM is enabled (AC4.4)", () => {
      // Setup: A→B→C is critical, A→D is shorter (D has slack)
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

      // Verify: D is non-critical (has slack)
      expect(store.isCritical("block-d")).toBe(false);
      // A, B, C are critical
      expect(store.isCritical("block-a")).toBe(true);
      expect(store.isCritical("block-b")).toBe(true);
      expect(store.isCritical("block-c")).toBe(true);
    });

    it("should return false for all blocks when CPM is disabled (AC4.6)", () => {
      // Setup: Create a critical path
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

      // CPM is disabled
      expect(store.cpmEnabled).toBe(false);

      // Verify: No blocks marked as critical
      expect(store.isCritical("block-a")).toBe(false);
      expect(store.isCritical("block-b")).toBe(false);
    });
  });

  describe("AC4.3 & AC4.6: Connector styling (red for critical path)", () => {
    it("should evaluate isCriticalPath logic correctly when both source and target are critical (AC4.3)", () => {
      // Setup: A→B is critical path
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

      // Verify: Both are critical
      const sourceIsCritical = store.isCritical("block-a");
      const targetIsCritical = store.isCritical("block-b");
      const isCriticalPath = store.cpmEnabled && sourceIsCritical && targetIsCritical;

      expect(sourceIsCritical).toBe(true);
      expect(targetIsCritical).toBe(true);
      expect(isCriticalPath).toBe(true);
    });

    it("should evaluate isCriticalPath as false when only source is critical (AC4.3)", () => {
      // Setup: A→B→C is critical, A→D is shorter (D has slack)
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

      // A→D: A is critical, D is not
      const sourceIsCriticalAD = store.isCritical("block-a");
      const targetIsCriticalAD = store.isCritical("block-d");
      const isCriticalPathAD = store.cpmEnabled && sourceIsCriticalAD && targetIsCriticalAD;

      expect(sourceIsCriticalAD).toBe(true);
      expect(targetIsCriticalAD).toBe(false);
      expect(isCriticalPathAD).toBe(false);
    });

    it("should evaluate isCriticalPath as false when only target is critical (AC4.3)", () => {
      // Setup: A→B→C is critical, D→C where D has slack
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
          blocking: ["block-c"],
          blocked_by: [],
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

      // D→C: D is not critical, C is critical
      const sourceIsCriticalDC = store.isCritical("block-d");
      const targetIsCriticalDC = store.isCritical("block-c");
      const isCriticalPathDC = store.cpmEnabled && sourceIsCriticalDC && targetIsCriticalDC;

      expect(sourceIsCriticalDC).toBe(false);
      expect(targetIsCriticalDC).toBe(true);
      expect(isCriticalPathDC).toBe(false);
    });

    it("should evaluate isCriticalPath as false when CPM is disabled (AC4.6)", () => {
      // Setup: A→B (would be critical)
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

      // CPM is disabled
      expect(store.cpmEnabled).toBe(false);

      // Verify: isCriticalPath would be false
      const isCriticalPath = store.cpmEnabled && store.isCritical("block-a") && store.isCritical("block-b");

      expect(isCriticalPath).toBe(false);
    });
  });

  describe("AC4.5: Critical + computed blocks show red fill with dashed border", () => {
    it("should return non-null computedDates for blocks with missing dates in CPM results", () => {
      // Setup: Block with missing dates that gets computed
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: undefined, // Missing start_date
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

      // Verify: B should have computed dates
      const computedDates = store.getComputedDates("block-b");
      const isCritical = store.isCritical("block-b");

      // Critical + computed blocks should have both properties
      expect(isCritical).toBe(true);
      // B has missing start_date so should be computed
      expect(computedDates).not.toBeNull();
    });

    it("should return null for blocks with both dates already set (AC4.5)", () => {
      // Setup: Block with both dates set
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

      // Verify: A has no computed dates (both dates are set)
      const computedDates = store.getComputedDates("block-a");
      expect(computedDates).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle isCritical gracefully when CPM is disabled", () => {
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
      }).not.toThrow();

      expect(store.isCritical("block-a")).toBe(false);
    });

    it("should handle isCriticalPath evaluation for non-existent blocks", () => {
      store.setCpmEnabled(true);

      // Both blocks don't exist
      const sourceExists = store.isCritical("non-existent-source");
      const targetExists = store.isCritical("non-existent-target");
      const isCriticalPath = store.cpmEnabled && sourceExists && targetExists;

      expect(isCriticalPath).toBe(false);
    });

    it("should handle toggling CPM on and off multiple times", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      // Toggle multiple times
      store.setCpmEnabled(true);
      expect(store.cpmEnabled).toBe(true);

      store.setCpmEnabled(false);
      expect(store.cpmEnabled).toBe(false);

      store.setCpmEnabled(true);
      expect(store.cpmEnabled).toBe(true);

      store.setCpmEnabled(false);
      expect(store.cpmEnabled).toBe(false);
    });

    it("should maintain correct isCritical state after CPM toggle", () => {
      // Setup: Simple 2-block chain A→B
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
      const criticalWhenEnabled = store.isCritical("block-a");

      store.setCpmEnabled(false);
      const criticalWhenDisabled = store.isCritical("block-a");

      store.setCpmEnabled(true);
      const criticalWhenReEnabled = store.isCritical("block-a");

      // Should be critical when enabled, false when disabled
      expect(criticalWhenEnabled).toBe(true);
      expect(criticalWhenDisabled).toBe(false);
      expect(criticalWhenReEnabled).toBe(true);
    });
  });
});
