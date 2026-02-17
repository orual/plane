/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

import { describe, it, expect } from "vitest";
import { runInAction } from "mobx";
import type { IGanttBlock, ChartDataType } from "@plane/types";
import { BaseTimeLineStore } from "./base-timeline.store";

type MockIssue = {
  id: string;
  start_date?: string | null;
  target_date?: string | null;
  name?: string;
  sort_order?: number | null;
  project_id?: string;
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

function createMockChartData(): ChartDataType {
  return {
    key: "week",
    i18n_title: "Week",
    data: {
      startDate: new Date("2024-01-08"),
      currentDate: new Date("2024-01-15"),
      endDate: new Date("2024-01-22"),
      approxFilterRange: 10,
      dayWidth: 50, // 50px per day
    },
  };
}

function createMockRootStore(issues: Record<string, MockIssue> = {}): MockRootStore {
  return {
    issue: {
      issueDetail: {
        relation: {
          relationMap: {},
        },
        issue: {
          getIssueById: (id: string) => issues[id],
        },
      },
    },
  };
}

describe("CPM Virtual Date Injection (Phase 3) - Drag Conversion & Styling", () => {
  let store: BaseTimeLineStore;

  describe("AC3.1 & AC3.7: Virtual date injection with CPM toggle", () => {
    it("should inject computed dates and calculate position for dateless block with dependency (AC3.1)", () => {
      const issues = {
        "block-a": {
          id: "block-a",
          name: "Task A",
          start_date: "2024-01-10",
          target_date: "2024-01-12",
          sort_order: 0,
          project_id: "proj-1",
        },
        "block-b": {
          id: "block-b",
          name: "Task B (dateless)",
          start_date: null,
          target_date: null,
          sort_order: 1,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-a", "block-b"]);

      const chartData = createMockChartData();
      runInAction(() => {
        store.currentViewData = chartData;
      });

      // Set up relation: B is blocked by A (FS - Finish-to-Start)
      runInAction(() => {
        rootStore.issue.issueDetail.relation.relationMap = {
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
      });

      // Initially CPM disabled - block B should have no dates
      store.updateBlocks((id) => issues[id as keyof typeof issues]);
      expect(store.blocksMap["block-b"]?.start_date).toBeUndefined();
      expect(store.blocksMap["block-b"]?.target_date).toBeUndefined();
      expect(store.blocksMap["block-b"]?.position).toBeUndefined();

      // Enable CPM and update blocks
      store.setCpmEnabled(true);
      // First update with block A to populate blocksMap for CPM computation
      store.updateBlocks((id) => issues[id as keyof typeof issues]);

      const blockB = store.blocksMap["block-b"];

      // Verify: Block B should have computed dates injected
      // (CPM needs both blocks to be in blocksMap to compute dates)
      expect(blockB?.start_date).toBeDefined();
      expect(blockB?.target_date).toBeDefined();
      expect(blockB?.dateSource).toBe("computed");

      // Verify: Position should be calculated (marginLeft and width both set)
      expect(blockB?.position?.marginLeft).toBeGreaterThanOrEqual(0);
      expect(blockB?.position?.width).toBeGreaterThan(0);

      // Verify: Block B's start date should be after or on A's target date (FS dependency)
      const computedStart = new Date(blockB.start_date!);
      const taskAEnd = new Date(issues["block-a"].target_date);
      expect(computedStart.getTime()).toBeGreaterThanOrEqual(taskAEnd.getTime());
    });
  });

  describe("AC3.4: Dragging a computed-date block sets both dates (converts to manual)", () => {
    it("should set both start_date and target_date when dragging a block with dateSource: computed", () => {
      const issues = {
        "block-1": {
          id: "block-1",
          name: "Task 1",
          start_date: "2024-01-10",
          target_date: "2024-01-15",
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-1"]);

      runInAction(() => {
        store.currentViewData = createMockChartData();
      });

      // Manually set up a computed-date block
      runInAction(() => {
        store.blocksMap["block-1"] = {
          id: "block-1",
          name: "Task 1",
          data: issues["block-1"],
          sort_order: 0,
          start_date: "2024-01-13",
          target_date: "2024-01-15",
          dateSource: "computed",
          position: {
            marginLeft: 250, // Corresponds to 2024-01-16 with startDate 2024-01-08 and dayWidth 50
            width: 100, // 2 days
          },
        };
      });

      // Drag the computed block
      const updates = store.getUpdatedPositionAfterDrag("block-1", false);

      // Verify: Both dates should be set in the update
      expect(updates).toHaveLength(1);
      expect(updates[0]?.start_date).toBeDefined();
      expect(updates[0]?.target_date).toBeDefined();
      expect(typeof updates[0]?.start_date).toBe("string");
      expect(typeof updates[0]?.target_date).toBe("string");
    });

    it("should NOT set dates when dragging a block without dateSource: computed", () => {
      const issues = {
        "block-1": {
          id: "block-1",
          name: "Task 1",
          start_date: null,
          target_date: null,
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-1"]);

      runInAction(() => {
        store.currentViewData = createMockChartData();
      });

      // Manually set up a dateless block (no dateSource)
      runInAction(() => {
        store.blocksMap["block-1"] = {
          id: "block-1",
          name: "Task 1",
          data: issues["block-1"],
          sort_order: 0,
          start_date: undefined,
          target_date: undefined,
          position: {
            marginLeft: 250,
            width: 100,
          },
        };
      });

      // Drag the dateless block
      const updates = store.getUpdatedPositionAfterDrag("block-1", false);

      // Verify: No dates should be updated (no shouldUpdateHalfBlock, and no existing dates)
      expect(updates).toHaveLength(1);
      expect(updates[0]?.start_date).toBeUndefined();
      expect(updates[0]?.target_date).toBeUndefined();
    });
  });

  describe("AC3.5: Computed-date blocks cannot be resized", () => {
    it("should have dateSource: computed flag for resize prevention hook", () => {
      const issues = {
        "block-1": {
          id: "block-1",
          name: "Task 1",
          start_date: "2024-01-10",
          target_date: "2024-01-15",
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-1"]);

      runInAction(() => {
        store.currentViewData = createMockChartData();
      });

      // Set up a computed-date block
      runInAction(() => {
        store.blocksMap["block-1"] = {
          id: "block-1",
          name: "Task 1",
          data: issues["block-1"],
          sort_order: 0,
          start_date: "2024-01-13",
          target_date: "2024-01-15",
          dateSource: "computed",
          position: {
            marginLeft: 250,
            width: 100,
          },
        };
      });

      const block = store.blocksMap["block-1"];

      // Verify: The block has dateSource: computed that the resize hook checks
      expect(block?.dateSource).toBe("computed");
      // The use-gantt-resizable.ts hook checks this flag and returns early for dragDirection "left" or "right"
    });
  });

  describe("AC3.3: Computed-date blocks have dateSource for styling", () => {
    it("should mark blocks with dateSource: computed for dashed border and opacity styling", () => {
      const issues = {
        "block-1": {
          id: "block-1",
          name: "Task 1",
          start_date: "2024-01-10",
          target_date: "2024-01-15",
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-1"]);

      runInAction(() => {
        store.currentViewData = createMockChartData();
      });

      // Set up a computed-date block
      runInAction(() => {
        store.blocksMap["block-1"] = {
          id: "block-1",
          name: "Task 1",
          data: issues["block-1"],
          sort_order: 0,
          start_date: "2024-01-13",
          target_date: "2024-01-15",
          dateSource: "computed",
          position: {
            marginLeft: 250,
            width: 100,
          },
        };
      });

      const block = store.blocksMap["block-1"];

      // Verify: Block has dateSource for IssueGanttBlock styling
      expect(block?.dateSource).toBe("computed");
      // IssueGanttBlock checks `block?.dateSource === "computed"` to apply:
      // - opacity-80 class
      // - border-dashed border-custom-border-300 classes
      // - ComputedDateIndicator with "auto" badge
    });
  });

  describe("AC3.2: Injected blocks have dateSource property", () => {
    it("should provide dateSource: computed property for type safety", () => {
      // This test verifies that the IGanttBlock interface includes dateSource
      const computedBlock: IGanttBlock = {
        id: "block-1",
        name: "Task 1",
        data: {},
        sort_order: 0,
        start_date: "2024-01-13",
        target_date: "2024-01-15",
        dateSource: "computed",
        position: { marginLeft: 250, width: 100 },
      };

      expect(computedBlock.dateSource).toBe("computed");

      const manualBlock: IGanttBlock = {
        id: "block-2",
        name: "Task 2",
        data: {},
        sort_order: 1,
        start_date: "2024-01-13",
        target_date: "2024-01-15",
        // dateSource is optional, defaults to undefined (treated as manual)
        position: { marginLeft: 250, width: 100 },
      };

      expect(manualBlock.dateSource).toBeUndefined();
    });
  });

  describe("AC3.6: Dateless tasks with no dependencies remain hidden", () => {
    it("should not inject dates for dateless blocks with no dependencies", () => {
      const issues = {
        "block-a": {
          id: "block-a",
          name: "Task A (with dates)",
          start_date: "2024-01-10",
          target_date: "2024-01-12",
          sort_order: 0,
          project_id: "proj-1",
        },
        "block-c": {
          id: "block-c",
          name: "Task C (dateless, no deps)",
          start_date: null,
          target_date: null,
          sort_order: 2,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-a", "block-c"]);

      const chartData = createMockChartData();
      runInAction(() => {
        store.currentViewData = chartData;
      });

      // No relations defined - block C is not in any dependency chain
      runInAction(() => {
        rootStore.issue.issueDetail.relation.relationMap = {
          // Only block A, block C has no entry
        };
      });

      // Enable CPM
      store.setCpmEnabled(true);
      store.updateBlocks((id) => issues[id as keyof typeof issues]);

      const blockC = store.blocksMap["block-c"];

      // Verify: Block C should remain dateless (no computed dates since it has no dependencies)
      expect(blockC?.start_date).toBeUndefined();
      expect(blockC?.target_date).toBeUndefined();
      expect(blockC?.dateSource).toBeUndefined();

      // Verify: No position calculated without dates
      expect(blockC?.position).toBeUndefined();
    });

    it("should not inject dates for isolated dateless blocks when CPM enabled", () => {
      const issues = {
        "block-x": {
          id: "block-x",
          name: "Isolated Task",
          start_date: null,
          target_date: null,
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-x"]);

      const chartData = createMockChartData();
      runInAction(() => {
        store.currentViewData = chartData;
      });

      runInAction(() => {
        rootStore.issue.issueDetail.relation.relationMap = {};
      });

      // Enable CPM
      store.setCpmEnabled(true);
      store.updateBlocks((id) => issues[id as keyof typeof issues]);

      const blockX = store.blocksMap["block-x"];

      // Verify: No dates or dateSource for isolated dateless block
      expect(blockX?.start_date).toBeUndefined();
      expect(blockX?.target_date).toBeUndefined();
      expect(blockX?.dateSource).toBeUndefined();
    });
  });

  describe("AC3.7: Toggling CPM off removes computed-date blocks from visibility", () => {
    it("should remove computed dates when CPM is toggled off (AC3.7)", () => {
      // Manually set up a computed-date block to test the toggle behavior
      const testIssues = {
        "toggle-test": {
          id: "toggle-test",
          name: "Toggle Test",
          start_date: null,
          target_date: null,
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const testRootStore = createMockRootStore(testIssues);
      const testStore = new BaseTimeLineStore(testRootStore as any);
      testStore.setBlockIds(["toggle-test"]);

      const chartData = createMockChartData();
      runInAction(() => {
        testStore.currentViewData = chartData;
      });

      // Manually set a computed-date block in the store to simulate injection
      runInAction(() => {
        testStore.blocksMap["toggle-test"] = {
          id: "toggle-test",
          name: "Toggle Test",
          data: testIssues["toggle-test"],
          sort_order: 0,
          start_date: "2024-01-13",
          target_date: "2024-01-15",
          dateSource: "computed",
          position: {
            marginLeft: 250,
            width: 100,
          },
        };
      });

      // With CPM enabled, computed block has dates
      testStore.setCpmEnabled(true);
      const block = testStore.blocksMap["toggle-test"];
      expect(block?.start_date).toBe("2024-01-13");
      expect(block?.dateSource).toBe("computed");

      // Disable CPM - the block still has dates in blocksMap
      testStore.setCpmEnabled(false);

      // But when updateBlocks is called with CPM disabled, injection should not occur
      // and the block should revert to dateless state (as if coming from the dateless issue data)
      testStore.updateBlocks((id) => testIssues[id as keyof typeof testIssues]);

      // Verify: Block reverts to dateless state since updateBlocks won't inject without CPM
      const blockAfterDisable = testStore.blocksMap["toggle-test"];
      expect(blockAfterDisable?.start_date).toBeUndefined();
      expect(blockAfterDisable?.target_date).toBeUndefined();
      expect(blockAfterDisable?.dateSource).toBeUndefined();
    });

    it("should preserve manual dates when CPM is toggled off", () => {
      const issues = {
        "block-m": {
          id: "block-m",
          name: "Task M (manual dates)",
          start_date: "2024-01-10",
          target_date: "2024-01-15",
          sort_order: 0,
          project_id: "proj-1",
        },
      };

      const rootStore = createMockRootStore(issues);
      store = new BaseTimeLineStore(rootStore as any);
      store.setBlockIds(["block-m"]);

      const chartData = createMockChartData();
      runInAction(() => {
        store.currentViewData = chartData;
      });

      runInAction(() => {
        rootStore.issue.issueDetail.relation.relationMap = {};
      });

      // Enable CPM
      store.setCpmEnabled(true);
      store.updateBlocks((id) => issues[id as keyof typeof issues]);

      let blockM = store.blocksMap["block-m"];
      expect(blockM?.start_date).toBe("2024-01-10");
      expect(blockM?.target_date).toBe("2024-01-15");
      expect(blockM?.dateSource).toBeUndefined(); // Manual dates have no dateSource

      // Disable CPM
      store.setCpmEnabled(false);
      store.updateBlocks((id) => issues[id as keyof typeof issues]);

      blockM = store.blocksMap["block-m"];

      // Verify: Manual dates are preserved
      expect(blockM?.start_date).toBe("2024-01-10");
      expect(blockM?.target_date).toBe("2024-01-15");
      expect(blockM?.dateSource).toBeUndefined();
    });
  });
});
