/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IGanttBlock, TIssueRelationTypes } from "@plane/types";
import { describe, it, expect } from "vitest";
import { filterVisibleDependencies } from "./visibility-filter";

/**
 * Helper to create a mock gantt block with position data.
 */
function createBlockWithPosition(
  id: string,
  options?: { marginLeft?: number; width?: number; startDate?: string; targetDate?: string }
): IGanttBlock {
  return {
    id,
    data: {},
    name: `Block ${id}`,
    sort_order: 0,
    start_date: options?.startDate || "2026-01-01",
    target_date: options?.targetDate || "2026-01-31",
    position: {
      marginLeft: options?.marginLeft || 0,
      width: options?.width || 100,
    },
  };
}

/**
 * Helper to create a mock gantt block without position data (no dates).
 */
function createBlockWithoutPosition(id: string): IGanttBlock {
  return {
    id,
    data: {},
    name: `Block ${id}`,
    sort_order: 0,
    start_date: undefined,
    target_date: undefined,
    position: undefined,
  };
}

describe("filterVisibleDependencies", () => {
  describe("dep-viz-propagation.AC3.6: Visibility filtering", () => {
    it("should include dependencies where both source and target are in the visible block list", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sourceBlockId: "block-1",
        targetBlockId: "block-2",
        relationType: "blocking",
      });
    });

    it("should exclude dependencies where target block is not in visible block list", () => {
      const blockIds = ["block-1"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"], // block-2 is not in blockIds
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });

    it("should exclude dependencies where source block is not in visible block list", () => {
      const blockIds = ["block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      // block-1 is not in blockIds, so its relations shouldn't be iterated
      expect(result).toHaveLength(0);
    });
  });

  describe("dep-viz-propagation.AC3.7: No-date blocks excluded", () => {
    it("should exclude dependencies involving blocks without position data (no dates)", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithoutPosition("block-2"), // No position data
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });

    it("should exclude dependencies where source block lacks position data", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithoutPosition("block-1"), // No position data
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });
  });

  describe("Multiple dependency types", () => {
    it("should include blocking, start_before, and finish_before relations", () => {
      const blockIds = ["block-1", "block-2", "block-3", "block-4"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
        "block-3": createBlockWithPosition("block-3"),
        "block-4": createBlockWithPosition("block-4"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: ["block-3"],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
        "block-3": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: ["block-4"],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(3);
      expect(result.some((d) => d.relationType === "blocking")).toBe(true);
      expect(result.some((d) => d.relationType === "start_before")).toBe(true);
      expect(result.some((d) => d.relationType === "finish_before")).toBe(true);
    });

    it("should include implemented_by and implements relations", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: ["block-2"],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(1);
      expect(result[0].relationType).toBe("implemented_by");
    });

    it("should include start_after and finish_after relations", () => {
      const blockIds = ["block-1", "block-2", "block-3"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
        "block-3": createBlockWithPosition("block-3"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: ["block-2"],
          finish_before: [],
          finish_after: ["block-3"],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(2);
      expect(result.some((d) => d.relationType === "start_after")).toBe(true);
      expect(result.some((d) => d.relationType === "finish_after")).toBe(true);
    });
  });

  describe("No dependencies", () => {
    it("should return empty array when there are no dependencies", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
        "block-2": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });

    it("should return empty array when relationMap is empty", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {};

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });
  });

  describe("Non-scheduling relations ignored", () => {
    it("should exclude relates_to relations", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: ["block-2"], // Non-scheduling relation
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });

    it("should exclude duplicate relations", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: ["block-2"], // Non-scheduling relation
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(0);
    });

    it("should include scheduling relations but exclude non-scheduling relations from same block", () => {
      const blockIds = ["block-1", "block-2", "block-3"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
        "block-3": createBlockWithPosition("block-3"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: ["block-3"], // Non-scheduling
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(1);
      expect(result[0].relationType).toBe("blocking");
    });
  });

  describe("Complex scenarios", () => {
    it("should handle multiple dependencies from one block", () => {
      const blockIds = ["block-1", "block-2", "block-3", "block-4"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
        "block-3": createBlockWithPosition("block-3"),
        "block-4": createBlockWithPosition("block-4"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: ["block-2", "block-3"],
          blocked_by: [],
          start_before: ["block-4"],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(3);
      expect(result.filter((d) => d.relationType === "blocking")).toHaveLength(2);
      expect(result.filter((d) => d.relationType === "start_before")).toHaveLength(1);
    });

    it("should include blocked_by relations", () => {
      const blockIds = ["block-1", "block-2"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-1": createBlockWithPosition("block-1"),
        "block-2": createBlockWithPosition("block-2"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-1": {
          blocking: [],
          blocked_by: ["block-2"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(1);
      expect(result[0].relationType).toBe("blocked_by");
    });

    it("should compute correct row indices for visible dependencies", () => {
      const blockIds = ["block-a", "block-b", "block-c"];
      const blocksMap: Record<string, IGanttBlock> = {
        "block-a": createBlockWithPosition("block-a"),
        "block-b": createBlockWithPosition("block-b"),
        "block-c": createBlockWithPosition("block-c"),
      };
      const relationMap: Record<string, Record<TIssueRelationTypes, string[]>> = {
        "block-a": {
          blocking: ["block-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          implemented_by: [],
          implements: [],
          relates_to: [],
          duplicate: [],
        },
      };

      const result = filterVisibleDependencies(blockIds, blocksMap, relationMap);

      expect(result).toHaveLength(1);
      expect(result[0].sourceRowIndex).toBe(0); // block-a is at index 0
      expect(result[0].targetRowIndex).toBe(2); // block-c is at index 2
    });
  });
});
