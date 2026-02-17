/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CE stub for slack bar position helper — community edition does not support slack visualization.
 */

import type { ChartDataType } from "@plane/types";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";

type SlackBarPosition = {
  left: number;
  width: number;
};

export function getSlackBarPosition(
  _cpmResult: Readonly<CpmResult>,
  _chartData: ChartDataType,
  _offsetWidth: number
): SlackBarPosition | null {
  return null;
}
