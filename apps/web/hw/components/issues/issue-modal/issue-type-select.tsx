/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldPath } from "react-hook-form";
// store hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// plane imports
import type { EditorRefApi } from "@plane/editor";
// types
import type { TBulkIssueProperties, TIssue } from "@plane/types";
// components
import { CustomSelect } from "@plane/ui";

export type TIssueFields = TIssue & TBulkIssueProperties;

export type TIssueTypeDropdownVariant = "xs" | "sm";

export type TIssueTypeSelectProps<T extends Partial<TIssueFields>> = {
  control: Control<T>;
  projectId: string | null;
  editorRef?: React.MutableRefObject<EditorRefApi | null>;
  disabled?: boolean;
  variant?: TIssueTypeDropdownVariant;
  placeholder?: string;
  isRequired?: boolean;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  showMandatoryFieldInfo?: boolean;
  handleFormChange?: () => void;
};

export function IssueTypeSelect<T extends Partial<TIssueFields>>(props: TIssueTypeSelectProps<T>) {
  const {
    control,
    projectId: _projectId,
    editorRef: _editorRef,
    disabled = false,
    variant: _variant = "sm",
    placeholder = "Select issue type",
    isRequired: _isRequired = false,
    renderChevron = true,
    dropDownContainerClassName,
    showMandatoryFieldInfo: _showMandatoryFieldInfo = false,
    handleFormChange,
  } = props;

  // store
  const {
    workspaceRoot: { currentWorkspace },
    issueTypeStore,
  } = useRootStore();

  // derived values
  const workspaceSlug = currentWorkspace?.slug;
  const issueTypes = useMemo(
    () => (workspaceSlug ? issueTypeStore.getWorkspaceIssueTypes(workspaceSlug) : []),
    [issueTypeStore, workspaceSlug]
  );

  return (
    <Controller
      control={control}
      name={"type_id" as FieldPath<T>}
      render={({ field: { value, onChange } }) => (
        <CustomSelect
          value={value}
          onChange={(newValue: string | null) => {
            onChange(newValue);
            handleFormChange?.();
          }}
          disabled={disabled || issueTypes.length === 0}
          label={placeholder}
          buttonClassName={dropDownContainerClassName}
          noChevron={!renderChevron}
        >
          {issueTypes.map((issueType) => (
            <CustomSelect.Option key={issueType.id} value={issueType.id}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
                <span>{issueType.name}</span>
              </div>
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      )}
    />
  );
}
