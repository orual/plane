/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import { calculateConnectorPath, getConnectorEndpoints, getConnectorStyle } from "./dependency-path-calculator";
import type { BlockRect } from "./dependency-path-calculator";

const BLOCK_HEIGHT = 44;

describe("dependency-path-calculator", () => {
  describe("calculateConnectorPath", () => {
    it("should create a right-angle path from source right to target left (finish-to-start)", () => {
      // Source block at row 0, target block at row 2
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

      // Path should start with move command
      expect(result.d).toMatch(/^M/);
      // Path should contain line commands (L) for right-angle routing
      expect(result.d).toContain("L");
      // Should have source and target points
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

    it("should create a path when source and target are on the same row", () => {
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
      expect(result.sourcePoint).toBeDefined();
      expect(result.targetPoint).toBeDefined();
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
    it("should return solid line (no dasharray) for blocking", () => {
      const result = getConnectorStyle("blocking");
      expect(result.strokeDasharray).toBe("");
      expect(result.stroke).toBe("var(--color-text-tertiary)");
    });

    it("should return solid line (no dasharray) for blocked_by", () => {
      const result = getConnectorStyle("blocked_by");
      expect(result.strokeDasharray).toBe("");
      expect(result.stroke).toBe("var(--color-text-tertiary)");
    });

    it("should return dashed blue line for start_before", () => {
      const result = getConnectorStyle("start_before");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-blue-500)");
    });

    it("should return dashed blue line for start_after", () => {
      const result = getConnectorStyle("start_after");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-blue-500)");
    });

    it("should return dashed purple line for finish_before", () => {
      const result = getConnectorStyle("finish_before");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-purple-500)");
    });

    it("should return dashed purple line for finish_after", () => {
      const result = getConnectorStyle("finish_after");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-purple-500)");
    });

    it("should return dashed green line for implemented_by", () => {
      const result = getConnectorStyle("implemented_by");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-green-500)");
    });

    it("should return dashed green line for implements", () => {
      const result = getConnectorStyle("implements");
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-green-500)");
    });

    it("should handle duplicate relation type (non-scheduling)", () => {
      const result = getConnectorStyle("duplicate");
      // Non-scheduling types should return dashed gray style
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-text-quaternary)");
    });

    it("should handle relates_to relation type (non-scheduling)", () => {
      const result = getConnectorStyle("relates_to");
      // Non-scheduling types should return dashed gray style
      expect(result.strokeDasharray).toBe("6 3");
      expect(result.stroke).toBe("var(--color-text-quaternary)");
    });
  });
});
