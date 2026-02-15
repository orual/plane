/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPropertyType } from "@/plane-web/types";
import {
  PropertyTextField,
  PropertyNumberField,
  PropertySelectField,
  PropertyMultiSelectField,
  PropertyUrlField,
  PropertyDateField,
  PropertyBooleanField,
} from "./index";

/**
 * Renders a single property field based on its type.
 */
export function renderPropertyField(
  propertyType: TPropertyType,
  value: string | number | boolean | string[] | null,
  onChange: (newValue: string | number | boolean | string[] | null) => void,
  options: string[],
  disabled: boolean
): React.ReactNode {
  switch (propertyType) {
    case "text":
      return (
        <PropertyTextField
          value={value as string | null}
          onChange={onChange}
          disabled={disabled}
          placeholder="Enter text"
        />
      );
    case "number":
      return (
        <PropertyNumberField
          value={value as number | null}
          onChange={onChange}
          disabled={disabled}
          placeholder="Enter number"
        />
      );
    case "url":
      return <PropertyUrlField value={value as string | null} onChange={onChange} disabled={disabled} />;
    case "date":
      return <PropertyDateField value={value as string | null} onChange={onChange} disabled={disabled} />;
    case "boolean":
      return (
        <PropertyBooleanField value={value as boolean | null} onChange={(val) => onChange(val)} disabled={disabled} />
      );
    case "select":
      return (
        <PropertySelectField value={value as string | null} onChange={onChange} options={options} disabled={disabled} />
      );
    case "multi_select":
      return (
        <PropertyMultiSelectField
          value={value as string[] | null}
          onChange={onChange}
          options={options}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}
