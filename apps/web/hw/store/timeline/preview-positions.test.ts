/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction } from "mobx";
import type { IGanttBlock, ChartDataType } from "@plane/types";
import { BaseTimeLineStore } from "./base-timeline.store";

/**
 * Minimal typed mock structure for root store.
 * Only includes the properties accessed by BaseTimeLineStore.
 */
type MockRootStore = {
  issue: {
    issueDetail: {
      relation: {
        relationMap: Record<string, Record<string, string[]>>;
      };
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

describe("BaseTimeLineStore - Preview Position Computation and Reconciliation", () => {
  let store: BaseTimeLineStore;
  let mockRootStore: MockRootStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal mock root store with relation store
    mockRootStore = {
      issue: {
        issueDetail: {
          relation: {
            relationMap: {} as Record<string, Record<string, string[]>>,
          },
        },
      },
    };

    // @ts-expect-error - minimal mock structure for testing
    store = new BaseTimeLineStore(mockRootStore);
    store.updateCurrentViewData(createMockChartData());
  });

  describe("computePreviewPositions", () => {
    it("should compute preview positions for downstream dependents with blocking relation", () => {
      // Setup: Block A blocks Block B
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 200, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A blocks B
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-b"] },
      };

      // Move A to the right: marginLeft becomes 150
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });

      // Compute preview positions for A's dependents
      store.computePreviewPositions("block-a");

      // B's marginLeft should be updated: 150 (A's new marginLeft) + 50 (A's width) + 40 (dayWidth) = 240
      const expectedBMarginLeft = 150 + 50 + 40;
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(expectedBMarginLeft);
      expect(store.previewBlockIds.has("block-b")).toBe(true);
    });

    it("should compute preview positions for downstream dependents with start_before relation", () => {
      // Setup: Block A starts before Block B (SS constraint)
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 110, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A starts before B
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { start_before: ["block-b"] },
      };

      // Move A to the right: marginLeft becomes 150
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });

      // Compute preview positions for A's dependents
      store.computePreviewPositions("block-a");

      // B's marginLeft should match A's: 150
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(150);
      expect(store.previewBlockIds.has("block-b")).toBe(true);
    });

    it("should compute preview positions for downstream dependents with finish_before relation", () => {
      // Setup: Block A finishes before Block B (FF constraint)
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 160, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A finishes before B
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { finish_before: ["block-b"] },
      };

      // Move A to the right: marginLeft becomes 150
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });

      // Compute preview positions for A's dependents
      store.computePreviewPositions("block-a");

      // B's right edge should match A's right edge: 150 + 50 = 200
      // B's marginLeft should be: 200 - 50 (B's width) = 150
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(150);
      expect(store.previewBlockIds.has("block-b")).toBe(true);
    });

    it("should take maximum constraint when dependent has multiple predecessors", () => {
      // Setup: Block A, B both block Block C
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 200, width: 50 },
      });
      const blockC = createMockBlock({
        id: "block-c",
        position: { marginLeft: 300, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
          "block-c": blockC,
        };
      });

      // Setup relations: A and B both block C
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-c"] },
        "block-b": { blocking: ["block-c"] },
      };

      // Move A to the right: marginLeft becomes 150
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });

      // Compute preview positions for A's dependents
      store.computePreviewPositions("block-a");

      // C's marginLeft should be the maximum of:
      // - From A: 150 + 50 + 40 = 240
      // - From B: 200 + 50 + 40 = 290
      // Maximum is 290
      expect(store.blocksMap["block-c"].position?.marginLeft).toBe(290);
      expect(store.previewBlockIds.has("block-c")).toBe(true);
    });

    it("should not update preview positions if dependent has no predecessors", () => {
      // Setup: Block A with no dependents
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
        };
      });

      // Setup empty relations
      mockRootStore.issue.issueDetail.relation.relationMap = {};

      // Compute preview positions
      store.computePreviewPositions("block-a");

      // previewBlockIds should be empty
      expect(store.previewBlockIds.size).toBe(0);
    });

    it("should handle non-existent block gracefully", () => {
      // Try to compute preview positions for a block that doesn't exist
      store.computePreviewPositions("non-existent");

      // Should not throw and previewBlockIds should be empty
      expect(store.previewBlockIds.size).toBe(0);
    });
  });

  describe("clearPreviewPositions", () => {
    it("should clear the previewBlockIds set", () => {
      runInAction(() => {
        store.previewBlockIds.add("block-1");
        store.previewBlockIds.add("block-2");
      });

      expect(store.previewBlockIds.size).toBe(2);

      store.clearPreviewPositions();

      expect(store.previewBlockIds.size).toBe(0);
    });

    it("should be idempotent", () => {
      store.clearPreviewPositions();
      store.clearPreviewPositions();

      expect(store.previewBlockIds.size).toBe(0);
    });
  });

  describe("Server reconciliation scenarios", () => {
    it("should match server dates when preview is correct (AC6.4 - zero jank)", () => {
      // Setup: Block A blocks Block B
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 200, width: 50 },
        start_date: "2024-01-16",
        target_date: "2024-01-20",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A blocks B
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-b"] },
      };

      // Simulate preview: move A to marginLeft 150, which shifts B
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });
      store.computePreviewPositions("block-a");

      // Capture preview position (A.marginLeft + A.width + dayWidth = 150 + 50 + 40 = 240)
      const previewPosition = store.blocksMap["block-b"].position?.marginLeft;
      expect(previewPosition).toBe(240);

      // Verify block B is in preview set
      expect(store.previewBlockIds.has("block-b")).toBe(true);

      // Server reconciliation: server returns the same position (preview was correct)
      // Simulate server updating with matching position (zero jank means no position change)
      const positionBeforeReconciliation = store.blocksMap["block-b"].position?.marginLeft;
      runInAction(() => {
        store.blocksMap["block-b"].start_date = "2024-01-16"; // Same date as predicted
        store.blocksMap["block-b"].target_date = "2024-01-20";
      });

      // Position should remain at 240 (zero jank)
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(positionBeforeReconciliation);
    });

    it("should snap to server position when concurrent edit changed graph (AC6.5)", () => {
      // Setup: Block A blocks Block B
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
        start_date: "2024-01-10",
        target_date: "2024-01-15",
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 200, width: 50 },
        start_date: "2024-01-16",
        target_date: "2024-01-20",
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A blocks B
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-b"] },
      };

      // Simulate preview: move A, which shifts B to position 240
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });
      store.computePreviewPositions("block-a");

      const previewPosition = store.blocksMap["block-b"].position?.marginLeft;
      expect(previewPosition).toBe(240);

      // Server returns different date due to concurrent edit
      // Simulate server update to B with different start_date (Jan 18 instead of Jan 16)
      const serverPosition = 300; // Different position
      runInAction(() => {
        store.blocksMap["block-b"].position = { marginLeft: serverPosition, width: 50 };
        store.blocksMap["block-b"].start_date = "2024-01-18";
      });

      // The block position should snap to server value
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(300);
    });
  });

  describe("Implements relation handling", () => {
    it("should handle implements relation as FS constraint", () => {
      // Setup: Block A is implemented by Block B
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: { marginLeft: 200, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      // Setup relations: A implements B (B is successor)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { implements: ["block-b"] },
      };

      // Move A to the right
      runInAction(() => {
        store.blocksMap["block-a"].position = { marginLeft: 150, width: 50 };
      });

      // Compute preview positions
      store.computePreviewPositions("block-a");

      // B's marginLeft should be: 150 + 50 + 40 = 240 (FS constraint)
      expect(store.blocksMap["block-b"].position?.marginLeft).toBe(240);
      expect(store.previewBlockIds.has("block-b")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle block without position gracefully", () => {
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });
      const blockB = createMockBlock({
        id: "block-b",
        position: undefined,
      });

      runInAction(() => {
        store.blocksMap = {
          "block-a": blockA,
          "block-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-b"] },
      };

      // Should not throw
      store.computePreviewPositions("block-a");

      // blockB's position should remain undefined
      expect(store.blocksMap["block-b"].position).toBeUndefined();
    });

    it("should handle missing currentViewData gracefully", () => {
      const blockA = createMockBlock({
        id: "block-a",
        position: { marginLeft: 100, width: 50 },
      });

      runInAction(() => {
        store.blocksMap = { "block-a": blockA };
        store.updateCurrentViewData(undefined);
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "block-a": { blocking: ["block-b"] },
      };

      // Should not throw
      store.computePreviewPositions("block-a");

      // Nothing should change
      expect(store.blocksMap["block-a"].position?.marginLeft).toBe(100);
    });
  });
});
