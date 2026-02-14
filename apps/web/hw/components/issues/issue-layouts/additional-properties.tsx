/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { useMemo } from "react";
import { observer } from "mobx-react";
import { useRootStore } from "@/hooks/store/use-root-store";
import { useIssuePropertyValues } from "@/plane-web/hooks/use-issue-properties";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

/**
 * Compact display of issue type and custom properties in layout views.
 */
export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { displayProperties, issue } = props;
  const { issueTypeStore, issuePropertyStore } = useRootStore() as any;

  const { values: propertyValues } = useIssuePropertyValues(
    issue.workspace_id as string,
    issue.project_id as string,
    issue.id
  );

  // Build value display map
  const valueDisplayItems = useMemo(() => {
    const definitions = (issuePropertyStore?.getAllDefinitions?.() ?? []) as Array<{
      id: string;
      name: string;
    }>;

    if (definitions.length === 0 || propertyValues.length === 0) return [];

    return definitions
      .map((def: any) => {
        const pv = (propertyValues as any[]).find((v: any) => v.property_definition_id === def.id);
        const rawValue = pv?.value?.value ?? null;
        if (rawValue === null || rawValue === undefined) return null;

        let displayValue: string;
        if (Array.isArray(rawValue)) {
          displayValue = rawValue.join(", ");
        } else if (typeof rawValue === "boolean") {
          displayValue = rawValue ? "Yes" : "No";
        } else {
          displayValue = String(rawValue);
        }

        return { id: def.id, name: def.name, displayValue };
      })
      .filter(Boolean);
  }, [issuePropertyStore, propertyValues]);

  // Issue type display (preserved from Phase 3)
  const issueType =
    displayProperties?.issue_type && issue.type_id ? issueTypeStore?.getIssueTypeById?.(issue.type_id) : null;

  if (!issueType && valueDisplayItems.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Issue type badge (preserved from Phase 3) */}
      {issueType && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-layer-1 rounded-full">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
          <span className="text-xs font-medium text-secondary">{issueType.name}</span>
        </div>
      )}

      {/* Custom property values */}
      {valueDisplayItems.map((item: any) => (
        <div key={item.id} className="inline-flex items-center gap-1 rounded bg-custom-background-90 px-2 py-1 text-xs">
          <span className="font-medium text-custom-text-300">{item.name}:</span>
          <span className="text-custom-text-200">{item.displayValue}</span>
        </div>
      ))}
    </div>
  );
});
