/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";

/**
 * SVG component that renders a rubber-band line during dependency drag-to-create operations.
 *
 * This component:
 * - Observes the dependencyDragState from the timeline store
 * - Returns null if not dragging
 * - Renders an SVG line from the source block's edge to either:
 *   - The cursor position (when hovering empty space)
 *   - The target block's snapped edge (when hovering a valid target)
 * - Colors the line:
 *   - Grey when no target is hovered
 *   - Green when hovering a valid target
 *   - Red when hovering an invalid target (same block, would-create-cycle)
 */
export const TimelineDraggablePath = observer(function TimelineDraggablePath() {
  const timelineStore = useTimeLineChartStore();
  const { dependencyDragState } = timelineStore;

  const blocksMap = timelineStore.blocksMap;
  const blockIds = timelineStore.blockIds;

  // If not dragging, render nothing
  if (!dependencyDragState.isDragging || !dependencyDragState.sourceBlockId) {
    return null;
  }

  // Get source block
  if (!blocksMap) {
    return null;
  }

  const sourceBlock = blocksMap[dependencyDragState.sourceBlockId];
  if (!sourceBlock || !sourceBlock.position) {
    return null;
  }

  // Get source endpoint position
  let sourceX: number;
  if (dependencyDragState.sourceEndpoint === "left") {
    sourceX = sourceBlock.position.marginLeft;
  } else {
    sourceX = sourceBlock.position.marginLeft + sourceBlock.position.width;
  }

  // Find source block row index to calculate Y coordinate
  const sourceRowIndex = blockIds?.indexOf(dependencyDragState.sourceBlockId) ?? -1;
  const sourceY = sourceRowIndex >= 0 ? sourceRowIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2 : 0;

  // Determine end point (either cursor or target block edge)
  let endX = dependencyDragState.cursorX;
  let endY = dependencyDragState.cursorY;
  let lineColor = "#999999"; // Grey for no target

  if (dependencyDragState.hoveredTargetBlockId && blocksMap) {
    const targetBlock = blocksMap[dependencyDragState.hoveredTargetBlockId];
    if (targetBlock && targetBlock.position && dependencyDragState.hoveredTargetEndpoint) {
      // Snap endpoint to target block's edge
      if (dependencyDragState.hoveredTargetEndpoint === "left") {
        endX = targetBlock.position.marginLeft;
      } else {
        endX = targetBlock.position.marginLeft + targetBlock.position.width;
      }

      // Find target block row index to calculate Y coordinate
      const targetRowIndex = blockIds?.indexOf(dependencyDragState.hoveredTargetBlockId) ?? -1;
      endY = targetRowIndex >= 0 ? targetRowIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2 : dependencyDragState.cursorY;

      // Color based on validity
      lineColor = dependencyDragState.isValidTarget ? "#10b981" : "#ef4444"; // Green or red
    }
  }

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{
        overflow: "visible",
      }}
    >
      <line x1={sourceX} y1={sourceY} x2={endX} y2={endY} stroke={lineColor} strokeWidth="2" strokeDasharray="4,4" />
    </svg>
  );
});
