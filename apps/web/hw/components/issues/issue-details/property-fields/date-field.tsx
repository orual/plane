/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
};

export const PropertyDateField: React.FC<Props> = ({ value, onChange, disabled }) => (
  <input
    type="date"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value || null)}
    disabled={disabled}
    className="h-8 w-full rounded border border-custom-border-200 bg-custom-background-100 px-2 text-sm text-custom-text-100 focus:outline-none focus:ring-1 focus:ring-custom-primary-100"
  />
);
