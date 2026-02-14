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
} from "../issue-details/property-fields";
import type { TPropertyType, IIssuePropertyValueUpsertItem } from "@/plane-web/types";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

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

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties({
  workspaceSlug,
  projectId,
  workItemId,
  isDraft,
}: TWorkItemModalAdditionalPropertiesProps) {
  const propertyStore = useIssueProperties();
  const { values: propertyValues, upsertValues } = useIssuePropertyValues(
    workspaceSlug,
    projectId ?? undefined,
    workItemId
  );

  const [pendingChanges, setPendingChanges] = useState<Record<string, string | number | boolean | string[] | null>>({});
  const debouncedChanges = useDebounce(pendingChanges, 1000);

  const definitions = (propertyStore.getAllDefinitions?.() ?? []) as Array<{
    id: string;
    name: string;
    is_required: boolean;
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

  // Auto-save only for non-draft existing issues
  useEffect(() => {
    const keys = Object.keys(debouncedChanges);
    if (isDraft || keys.length === 0 || !projectId || !workItemId) return;

    const items: IIssuePropertyValueUpsertItem[] = keys.map((defId) => ({
      property_definition_id: defId,
      value: { value: debouncedChanges[defId] },
    }));

    void upsertValues(items);
    setPendingChanges({});
  }, [debouncedChanges, upsertValues, isDraft, projectId, workItemId]);

  if (definitions.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-custom-border-200 pt-4">
      <div className="text-sm font-medium text-custom-text-200">Custom properties</div>
      <div className="space-y-3">
        {definitions.map((def) => (
          <div key={def.id} className="space-y-1">
            <label className="block text-xs font-medium text-custom-text-300">
              {def.name}
              {def.is_required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
            {renderField(
              def.property_type,
              displayValues[def.id] ?? null,
              (newValue) => handleChange(def.id, newValue),
              def.options,
              false
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
