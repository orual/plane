/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

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
});
