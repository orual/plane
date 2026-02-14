/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { ToggleSwitch } from "@plane/ui";

type Props = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export const PropertyBooleanField: React.FC<Props> = ({ value, onChange, disabled }) => (
  <ToggleSwitch value={value ?? false} onChange={(val) => onChange(val)} disabled={disabled} size="sm" />
);
