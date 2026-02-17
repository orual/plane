/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CPM tooltip content (CE stub) — returns null for community edition.
 *
 * This stub satisfies the same interface as the HW implementation
 * but does not render any CPM data.
 */

type Props = {
  blockId: string;
};

export function CpmTooltipContent(_props: Props) {
  return null;
}
