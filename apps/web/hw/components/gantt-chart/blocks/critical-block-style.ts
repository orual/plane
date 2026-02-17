/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Pure function that computes critical-path block styling. Called inside the
 * existing block observer — no per-block MobX observer overhead.
 */

import type { CSSProperties } from "react";

const CRITICAL_COLOR = "rgb(239 68 68)"; // red-500

type CpmStoreView = {
  cpmEnabled: boolean;
  isCritical: (blockId: string) => boolean;
  getComputedDates: (blockId: string) => { start_date: string; target_date: string } | null;
};

type CriticalBlockResult = {
  style: CSSProperties;
  isCritical: boolean;
};

export function applyCriticalBlockStyle(
  store: CpmStoreView,
  blockId: string,
  baseStyle: CSSProperties
): CriticalBlockResult {
  if (!store.cpmEnabled) return { style: baseStyle, isCritical: false };

  const isCritical = store.isCritical(blockId);
  if (!isCritical) return { style: baseStyle, isCritical: false };

  const computedDates = store.getComputedDates(blockId);
  const isComputed = computedDates !== null;

  return {
    style: {
      ...baseStyle,
      backgroundColor: CRITICAL_COLOR,
      ...(isComputed ? { borderStyle: "dashed", borderWidth: "1.5px", borderColor: CRITICAL_COLOR } : {}),
    },
    isCritical: true,
  };
}
