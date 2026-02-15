/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
// hooks
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type ConflictIndicatorProps = {
  blockId: string;
};

export const ConflictIndicator = observer(function ConflictIndicator(props: ConflictIndicatorProps) {
  const { blockId } = props;

  // store hooks
  const { getDependencyConflicts } = useTimeLineChartStore();

  const conflicts = getDependencyConflicts(blockId);

  // If no conflicts, render nothing
  if (conflicts.length === 0) {
    return null;
  }

  // Build tooltip content listing all conflicts
  const tooltipContent = conflicts.map((conflict) => conflict.message).join("; ");

  return (
    <Tooltip tooltipContent={tooltipContent}>
      <div className="absolute -top-1 -right-1 z-10">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} />
      </div>
    </Tooltip>
  );
});
