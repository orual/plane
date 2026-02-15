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

describe("BaseTimeLineStore - Conflict Detection", () => {
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

  describe("hasConflict", () => {
    it("should detect conflict when FS predecessor is not finished", () => {
      // Setup: Block A has target_date=2024-01-12, Block B has start_date=2024-01-10 (starts before A finishes)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
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

      // Setup relations: B is blocked by A
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      // B has conflict because it starts before A finishes
      expect(store.hasConflict("block-b")).toBe(true);
    });

    it("should not detect conflict when dates satisfy FS constraint", () => {
      // Setup: Block A finishes on 2024-01-12, Block B starts on 2024-01-14 (one day gap is OK)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-14",
        target_date: "2024-01-20",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      expect(store.hasConflict("block-b")).toBe(false);
    });

    it("should return false when issue has no dates", () => {
      // Setup: Block B has no dates
      const blockB = createMockBlock({
        id: "block-b",
        start_date: null,
        target_date: null,
      });

      runInAction(() => {
        store.blocksMap = { "block-b": blockB };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      expect(store.hasConflict("block-b")).toBe(false);
    });

    it("should update reactively when dates change", () => {
      // Setup: Initial conflict exists
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
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

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      // Verify initial conflict
      expect(store.hasConflict("block-b")).toBe(true);

      // Update B's start_date to resolve conflict
      runInAction(() => {
        store.blocksMap["block-b"].start_date = "2024-01-14";
      });

      // Verify conflict is now gone (reactivity)
      expect(store.hasConflict("block-b")).toBe(false);
    });
  });

  describe("getDependencyConflicts", () => {
    it("should include conflict message with predecessor ID", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
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

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const conflicts = store.getDependencyConflicts("block-b");

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        predecessorIssueId: "block-a",
        relationType: "blocked_by",
      });
      expect(conflicts[0].message).toContain("block-a");
      expect(conflicts[0].message).toContain("blocking");
    });

    it("should detect SS (start_after) conflict", () => {
      // Block A starts on 2024-01-10, Block B starts on 2024-01-05 (before A)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-05",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: [],
          start_after: ["block-a"],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const conflicts = store.getDependencyConflicts("block-b");

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        predecessorIssueId: "block-a",
        relationType: "start_after",
      });
      expect(conflicts[0].message).toContain("start after");
    });

    it("should detect FF (finish_after) conflict", () => {
      // Block A finishes on 2024-01-15, Block B finishes on 2024-01-10 (before A)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-05",
        target_date: "2024-01-10",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: [],
          start_after: [],
          finish_after: ["block-a"],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const conflicts = store.getDependencyConflicts("block-b");

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        predecessorIssueId: "block-a",
        relationType: "finish_after",
      });
      expect(conflicts[0].message).toContain("finish after");
    });

    it("should detect multiple conflicts from different predecessors", () => {
      // Block B depends on both A (FS conflict) and C (SS conflict)
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
        target_date: "2024-01-12",
      });
      const blockC = createMockBlock({
        id: "block-c",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-05",
        target_date: "2024-01-20",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
          "block-c": blockC,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: ["block-c"],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const conflicts = store.getDependencyConflicts("block-b");

      expect(conflicts).toHaveLength(2);
      expect(conflicts.some((c) => c.predecessorIssueId === "block-a")).toBe(true);
      expect(conflicts.some((c) => c.predecessorIssueId === "block-c")).toBe(true);
    });

    it("should return empty array when no conflicts exist", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-14",
        target_date: "2024-01-20",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      expect(store.getDependencyConflicts("block-b")).toHaveLength(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle non-existent block gracefully", () => {
      expect(store.getDependencyConflicts("non-existent")).toHaveLength(0);
      expect(store.hasConflict("non-existent")).toBe(false);
    });

    it("should skip predecessors with no dates", () => {
      // Block B depends on A, but A has no dates
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = { "block-b": blockB };
      });

      // A is not in blocksMap, fallback to issue store which returns no dates
      // Use vi.fn() typed as the getIssueById function
      const getIssueFn = vi.fn<[id: string], MockIssue | undefined>();
      getIssueFn.mockReturnValue({
        start_date: null,
        target_date: null,
      });
      mockRootStore.issue.issueDetail.issue.getIssueById = getIssueFn;

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-b": {
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      expect(store.getDependencyConflicts("block-b")).toHaveLength(0);
    });

    it("should handle block with no relations", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-08",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {};

      expect(store.getDependencyConflicts("block-a")).toHaveLength(0);
      expect(store.hasConflict("block-a")).toBe(false);
    });

    it("should handle partial dates (only start_date)", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: "2024-01-10",
        target_date: null,
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-05",
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
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      // FS conflict cannot be detected without predecessor's target_date
      expect(store.getDependencyConflicts("block-b")).toHaveLength(0);
    });

    it("should handle partial dates (only target_date)", () => {
      const blockA = createMockBlock({
        id: "block-a",
        start_date: null,
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "block-b",
        start_date: "2024-01-05",
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
          blocked_by: ["block-a"],
          start_after: [],
          finish_after: [],
          blocking: [],
          start_before: [],
          finish_before: [],
          implements: [],
          implemented_by: [],
          relates_to: [],
          duplicate: [],
        },
      };

      // FS conflict can be detected because A has target_date and B has start_date
      expect(store.getDependencyConflicts("block-b")).toHaveLength(1);
    });
  });
});
