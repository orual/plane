/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Dependency path calculator for SVG connector rendering.
 *
 * Pure functions for calculating SVG bezier path data for dependency
 * connectors between gantt blocks. Supports FS (S-curve), SS/FF (U-turn),
 * and same-row (straight line) configurations.
 *
 * No React, no MobX — fully testable.
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
 * Calculate a cubic bezier SVG path between two blocks.
 *
 * For opposite-side connectors (FS: right→left) the curve flows naturally
 * as an S-curve. For same-side connectors (SS: left→left, FF: right→right)
 * the curve forms a symmetric U-turn where both control points share the
 * same x-position, bulging past the outermost block.
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
  const sourceX = sourceEndpoint === "left" ? source.left : source.left + source.width;
  const sourceY = source.top + source.height / 2;
  const sourcePoint = { x: sourceX, y: sourceY };

  const targetX = targetEndpoint === "left" ? target.left : target.left + target.width;
  const targetY = target.top + target.height / 2;
  const targetPoint = { x: targetX, y: targetY };

  // Same row — straight horizontal line
  if (Math.abs(targetY - sourceY) < 1) {
    return {
      d: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      sourcePoint,
      targetPoint,
    };
  }

  const sourceDir = sourceEndpoint === "right" ? 1 : -1;
  const targetDir = targetEndpoint === "right" ? 1 : -1;
  const isSameSide = sourceDir === targetDir;

  let cp1x: number;
  let cp2x: number;

  const verticalDistance = Math.abs(targetY - sourceY);

  if (isSameSide) {
    // SS/FF: Both control points at the same x-position to create a
    // symmetric U-turn. The bulge extends past whichever endpoint is
    // further in the exit direction.
    const padding = Math.max(70, Math.min(180, verticalDistance * 0.7));
    const outerX = sourceDir > 0 ? Math.max(sourceX, targetX) : Math.min(sourceX, targetX);
    const bulgeX = outerX + sourceDir * padding;
    cp1x = bulgeX;
    cp2x = bulgeX;
  } else {
    // FS: S-curve — offset scales with both horizontal and vertical distance
    // so the curve approaches the target gently even when blocks are far apart
    // vertically but close horizontally.
    const horizontalDistance = Math.abs(targetX - sourceX);
    const cpOffset = Math.max(40, Math.min(160, Math.max(horizontalDistance * 0.3, verticalDistance * 0.4)));
    cp1x = sourceX + sourceDir * cpOffset;
    cp2x = targetX + targetDir * cpOffset;
  }

  const cp1y = sourceY;
  const cp2y = targetY;

  const pathData = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;

  return { d: pathData, sourcePoint, targetPoint };
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
    // Blocking: solid line (purple)
    case "blocking":
    case "blocked_by":
      return {
        strokeDasharray: "",
        stroke: "var(--extended-color-purple-500)",
      };

    // Temporal: start_before/start_after (indigo, dashed)
    case "start_before":
    case "start_after":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--extended-color-indigo-500)",
      };

    // Temporal: finish_before/finish_after (pink, dashed)
    case "finish_before":
    case "finish_after":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--extended-color-pink-500)",
      };

    // Structural: implemented_by/implements (emerald, dashed)
    case "implemented_by":
    case "implements":
      return {
        strokeDasharray: "6 3",
        stroke: "var(--extended-color-emerald-500)",
      };

    // Non-scheduling relations (default gray, dashed)
    case "relates_to":
    case "duplicate":
    default:
      return {
        strokeDasharray: "6 3",
        stroke: "var(--text-color-secondary)",
      };
  }
}

/**
 * Human-readable label for a relation type, used in connector tooltips.
 *
 * Returns the forward-direction label (e.g., "blocks" not "blocked by")
 * since connectors are only rendered for forward types.
 *
 * @param relationType The issue relation type
 * @returns Label text for display
 */
export function getRelationLabel(relationType: TIssueRelationTypes): string {
  switch (relationType) {
    case "blocking":
      return "blocks";
    case "blocked_by":
      return "blocked by";
    case "start_before":
      return "starts before";
    case "start_after":
      return "starts after";
    case "finish_before":
      return "finishes before";
    case "finish_after":
      return "finishes after";
    case "implements":
      return "implements";
    case "implemented_by":
      return "implemented by";
    case "relates_to":
      return "relates to";
    case "duplicate":
      return "duplicate of";
    default:
      return relationType;
  }
}
