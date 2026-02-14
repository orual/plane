/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { Input } from "@plane/ui";

type Props = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const PropertyTextField: React.FC<Props> = ({ value, onChange, disabled, placeholder }) => (
  <Input
    type="text"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value || null)}
    disabled={disabled}
    placeholder={placeholder}
    className="h-8 text-sm"
  />
);
