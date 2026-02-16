/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Slack extension bars — overlay component for CPM visualization.
 *
 * Renders slack (float) extension bars for non-critical tasks when CPM is enabled.
 * Each bar extends from Early Finish (EF) to Late Finish (LF) and is positioned
 * at the block's row y-position with partial opacity.
 *
 * Architecture:
 * - Reads from timelineStore.cpmEnabled flag to conditionally render
 * - Accesses cpmResults Map to get CPM data per block
 * - Uses getSlackBarPosition() to compute pixel positions
 * - Renders as div elements with absolute positioning, no pointer events (behind blocks)
 */

import { observer } from "mobx-react";
import type { FC } from "react";
import { EIssueServiceType } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { PhantomAnchor } from "@/plane-web/components/gantt-chart";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { getSlackBarPosition } from "@/plane-web/helpers/slack-bar-position";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  itemsContainerWidth: number;
  blockCount: number;
};

export const GanttAdditionalLayers: FC<Props> = observer(function GanttAdditionalLayers({
  itemsContainerWidth,
}: Props) {
  const timelineStore = useTimeLineChartStore();
  const issueDetailStore = useIssueDetail(EIssueServiceType.ISSUES);

  // Only render if CPM is enabled
  if (!timelineStore.cpmEnabled) return null;

  const chartData = timelineStore.currentViewData;
  if (!chartData) return null;

  const blockIds = timelineStore.blockIds;
  if (!blockIds) return null;

  const cpmResults = timelineStore.cpmResults;
  const relationMap = issueDetailStore?.relation?.relationMap;
  if (!relationMap) return null;

  const localBlockIds = new Set(blockIds);

  // Identify external issue IDs with their associated block index (only when cross-project mode is enabled)
  const externalIssuesWithPosition: Array<{ issueId: string; side: "left" | "right"; blockIndex: number }> = [];
  if (timelineStore.crossProjectCpmEnabled) {
    for (let i = 0; i < blockIds.length; i++) {
      const blockId = blockIds[i];
      const relations = relationMap[blockId];
      if (!relations) continue;

      // Check all relation types for external issue references
      for (const [relationType, relatedIds] of Object.entries(relations)) {
        if (!relatedIds || !Array.isArray(relatedIds)) continue;

        for (const relatedId of relatedIds) {
          if (!localBlockIds.has(relatedId)) {
            const side = ["blocked_by", "start_after", "finish_after"].includes(relationType) ? "left" : "right";
            externalIssuesWithPosition.push({ issueId: relatedId, side, blockIndex: i });
          }
        }
      }
    }
  }

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: itemsContainerWidth, height: blockIds.length * BLOCK_HEIGHT }}
    >
      {blockIds.map((blockId, index) => {
        const cpmResult = cpmResults.get(blockId);
        if (!cpmResult || cpmResult.isCritical) return null;

        const position = getSlackBarPosition(cpmResult, chartData, 0);
        if (!position) return null;

        return (
          <div
            key={`slack-${blockId}`}
            className="absolute rounded-sm"
            data-test="cpm-slack-bar"
            data-test-issue-id={blockId}
            style={{
              left: position.left,
              width: position.width,
              top: index * BLOCK_HEIGHT + 4,
              height: BLOCK_HEIGHT - 8,
              backgroundColor: "rgba(60, 133, 217, 0.3)",
            }}
          />
        );
      })}

      {/* Render phantom anchors for external issues */}
      {externalIssuesWithPosition.map(({ issueId, side, blockIndex }) => (
        <PhantomAnchor
          key={`phantom-${issueId}-${side}-${blockIndex}`}
          issueId={issueId}
          side={side}
          top={blockIndex * BLOCK_HEIGHT}
        />
      ))}
    </div>
  );
});
