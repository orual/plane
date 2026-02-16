/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CE stub: CPM types matching the HW version.
 * computeCpm returns empty results — CPM calculation is HW-only.
 */

export type CpmResult = {
  es: string; // Early Start (ISO date string YYYY-MM-DD)
  ef: string; // Early Finish (ISO date string YYYY-MM-DD)
  ls: string; // Late Start (ISO date string YYYY-MM-DD)
  lf: string; // Late Finish (ISO date string YYYY-MM-DD)
  slack: number; // Total float in days
  isCritical: boolean; // slack === 0
};

export type CpmResultMap = Map<string, CpmResult>;

export function computeCpm(): CpmResultMap {
  return new Map();
}
