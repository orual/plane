/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EIssueServiceType } from "@plane/types";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { Connector } from "./connector";
import { filterVisibleDependencies } from "./visibility-filter";

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
  const blocksMap = timelineStore.blocksMap;
  const blockIds = timelineStore.blockIds;

  // Get relation data from issue detail store
  // The relation store property may not be defined if the store hasn't been initialized yet.
  const relationMap = issueDetailStore?.relation?.relationMap;

  // Early return if required data is missing
  if (!blocksMap || !blockIds || !issueDetailStore || !relationMap) {
    return null;
  }

  // Compute visible dependencies using the filtering helper
  const visibleDependencies = filterVisibleDependencies(blockIds, blocksMap, relationMap);

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
