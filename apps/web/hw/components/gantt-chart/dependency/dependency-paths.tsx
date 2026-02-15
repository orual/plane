/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { Connector } from "./connector";
import type { TIssueRelationTypes, IGanttBlock } from "@plane/types";
import { EIssueServiceType } from "@plane/types";

type Props = {
  isEpic?: boolean;
};

/**
 * SVG overlay component that renders dependency connectors between gantt blocks.
 *
 * This component:
 * - Reads block data from the timeline store (blocksMap, blockIds)
 * - Reads relation data from the issue detail relation store
 * - Computes visible dependencies by checking which blocks have both source and target
 * - Renders an SVG overlay with connector lines between dependent blocks
 * - Filters to only render connectors where both endpoints are visible and have position data
 *
 * The SVG is positioned absolutely to overlay the blocks container and doesn't interfere
 * with block interactions (pointer-events: none).
 */
export const TimelineDependencyPaths = observer(function TimelineDependencyPaths({ isEpic = false }: Props) {
  // Get timeline store
  const timelineStore = useTimeLineChartStore();

  // Get issue detail store for relations
  const issueDetailStore = useIssueDetail(isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES);

  // Get block data from timeline store
   
  const blocksMap = (timelineStore as unknown as Record<string, unknown>).blocksMap as
    | Record<string, IGanttBlock>
    | undefined;
   
  const blockIds = (timelineStore as unknown as Record<string, unknown>).blockIds as string[] | undefined;

  // Get relation data from issue detail store
   
  const relationMap = (issueDetailStore?.relation as unknown as Record<string, unknown>).relationMap as
    | Record<string, Record<TIssueRelationTypes, string[]>>
    | undefined;

  // Early return if required data is missing
  if (!blocksMap || !blockIds || !relationMap) {
    return null;
  }

  // Compute visible dependencies
  // For each block, check which blocks depend on it
  const visibleDependencies: Array<{
    sourceBlockId: string;
    targetBlockId: string;
    sourceRowIndex: number;
    targetRowIndex: number;
    relationType: TIssueRelationTypes;
  }> = [];

  // Iterate through all blocks to find scheduling relations
  for (const blockId of blockIds) {
    const blockRelations = relationMap[blockId];
    if (!blockRelations) continue;

    // Check for scheduling relation types only
    const schedulingTypes: TIssueRelationTypes[] = [
      "blocking",
      "blocked_by",
      "start_before",
      "start_after",
      "finish_before",
      "finish_after",
      "implemented_by",
      "implements",
    ];

    for (const relationType of schedulingTypes) {
      const relatedBlockIds = blockRelations[relationType];
      if (!relatedBlockIds || relatedBlockIds.length === 0) continue;

      for (const relatedBlockId of relatedBlockIds) {
        // Only render if both source and target blocks are in the visible list
        const sourceRowIndex = blockIds.indexOf(blockId);
        const targetRowIndex = blockIds.indexOf(relatedBlockId);

        if (sourceRowIndex === -1 || targetRowIndex === -1) continue;

        const sourceBlock = blocksMap[blockId];
        const targetBlock = blocksMap[relatedBlockId];

        // Skip if either block is missing or lacks position data
        if (!sourceBlock || !targetBlock || !sourceBlock.position || !targetBlock.position) continue;

        // Add to visible dependencies
        visibleDependencies.push({
          sourceBlockId: blockId,
          targetBlockId: relatedBlockId,
          sourceRowIndex,
          targetRowIndex,
          relationType,
        });
      }
    }
  }

  // If no visible dependencies, render empty SVG
  if (visibleDependencies.length === 0) {
    return (
      <svg
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{
          overflow: "visible",
        }}
      >
        <defs>
          <marker id="dep-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
          </marker>
        </defs>
      </svg>
    );
  }

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{
        overflow: "visible",
      }}
    >
      <defs>
        <marker id="dep-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
        </marker>
      </defs>
      <g>
        {visibleDependencies.map((dep) => (
          <Connector
            key={`${dep.sourceBlockId}-${dep.targetBlockId}-${dep.relationType}`}
            sourceBlock={blocksMap[dep.sourceBlockId]}
            targetBlock={blocksMap[dep.targetBlockId]}
            sourceRowIndex={dep.sourceRowIndex}
            targetRowIndex={dep.targetRowIndex}
            relationType={dep.relationType}
          />
        ))}
      </g>
    </svg>
  );
});
