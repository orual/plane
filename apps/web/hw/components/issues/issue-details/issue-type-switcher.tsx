/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// store hooks
import { useRootStore } from "@/hooks/store/use-root-store";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// plane imports
import { CustomSelect } from "@plane/ui";
// types
import type { TIssue } from "@plane/types";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;

  // store
  const {
    workspaceRoot: { currentWorkspace },
    issueTypeStore,
  } = useRootStore();

  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();

  // derived values
  const workspaceSlug = currentWorkspace?.slug;
  const issue = getIssueById(issueId);
  const currentTypeId = issue?.type_id;

  const issueTypes = useMemo(
    () => (workspaceSlug ? issueTypeStore.getWorkspaceIssueTypes(workspaceSlug) : []),
    [issueTypeStore, workspaceSlug]
  );

  const handleIssueTypeChange = async (newTypeId: string | null) => {
    if (!issue || !workspaceSlug || !newTypeId || !issue.project_id) return;

    try {
      const updateData: Partial<TIssue> = {
        type_id: newTypeId,
      };
      // type_id is an HW extension not yet in the core TIssue type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      await updateIssue(workspaceSlug, issue.project_id, issueId, updateData as any);
    } catch (error) {
      console.error("Failed to update issue type:", error);
    }
  };

  if (!issue) return null;

  const selectedType = issueTypes.find((it) => it.id === currentTypeId);

  return (
    <CustomSelect
      value={currentTypeId}
      onChange={handleIssueTypeChange}
      disabled={disabled || issueTypes.length === 0}
      label={
        selectedType ? (
          <span className="flex items-center gap-2">
            <span
              className="h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selectedType.logo_props.color }}
            />
            <span className="truncate">{selectedType.name}</span>
          </span>
        ) : (
          "Select type"
        )
      }
      noChevron={false}
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
  );
});
