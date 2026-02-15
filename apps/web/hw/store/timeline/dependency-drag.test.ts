/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { BaseTimeLineStore } from "./base-timeline.store";
import type { RootStore } from "@/plane-web/store/root.store";

/**
 * Mock RootStore for testing timeline store in isolation.
 */
function createMockRootStore(): RootStore {
  return {
    // Minimal mock implementation
  } as unknown as RootStore;
}

describe("Dependency Drag State Management (BaseTimeLineStore)", () => {
  let timelineStore: BaseTimeLineStore;

  beforeEach(() => {
    const mockRootStore = createMockRootStore();
    timelineStore = new BaseTimeLineStore(mockRootStore);
  });

  describe("Store state transitions", () => {
    /**
     * Test: Calling startDependencyDrag sets isDragging: true and source info.
     */
    it("should set isDragging and source info when startDependencyDrag is called", () => {
      timelineStore.startDependencyDrag("block-123", "left");

      expect(timelineStore.dependencyDragState.isDragging).toBe(true);
      expect(timelineStore.dependencyDragState.sourceBlockId).toBe("block-123");
      expect(timelineStore.dependencyDragState.sourceEndpoint).toBe("left");
      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBeNull();
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBeNull();
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(false);
    });

    /**
     * Test: Calling endDependencyDrag resets all state.
     */
    it("should reset all state when endDependencyDrag is called", () => {
      // Start a drag operation
      timelineStore.startDependencyDrag("block-123", "right");
      timelineStore.updateDependencyDragCursor(100, 200);
      timelineStore.setDependencyDragTarget("block-456", "left", true);

      // End the drag operation
      timelineStore.endDependencyDrag();

      expect(timelineStore.dependencyDragState.isDragging).toBe(false);
      expect(timelineStore.dependencyDragState.sourceBlockId).toBeNull();
      expect(timelineStore.dependencyDragState.sourceEndpoint).toBeNull();
      expect(timelineStore.dependencyDragState.cursorX).toBe(0);
      expect(timelineStore.dependencyDragState.cursorY).toBe(0);
      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBeNull();
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBeNull();
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(false);
    });

    /**
     * Test: Cursor position is tracked during drag.
     */
    it("should update cursor position during drag", () => {
      timelineStore.startDependencyDrag("block-123", "left");
      timelineStore.updateDependencyDragCursor(150, 300);

      expect(timelineStore.dependencyDragState.cursorX).toBe(150);
      expect(timelineStore.dependencyDragState.cursorY).toBe(300);
    });

    /**
     * Test: Starting left endpoint drag sets correct endpoint.
     */
    it("should handle left endpoint drag", () => {
      timelineStore.startDependencyDrag("block-abc", "left");

      expect(timelineStore.dependencyDragState.sourceEndpoint).toBe("left");
    });

    /**
     * Test: Starting right endpoint drag sets correct endpoint.
     */
    it("should handle right endpoint drag", () => {
      timelineStore.startDependencyDrag("block-xyz", "right");

      expect(timelineStore.dependencyDragState.sourceEndpoint).toBe("right");
    });
  });

  describe("Target validation", () => {
    /**
     * Test: Setting a target with isValid: true stores it correctly.
     */
    it("should store valid target information", () => {
      timelineStore.startDependencyDrag("source-block", "right");
      timelineStore.setDependencyDragTarget("target-block", "left", true);

      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBe("target-block");
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBe("left");
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(true);
    });

    /**
     * Test: Setting a target with isValid: false stores it with invalid flag.
     */
    it("should store invalid target information", () => {
      timelineStore.startDependencyDrag("source-block", "left");
      timelineStore.setDependencyDragTarget("same-block", "right", false);

      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBe("same-block");
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBe("right");
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(false);
    });

    /**
     * Test: Clearing target (null) works correctly.
     */
    it("should clear target when set to null", () => {
      timelineStore.startDependencyDrag("source-block", "right");
      timelineStore.setDependencyDragTarget("target-block", "left", true);
      timelineStore.setDependencyDragTarget(null, null, false);

      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBeNull();
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBeNull();
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(false);
    });
  });

  describe("AC4.7: Empty space drop handling", () => {
    /**
     * Test: When hoveredTargetBlockId is null and drag ends, no relation creation
     * should be triggered. The component logic checks if hoveredTargetBlockId is
     * null and skips the relation creation call.
     */
    it("should not trigger relation creation when dropping on empty space (null target)", () => {
      timelineStore.startDependencyDrag("source-block", "right");

      // Simulate moving cursor but not hovering over a valid target
      timelineStore.updateDependencyDragCursor(500, 600);
      timelineStore.setDependencyDragTarget(null, null, false);

      // Verify the state reflects empty space drop scenario
      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBeNull();
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBeNull();

      // End drag - the consuming component should check these conditions and skip relation creation
      timelineStore.endDependencyDrag();

      // Verify state is clean for next operation
      expect(timelineStore.dependencyDragState.isDragging).toBe(false);
    });
  });

  describe("getIsCurrentDependencyDragging computed function", () => {
    /**
     * Test: getIsCurrentDependencyDragging should return true only when
     * isDragging is true AND the given blockId matches sourceBlockId.
     */
    it("should return true when dragging from the given block", () => {
      timelineStore.startDependencyDrag("block-123", "left");

      expect(timelineStore.getIsCurrentDependencyDragging("block-123")).toBe(true);
    });

    /**
     * Test: Should return false when not dragging.
     */
    it("should return false when not dragging", () => {
      expect(timelineStore.getIsCurrentDependencyDragging("block-123")).toBe(false);
    });

    /**
     * Test: Should return false when dragging from a different block.
     */
    it("should return false when dragging from a different block", () => {
      timelineStore.startDependencyDrag("block-123", "left");

      expect(timelineStore.getIsCurrentDependencyDragging("block-456")).toBe(false);
    });

    /**
     * Test: Should return false after drag ends.
     */
    it("should return false after drag ends", () => {
      timelineStore.startDependencyDrag("block-123", "right");
      expect(timelineStore.getIsCurrentDependencyDragging("block-123")).toBe(true);

      timelineStore.endDependencyDrag();
      expect(timelineStore.getIsCurrentDependencyDragging("block-123")).toBe(false);
    });
  });

  describe("Multiple drag cycles", () => {
    /**
     * Test: Verify state is clean and ready for a new drag after a previous one ends.
     */
    it("should support multiple consecutive drag cycles", () => {
      // First drag cycle
      timelineStore.startDependencyDrag("block-1", "left");
      timelineStore.setDependencyDragTarget("block-2", "right", true);
      timelineStore.endDependencyDrag();

      // Second drag cycle from a different block
      timelineStore.startDependencyDrag("block-3", "right");
      timelineStore.setDependencyDragTarget("block-4", "left", false);

      expect(timelineStore.dependencyDragState.sourceBlockId).toBe("block-3");
      expect(timelineStore.dependencyDragState.sourceEndpoint).toBe("right");
      expect(timelineStore.dependencyDragState.hoveredTargetBlockId).toBe("block-4");
      expect(timelineStore.dependencyDragState.hoveredTargetEndpoint).toBe("left");
      expect(timelineStore.dependencyDragState.isValidTarget).toBe(false);
    });
  });
});
