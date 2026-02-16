/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties } from "react";

export function applyCriticalBlockStyle(
  _store: unknown,
  _blockId: string,
  baseStyle: CSSProperties
): { style: CSSProperties; isCritical: boolean } {
  return { style: baseStyle, isCritical: false };
}
