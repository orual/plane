/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ToggleSwitch } from "@plane/ui";

type PropertyBooleanFieldProps = {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/**
 * Boolean property field using a toggle switch.
 * Null values are treated as false — once toggled, the value cannot be cleared
 * back to null. This is intentional: boolean properties are always true or false.
 */
export function PropertyBooleanField({ value, onChange, disabled }: PropertyBooleanFieldProps) {
  return <ToggleSwitch value={value ?? false} onChange={(val) => onChange(val)} disabled={disabled} size="sm" />;
}
