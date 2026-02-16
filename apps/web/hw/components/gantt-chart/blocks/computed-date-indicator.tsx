/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

type Props = {
  isComputedDate: boolean;
};

export const ComputedDateIndicator = observer(function ComputedDateIndicator({ isComputedDate }: Props) {
  if (!isComputedDate) return null;

  return (
    <span className="absolute -top-1 -left-1 text-[10px] leading-none bg-custom-background-100 text-custom-text-300 rounded px-0.5">
      auto
    </span>
  );
});
