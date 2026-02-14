/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";

type Props = {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  options: string[];
  disabled?: boolean;
};

export const PropertyMultiSelectField: React.FC<Props> = ({ value, onChange, options, disabled }) => {
  const selected = value ?? [];

  const handleToggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt];
    onChange(next.length > 0 ? next : null);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
            selected.includes(opt)
              ? "bg-custom-primary-100/20 text-custom-primary-100"
              : "bg-custom-background-90 text-custom-text-200 hover:bg-custom-background-80"
          } ${disabled ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => handleToggle(opt)}
            disabled={disabled}
            className="sr-only"
          />
          {opt}
        </label>
      ))}
    </div>
  );
};
