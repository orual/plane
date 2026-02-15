/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Input } from "@plane/ui";

type PropertyNumberFieldProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function PropertyNumberField({ value, onChange, disabled, placeholder }: PropertyNumberFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      onChange(null);
    } else {
      const parsed = Number(raw);
      if (!isNaN(parsed)) onChange(parsed);
    }
  };

  return (
    <Input
      type="number"
      value={value !== null && value !== undefined ? String(value) : ""}
      onChange={handleChange}
      disabled={disabled}
      placeholder={placeholder}
      className="h-8 text-sm"
    />
  );
}
