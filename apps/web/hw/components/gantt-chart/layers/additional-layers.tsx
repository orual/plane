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
 * Each slack bar shows a hover tooltip with CPM scheduling data (ES/EF/LS/LF/slack),
 * following the same cursor-tracking pattern as the dependency connector tooltip.
 */

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import type { FC } from "react";
import { EIssueServiceType } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { PhantomAnchor } from "@/plane-web/components/gantt-chart";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { getSlackBarPosition } from "@/plane-web/helpers/slack-bar-position";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";

type Props = {
  itemsContainerWidth: number;
  blockCount: number;
};

const CURSOR_OFFSET_X = 12;
const CURSOR_OFFSET_Y = -8;

type SlackBarProps = {
  blockId: string;
  cpmResult: CpmResult;
  left: number;
  width: number;
  top: number;
  height: number;
};

function SlackBar({ blockId, cpmResult, left, width, top, height }: SlackBarProps) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <>
      <div
        key={`slack-${blockId}`}
        className="absolute rounded-sm"
        data-test="cpm-slack-bar"
        data-test-issue-id={blockId}
        style={{
          left,
          width,
          top,
          height,
          backgroundColor: "rgba(60, 133, 217, 0.3)",
          pointerEvents: "auto",
          cursor: "default",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseMove={handleMouseMove}
      />
      {hovered &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-subtle bg-layer-2 px-3 py-2 text-xs shadow-lg"
            style={{
              left: mousePos.x + CURSOR_OFFSET_X,
              top: mousePos.y + CURSOR_OFFSET_Y,
              transform: "translateY(-100%)",
            }}
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-tertiary">ES</span>
              <span className="text-primary">{cpmResult.es}</span>
              <span className="text-tertiary">EF</span>
              <span className="text-primary">{cpmResult.ef}</span>
              <span className="text-tertiary">LS</span>
              <span className="text-primary">{cpmResult.ls}</span>
              <span className="text-tertiary">LF</span>
              <span className="text-primary">{cpmResult.lf}</span>
            </div>
            <div className="mt-1 border-t border-subtle pt-1 text-tertiary">
              Float: {cpmResult.slack.toFixed(1)} days
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export const GanttAdditionalLayers: FC<Props> = observer(function GanttAdditionalLayers({
  itemsContainerWidth,
}: Props) {
  const timelineStore = useTimeLineChartStore();
  const issueDetailStore = useIssueDetail(EIssueServiceType.ISSUES);

  if (!timelineStore.cpmEnabled) return null;

  const chartData = timelineStore.currentViewData;
  if (!chartData) return null;

  const blockIds = timelineStore.blockIds;
  if (!blockIds) return null;

  const cpmResults = timelineStore.cpmResults;
  const relationMap = issueDetailStore?.relation?.relationMap;
  if (!relationMap) return null;

  const localBlockIds = new Set(blockIds);

  const externalIssuesWithPosition: Array<{ issueId: string; side: "left" | "right"; blockIndex: number }> = [];
  if (timelineStore.crossProjectCpmEnabled) {
    for (let i = 0; i < blockIds.length; i++) {
      const blockId = blockIds[i];
      const relations = relationMap[blockId];
      if (!relations) continue;

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
          <SlackBar
            key={`slack-${blockId}`}
            blockId={blockId}
            cpmResult={cpmResult}
            left={position.left}
            width={position.width}
            top={index * BLOCK_HEIGHT + 4}
            height={BLOCK_HEIGHT - 8}
          />
        );
      })}

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
