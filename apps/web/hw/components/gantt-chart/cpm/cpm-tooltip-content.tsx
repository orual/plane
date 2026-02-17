/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CPM popover content — renders CPM scheduling data inside the block's
 * hover popover, below the WorkItemPreviewCard.
 *
 * Displays:
 * - For critical tasks: "On critical path — zero slack"
 * - For non-critical tasks: ES, EF, LS, LF dates and total float (slack)
 *
 * Returns null when CPM is disabled or the block has no CPM result.
 */

import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type Props = {
  blockId: string;
};

export const CpmTooltipContent = observer(function CpmTooltipContent({ blockId }: Props) {
  const timelineStore = useTimeLineChartStore();

  if (!timelineStore.cpmEnabled) return null;

  const cpmResult = timelineStore.cpmResults.get(blockId);
  if (!cpmResult) return null;

  if (cpmResult.isCritical) {
    return (
      <div className="px-3 py-2 text-xs text-red-500 border-t border-custom-border-200">
        On critical path — zero slack
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-xs border-t border-custom-border-200 space-y-1">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-custom-text-300">Early start</span>
        <span>{cpmResult.es}</span>
        <span className="text-custom-text-300">Early finish</span>
        <span>{cpmResult.ef}</span>
        <span className="text-custom-text-300">Late start</span>
        <span>{cpmResult.ls}</span>
        <span className="text-custom-text-300">Late finish</span>
        <span>{cpmResult.lf}</span>
      </div>
      <div className="pt-1 text-custom-text-300">Total float: {cpmResult.slack.toFixed(1)} days</div>
    </div>
  );
});
