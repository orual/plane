/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import type { IGanttBlock } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { detectCycleInMemory, inferRelationType } from "@/plane-web/helpers/dependency-validation";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";

/**
 * Custom hook for managing dependency drag-to-create operations on gantt blocks.
 *
 * This hook handles:
 * - Mouse event listeners for drag initiation
 * - Cursor tracking during drag
 * - Target block detection and validation
 * - Relation creation on successful drop
 *
 * @param block The gantt block being dragged from
 * @param ganttContainerRef Reference to the gantt container element
 * @param endpoint The endpoint of the source block ("left" or "right")
 * @returns Event handler function for mousedown on the drag handle
 */
export function useDependencyDrag(
  block: IGanttBlock,
  ganttContainerRef: RefObject<HTMLDivElement>,
  endpoint: "left" | "right"
) {
  const timelineStore = useTimeLineChartStore();
  const {
    startDependencyDrag,
    updateDependencyDragCursor,
    setDependencyDragTarget,
    endDependencyDrag,
    dependencyDragState,
  } = timelineStore;

  const blocksMap = timelineStore.blocksMap;
  const blockIds = timelineStore.blockIds;

  const issueDetailStore = useIssueDetail();
  // The relation store property may not be defined if the store hasn't been initialized yet.
  const relationMap = issueDetailStore?.relation?.relationMap;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    e.stopPropagation();

    const ganttContainerElement = ganttContainerRef.current;
    if (!ganttContainerElement) return;

    startDependencyDrag(block.id, endpoint);

    const ganttContainerDimensions = ganttContainerElement.getBoundingClientRect();

    const handleMouseMove = (e: MouseEvent) => {
      const cursorX = e.clientX - ganttContainerDimensions.left + ganttContainerElement.scrollLeft;
      const cursorY = e.clientY - ganttContainerDimensions.top + ganttContainerElement.scrollTop;

      updateDependencyDragCursor(cursorX, cursorY);

      // Determine target block (if any)
      if (!blockIds || !blocksMap) return;

      const rowIndex = Math.floor(cursorY / BLOCK_HEIGHT);

      if (rowIndex >= 0 && rowIndex < blockIds.length) {
        const targetBlockId = blockIds[rowIndex];
        const targetBlock = blocksMap[targetBlockId];

        if (targetBlock && targetBlock.position) {
          // Determine target endpoint based on cursor position within block
          const blockCenterX = targetBlock.position.marginLeft + targetBlock.position.width / 2;
          const targetEndpoint = cursorX < blockCenterX ? "left" : "right";

          // Check if target is valid (not same block, no cycle)
          const isSameBlock = targetBlockId === block.id;
          const wouldCreateCycle = detectCycleInMemory(relationMap ?? {}, block.id, targetBlockId) !== null;
          const isValidTarget = !isSameBlock && !wouldCreateCycle;

          setDependencyDragTarget(targetBlockId, targetEndpoint, isValidTarget);
        } else {
          setDependencyDragTarget(null, null, false);
        }
      } else {
        setDependencyDragTarget(null, null, false);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      const { hoveredTargetBlockId, hoveredTargetEndpoint, sourceEndpoint, isValidTarget } = dependencyDragState;

      // If no valid target or no target at all, just end drag (AC4.7: drop on empty space)
      if (!hoveredTargetBlockId || !hoveredTargetEndpoint || !isValidTarget) {
        endDependencyDrag();
        return;
      }

      // Create relation asynchronously without blocking
      const createRelation = async () => {
        try {
          const relationType = inferRelationType(sourceEndpoint ?? endpoint, hoveredTargetEndpoint);
          await issueDetailStore?.relation?.createCurrentRelation(block.id, relationType, hoveredTargetBlockId);
        } catch {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Failed to create dependency",
            message: "Unable to create the dependency relation. It may create a cycle or violate other constraints.",
          });
        }
      };

      void createRelation();
      endDependencyDrag();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return handleMouseDown;
}
