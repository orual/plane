/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import {
  calculateConnectorPath,
  getConnectorEndpoints,
  getConnectorStyle,
  getRelationLabel,
} from "./dependency-path-calculator";
import type { BlockRect } from "./dependency-path-calculator";

const BLOCK_HEIGHT = 44;

describe("dependency-path-calculator", () => {
  describe("calculateConnectorPath", () => {
    it("should create a smooth bezier path from source right to target left (finish-to-start)", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: 2 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "left");

      expect(result.d).toMatch(/^M/);
      // Smooth bezier: uses C command, not L
      expect(result.d).toContain("C");
      expect(result.sourcePoint).toBeDefined();
      expect(result.targetPoint).toBeDefined();
      // Source point should be on the right edge of source block
      expect(result.sourcePoint.x).toBe(source.left + source.width);
      expect(result.sourcePoint.y).toBeGreaterThanOrEqual(source.top);
      expect(result.sourcePoint.y).toBeLessThanOrEqual(source.top + source.height);
      // Target point should be on the left edge of target block
      expect(result.targetPoint.x).toBe(target.left);
      expect(result.targetPoint.y).toBeGreaterThanOrEqual(target.top);
      expect(result.targetPoint.y).toBeLessThanOrEqual(target.top + target.height);
    });

    it("should create a path when target is above source (upward connector)", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 2 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "left");

      expect(result.d).toMatch(/^M/);
      expect(result.sourcePoint).toBeDefined();
      expect(result.targetPoint).toBeDefined();
    });

    it("should create a straight path when source and target are on the same row", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "left");

      expect(result.d).toMatch(/^M/);
      // Same row → straight line, no curves
      expect(result.d).not.toContain("C");
      expect(result.sourcePoint).toBeDefined();
      expect(result.targetPoint).toBeDefined();
    });

    it("should use smooth bezier curves when blocks are on different rows", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: 2 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "left");

      // Should use cubic bezier for smooth flowing path
      expect(result.d).toContain("C");
    });

    it("should use left endpoint when specified", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "left", "left");

      // Source point should be on the left edge
      expect(result.sourcePoint.x).toBe(source.left);
      // Target point should be on the left edge
      expect(result.targetPoint.x).toBe(target.left);
    });

    it("should use right endpoint when specified", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "right");

      // Source point should be on the right edge
      expect(result.sourcePoint.x).toBe(source.left + source.width);
      // Target point should be on the right edge
      expect(result.targetPoint.x).toBe(target.left + target.width);
    });

    it("should use symmetric U-turn for same-side connectors (SS/FF)", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 120,
        width: 60,
        top: 4 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      // SS: left→left — same-side U-turn
      const ssResult = calculateConnectorPath(source, target, "left", "left");
      expect(ssResult.d).toContain("C");

      // Both control points should be at the SAME x-position (symmetric bulge)
      const ssMatch = ssResult.d.match(/C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),/);
      expect(ssMatch).not.toBeNull();
      const cp1x = parseFloat(ssMatch![1]);
      const cp2x = parseFloat(ssMatch![3]);
      expect(cp1x).toBe(cp2x);
      // Both should be to the left of the leftmost endpoint
      expect(cp1x).toBeLessThan(Math.min(source.left, target.left));
    });

    it("should use symmetric U-turn for FF connectors (right→right)", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 400,
        width: 80,
        top: 3 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      // FF: right→right
      const ffResult = calculateConnectorPath(source, target, "right", "right");
      expect(ffResult.d).toContain("C");

      const ffMatch = ffResult.d.match(/C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),/);
      expect(ffMatch).not.toBeNull();
      const cp1x = parseFloat(ffMatch![1]);
      const cp2x = parseFloat(ffMatch![3]);
      // Both CPs at the same x, past the rightmost endpoint
      expect(cp1x).toBe(cp2x);
      expect(cp1x).toBeGreaterThan(Math.max(source.left + source.width, target.left + target.width));
    });

    it("should use tighter control point offset for opposite-side connectors (FS)", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 500,
        width: 60,
        top: BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      // FS: right→left — opposite-side S-curve
      const fsResult = calculateConnectorPath(source, target, "right", "left");
      expect(fsResult.d).toContain("C");

      // Parse control points — cp1 should be right of source, cp2 left of target
      const fsMatch = fsResult.d.match(/C\s+([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),/);
      expect(fsMatch).not.toBeNull();
      const cp1x = parseFloat(fsMatch![1]);
      const cp2x = parseFloat(fsMatch![3]);
      expect(cp1x).toBeGreaterThan(source.left + source.width);
      expect(cp2x).toBeLessThan(target.left);
    });

    it("should end the path at the target point coordinates", () => {
      const source: BlockRect = {
        left: 100,
        width: 60,
        top: 0,
        height: BLOCK_HEIGHT,
      };
      const target: BlockRect = {
        left: 300,
        width: 60,
        top: 2 * BLOCK_HEIGHT,
        height: BLOCK_HEIGHT,
      };

      const result = calculateConnectorPath(source, target, "right", "left");

      // Path should end at target point (marker handles arrowhead positioning)
      const expectedEndX = target.left;
      const expectedEndY = target.top + target.height / 2;
      expect(result.d).toContain(`${expectedEndX} ${expectedEndY}`);
    });
  });

  describe("getConnectorEndpoints", () => {
    it("should return right→left for blocking (finish-to-start)", () => {
      const result = getConnectorEndpoints("blocking");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("left");
    });

    it("should return right→left for blocked_by (finish-to-start)", () => {
      const result = getConnectorEndpoints("blocked_by");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("left");
    });

    it("should return left→left for start_before (start-to-start)", () => {
      const result = getConnectorEndpoints("start_before");
      expect(result.sourceEndpoint).toBe("left");
      expect(result.targetEndpoint).toBe("left");
    });

    it("should return left→left for start_after (start-to-start)", () => {
      const result = getConnectorEndpoints("start_after");
      expect(result.sourceEndpoint).toBe("left");
      expect(result.targetEndpoint).toBe("left");
    });

    it("should return right→right for finish_before (finish-to-finish)", () => {
      const result = getConnectorEndpoints("finish_before");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("right");
    });

    it("should return right→right for finish_after (finish-to-finish)", () => {
      const result = getConnectorEndpoints("finish_after");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("right");
    });

    it("should return right→left for implemented_by (finish-to-start)", () => {
      const result = getConnectorEndpoints("implemented_by");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("left");
    });

    it("should return right→left for implements (finish-to-start)", () => {
      const result = getConnectorEndpoints("implements");
      expect(result.sourceEndpoint).toBe("right");
      expect(result.targetEndpoint).toBe("left");
    });
  });

  describe("getConnectorStyle", () => {
    it("should return solid purple line for blocking", () => {
      const result = getConnectorStyle("blocking");
      expect(result.strokeDasharray).toBe("");
      expect(result.stroke).toBe("var(--extended-color-purple-500)");
    });

    it("should return solid purple line for blocked_by", () => {
      const result = getConnectorStyle("blocked_by");
      expect(result.strokeDasharray).toBe("");
      expect(result.stroke).toBe("var(--extended-color-purple-500)");
    });

    it("should return dashed indigo line for start_before", () => {
      const result = getConnectorStyle("start_before");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-indigo-500)");
    });

    it("should return dashed indigo line for start_after", () => {
      const result = getConnectorStyle("start_after");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-indigo-500)");
    });

    it("should return dashed pink line for finish_before", () => {
      const result = getConnectorStyle("finish_before");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-pink-500)");
    });

    it("should return dashed pink line for finish_after", () => {
      const result = getConnectorStyle("finish_after");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-pink-500)");
    });

    it("should return dashed emerald line for implemented_by", () => {
      const result = getConnectorStyle("implemented_by");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-emerald-500)");
    });

    it("should return dashed emerald line for implements", () => {
      const result = getConnectorStyle("implements");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--extended-color-emerald-500)");
    });

    it("should handle duplicate relation type (non-scheduling)", () => {
      const result = getConnectorStyle("duplicate");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--text-color-secondary)");
    });

    it("should handle relates_to relation type (non-scheduling)", () => {
      const result = getConnectorStyle("relates_to");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--text-color-secondary)");
    });
  });

  describe("getRelationLabel", () => {
    it("should return human-readable labels for all relation types", () => {
      expect(getRelationLabel("blocking")).toBe("blocks");
      expect(getRelationLabel("blocked_by")).toBe("blocked by");
      expect(getRelationLabel("start_before")).toBe("starts before");
      expect(getRelationLabel("start_after")).toBe("starts after");
      expect(getRelationLabel("finish_before")).toBe("finishes before");
      expect(getRelationLabel("finish_after")).toBe("finishes after");
      expect(getRelationLabel("implements")).toBe("implements");
      expect(getRelationLabel("implemented_by")).toBe("implemented by");
      expect(getRelationLabel("relates_to")).toBe("relates to");
      expect(getRelationLabel("duplicate")).toBe("duplicate of");
    });
  });
});
