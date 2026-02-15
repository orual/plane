/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type PropertySelectFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
};

export function PropertySelectField({ value, onChange, options, disabled, placeholder }: PropertySelectFieldProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className="h-8 w-full rounded border border-custom-border-200 bg-custom-background-100 px-2 text-sm text-custom-text-100 focus:outline-none focus:ring-1 focus:ring-custom-primary-100"
    >
      <option value="">{placeholder ?? "Select..."}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
