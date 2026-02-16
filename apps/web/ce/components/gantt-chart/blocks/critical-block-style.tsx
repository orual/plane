/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties } from "react";

type Props = {
  blockId: string;
  baseStyle: CSSProperties;
  children: React.ReactNode;
};

export function CriticalBlockStyle({ baseStyle, children }: Props) {
  return <div style={baseStyle}>{children}</div>;
}
