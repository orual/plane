/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Input } from "@plane/ui";

type PropertyUrlFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function PropertyUrlField({ value, onChange, disabled, placeholder }: PropertyUrlFieldProps) {
  return (
    <Input
      type="url"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      placeholder={placeholder ?? "https://example.com"}
      className="h-8 text-sm"
    />
  );
}
