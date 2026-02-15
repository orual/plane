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
      <div className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-warning-primary shadow-sm">
        <AlertTriangle className="h-3 w-3 text-white" strokeWidth={2.5} fill="none" />
      </div>
    </Tooltip>
  );
});
