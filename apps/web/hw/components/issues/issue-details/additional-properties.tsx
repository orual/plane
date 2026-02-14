/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useDebounce from "@/hooks/use-debounce";
import { useIssueProperties, useIssuePropertyValues } from "@/plane-web/hooks/use-issue-properties";
import {
  PropertyTextField,
  PropertyNumberField,
  PropertySelectField,
  PropertyMultiSelectField,
  PropertyUrlField,
  PropertyDateField,
  PropertyBooleanField,
} from "./property-fields";
import type { TPropertyType, IIssuePropertyValueUpsertItem } from "@/plane-web/types";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

/**
 * Renders a single property field based on its type.
 */
const renderField = (
  propertyType: TPropertyType,
  value: string | number | boolean | string[] | null,
  onChange: (newValue: string | number | boolean | string[] | null) => void,
  options: string[],
  disabled: boolean
) => {
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
};

export const WorkItemAdditionalSidebarProperties = observer(function WorkItemAdditionalSidebarProperties({
  workItemId,
  projectId,
  workspaceSlug,
  isEditable,
}: TWorkItemAdditionalSidebarProperties) {
  const propertyStore = useIssueProperties();
  const { values: propertyValues, upsertValues } = useIssuePropertyValues(workspaceSlug, projectId, workItemId);

  const [pendingChanges, setPendingChanges] = useState<Record<string, string | number | boolean | string[] | null>>({});
  const debouncedChanges = useDebounce(pendingChanges, 1000);

  const definitions = (propertyStore.getAllDefinitions?.() ?? []) as Array<{
    id: string;
    name: string;
    property_type: TPropertyType;
    options: string[];
  }>;

  const currentValueMap = useMemo(() => {
    const map: Record<string, string | number | boolean | string[] | null> = {};
    (propertyValues as any[]).forEach((pv: any) => {
      map[pv.property_definition_id] = pv.value?.value ?? null;
    });
    return map;
  }, [propertyValues]);

  const displayValues = useMemo(() => ({ ...currentValueMap, ...pendingChanges }), [currentValueMap, pendingChanges]);

  const handleChange = useCallback((definitionId: string, newValue: string | number | boolean | string[] | null) => {
    setPendingChanges((prev) => ({ ...prev, [definitionId]: newValue }));
  }, []);

  useEffect(() => {
    const keys = Object.keys(debouncedChanges);
    if (keys.length === 0) return;

    const items: IIssuePropertyValueUpsertItem[] = keys.map((defId) => ({
      property_definition_id: defId,
      value: { value: debouncedChanges[defId] },
    }));

    void upsertValues(items);
    setPendingChanges({});
  }, [debouncedChanges, upsertValues]);

  if (definitions.length === 0) return null;

  return (
    <div className="space-y-3">
      {definitions.map((def) => (
        <div key={def.id} className="flex items-start gap-2">
          <div className="flex w-30 shrink-0 items-center text-xs text-custom-text-300 h-8">
            <span className="truncate">{def.name}</span>
          </div>
          <div className="grow">
            {renderField(
              def.property_type,
              displayValues[def.id] ?? null,
              (newValue) => handleChange(def.id, newValue),
              def.options,
              !isEditable
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
