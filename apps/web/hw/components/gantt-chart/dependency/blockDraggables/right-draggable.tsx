/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import type { RefObject } from "react";
import type { IGanttBlock, TIssueRelationTypes } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// helpers
import { detectCycleInMemory, inferRelationType } from "../../../../helpers/dependency-validation";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";

type RightDependencyDraggableProps = {
  block: IGanttBlock;
  ganttContainerRef: RefObject<HTMLDivElement>;
};

export const RightDependencyDraggable = observer(function RightDependencyDraggable(
  props: RightDependencyDraggableProps
) {
  const { block, ganttContainerRef } = props;
  const handleRef = useRef<HTMLDivElement>(null);

  // stores
  const timelineStore = useTimeLineChartStore();
  const {
    startDependencyDrag,
    updateDependencyDragCursor,
    setDependencyDragTarget,
    endDependencyDrag,
    dependencyDragState,
  } = timelineStore;

  // Access blocksMap and blockIds through type casting (they exist on the store but not in the interface)
  const blocksMap = (timelineStore as unknown as Record<string, unknown>).blocksMap as
    | Record<string, IGanttBlock>
    | undefined;
  const blockIds = (timelineStore as unknown as Record<string, unknown>).blockIds as string[] | undefined;

  const issueDetailStore = useIssueDetail();
  // Get relation data from issue detail store
  const relationMap = issueDetailStore?.relation
    ? ((issueDetailStore.relation as unknown as Record<string, unknown>).relationMap as
        | Record<string, Record<TIssueRelationTypes, string[]>>
        | undefined)
    : undefined;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    e.stopPropagation();

    const ganttContainerElement = ganttContainerRef.current;
    if (!ganttContainerElement) return;

    startDependencyDrag(block.id, "right");

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

      // If no valid target or no target at all, just end drag
      if (!hoveredTargetBlockId || !hoveredTargetEndpoint || !isValidTarget) {
        endDependencyDrag();
        return;
      }

      // Create relation asynchronously without blocking
      const createRelation = async () => {
        try {
          const relationType = inferRelationType(sourceEndpoint ?? "right", hoveredTargetEndpoint);
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

  return (
    <div
      ref={handleRef}
      role="button"
      tabIndex={0}
      className="group-hover:opacity-100 absolute h-2 w-2 rounded-full bg-accent-primary opacity-0 cursor-crosshair"
      style={{
        right: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleMouseDown(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
    />
  );
});
