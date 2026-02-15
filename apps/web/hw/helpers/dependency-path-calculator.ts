/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Dependency path calculator for SVG connector rendering.
 *
 * This module provides pure functions for calculating SVG path data for
 * right-angle connectors between gantt blocks. The paths are used to
 * visualize dependency relations (blocking, temporal) between issues.
 *
 * Only pure functions — no React, no MobX, fully testable.
 */

import type { TIssueRelationTypes } from "@plane/types";

/**
 * Rectangular bounding box for a gantt block.
 */
export type BlockRect = {
  left: number; // marginLeft from block.position.marginLeft
  width: number; // from block.position.width
  top: number; // rowIndex * BLOCK_HEIGHT
  height: number; // BLOCK_HEIGHT constant (44)
};

/**
 * Which edge of a block to connect from/to.
 */
export type ConnectorEndpoint = "left" | "right";

/**
 * SVG path information for a dependency connector.
 */
export type ConnectorPath = {
  d: string; // SVG path d attribute
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
};

/**
 * Endpoint connector style (stroke and dasharray).
 */
export type ConnectorStyle = {
  strokeDasharray: string; // "" for solid, "6 3" for dashed, etc.
  stroke: string; // CSS variable reference
};

/**
 * Midpoint offset for the vertical segment in right-angle paths (pixels).
 */
const CONNECTOR_MIDPOINT_OFFSET = 20;

/**
 * Calculate a right-angle SVG path between two blocks.
 *
 * The path exits the source horizontally, makes a right-angle turn at
 * a midpoint (CONNECTOR_MIDPOINT_OFFSET from the source), then enters
 * the target horizontally.
 *
 * @param source Source block rectangle
 * @param target Target block rectangle
 * @param sourceEndpoint Which edge of source to exit from ("left" or "right")
 * @param targetEndpoint Which edge of target to enter ("left" or "right")
 * @returns Path data with d attribute and source/target points
 */
export function calculateConnectorPath(
  source: BlockRect,
  target: BlockRect,
  sourceEndpoint: ConnectorEndpoint,
  targetEndpoint: ConnectorEndpoint
): ConnectorPath {
  // Calculate source point (center of the chosen edge)
  const sourceX = sourceEndpoint === "left" ? source.left : source.left + source.width;
  const sourceY = source.top + source.height / 2;
  const sourcePoint = { x: sourceX, y: sourceY };

  // Calculate target point (center of the chosen edge)
  const targetX = targetEndpoint === "left" ? target.left : target.left + target.width;
  const targetY = target.top + target.height / 2;
  const targetPoint = { x: targetX, y: targetY };

  // Calculate midpoint x-coordinate for the vertical segment
  // Start from source, go horizontally by CONNECTOR_MIDPOINT_OFFSET, then go vertical
  const midX = sourceX + (sourceEndpoint === "right" ? CONNECTOR_MIDPOINT_OFFSET : -CONNECTOR_MIDPOINT_OFFSET);

  // Build the SVG path with right-angle routing:
  // 1. Move to source point
  // 2. Line horizontally by CONNECTOR_MIDPOINT_OFFSET
  // 3. Line vertically to target level
  // 4. Line horizontally to target point
  const pathData = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;

  return {
    d: pathData,
    sourcePoint,
    targetPoint,
  };
}

/**
 * Map a relation type to its connector endpoints (source edge, target edge).
 *
 * Relation types fall into three categories:
 * - Finish-to-Start (FS): blocking, blocked_by, implemented_by, implements
 * - Start-to-Start (SS): start_before, start_after
 * - Finish-to-Finish (FF): finish_before, finish_after
 *
 * @param relationType The issue relation type
 * @returns Source and target endpoint locations
 */
export function getConnectorEndpoints(relationType: TIssueRelationTypes): {
  sourceEndpoint: ConnectorEndpoint;
  targetEndpoint: ConnectorEndpoint;
} {
  switch (relationType) {
    // Finish-to-Start: source right → target left
    case "blocking":
    case "blocked_by":
    case "implemented_by":
    case "implements":
      return { sourceEndpoint: "right", targetEndpoint: "left" };

    // Start-to-Start: source left → target left
    case "start_before":
    case "start_after":
      return { sourceEndpoint: "left", targetEndpoint: "left" };

    // Finish-to-Finish: source right → target right
    case "finish_before":
    case "finish_after":
      return { sourceEndpoint: "right", targetEndpoint: "right" };

    // Non-scheduling relations (should not produce connectors, but return default)
    case "relates_to":
    case "duplicate":
    default:
      return { sourceEndpoint: "right", targetEndpoint: "left" };
  }
}

/**
 * Get the SVG stroke style for a dependency connector.
 *
 * Relation types are styled differently:
 * - blocking/blocked_by: solid line (tertiary text color)
 * - start_before/start_after: dashed line (blue)
 * - finish_before/finish_after: dashed line (purple)
 * - implemented_by/implements: dashed line (green)
 * - relates_to/duplicate: dashed line (secondary/gray, non-scheduling)
 *
 * @param relationType The issue relation type
 * @returns Stroke style (dasharray and color)
 */
export function getConnectorStyle(relationType: TIssueRelationTypes): ConnectorStyle {
  switch (relationType) {
    // Blocking: solid line
    case "blocking":
    case "blocked_by":
      return {
        strokeDasharray: "",
        stroke: "var(--color-text-tertiary)",
      };

    // Temporal: start_before/start_after (blue, dashed)
    case "start_before":
    case "start_after":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--color-blue-500)",
      };

    // Temporal: finish_before/finish_after (purple, dashed)
    case "finish_before":
    case "finish_after":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--color-purple-500)",
      };

    // Structural: implemented_by/implements (green, dashed)
    case "implemented_by":
    case "implements":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--color-green-500)",
      };

    // Non-scheduling relations (default gray, dashed)
    case "relates_to":
    case "duplicate":
    default:
      return {
        strokeDasharray: "6 3",
        stroke: "var(--color-text-quaternary)",
      };
  }
}
