/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties } from "react";
import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type Props = {
  blockId: string;
  baseStyle: CSSProperties;
  children: React.ReactNode;
};

const CRITICAL_COLOR = "rgb(239 68 68)"; // red-500

export const CriticalBlockStyle = observer(function CriticalBlockStyle({
  blockId,
  baseStyle,
  children,
}: Props) {
  const timelineStore = useTimeLineChartStore();

  if (!timelineStore.cpmEnabled) {
    return <div style={baseStyle}>{children}</div>;
  }

  const isCritical = timelineStore.isCritical(blockId);
  const computedDates = timelineStore.getComputedDates(blockId);
  const isComputed = computedDates !== null;

  if (!isCritical) {
    return <div style={baseStyle}>{children}</div>;
  }

  const criticalStyle: CSSProperties = {
    ...baseStyle,
    backgroundColor: CRITICAL_COLOR,
    ...(isComputed ? { borderStyle: "dashed", borderWidth: "1.5px", borderColor: CRITICAL_COLOR } : {}),
  };

  return (
    <div style={criticalStyle} data-test="cpm-critical-block" data-test-issue-id={blockId}>
      {children}
    </div>
  );
});
