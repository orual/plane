/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Slack bar position helper — computes pixel position and width for rendering slack extension bars.
 *
 * Given a CpmResult and chart data, calculates the pixel left position and width corresponding to
 * the slack (float) period from Early Finish to Late Finish. Returns null if the task is critical
 * (no slack to display) or if the calculated width is non-positive.
 */

import type { ChartDataType } from "@plane/types";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";
import { getPositionFromDate } from "@/components/gantt-chart/views/helpers";

type SlackBarPosition = {
  left: number;
  width: number;
};

/**
 * Computes the pixel position and width of a slack extension bar.
 *
 * A slack bar extends from Early Finish (EF) to Late Finish (LF). For critical tasks
 * (isCritical=true or slack=0), no bar is needed, so null is returned. For non-critical
 * tasks with positive slack, the bar width equals the distance between EF and LF positions
 * in pixels.
 *
 * @param cpmResult — CPM result with es, ef, ls, lf, slack, and isCritical flag
 * @param chartData — chart configuration with date range and day width
 * @param offsetWidth — width offset for position calculation (typically 0 or negative for end-of-day)
 * @returns SlackBarPosition with left and width, or null if no bar should be rendered
 */
export function getSlackBarPosition(
  cpmResult: Readonly<CpmResult>,
  chartData: ChartDataType,
  offsetWidth: number
): SlackBarPosition | null {
  // Don't render slack bars for critical tasks
  if (cpmResult.isCritical || cpmResult.slack <= 0) return null;

  // Calculate pixel positions for EF and LF
  const efPosition = getPositionFromDate(chartData, cpmResult.ef, offsetWidth);
  const lfPosition = getPositionFromDate(chartData, cpmResult.lf, offsetWidth);
  const width = lfPosition - efPosition;

  // Don't render if width is non-positive (shouldn't happen, but defensive)
  if (width <= 0) return null;

  return { left: efPosition, width };
}
