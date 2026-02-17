/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type Props = {
  isComputedDate: boolean;
};

export function ComputedDateIndicator({ isComputedDate }: Props) {
  if (!isComputedDate) return null;

  return (
    <span className="absolute -top-2.5 left-1 z-[2] text-[9px] leading-none font-medium bg-surface-1 text-custom-primary-600 rounded-sm px-1 py-0.5 shadow-xs border border-custom-primary-200">
      auto
    </span>
  );
}
