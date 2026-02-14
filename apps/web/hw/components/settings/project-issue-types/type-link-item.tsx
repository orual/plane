/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ToggleSwitch } from "@plane/ui";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { useRootStore } from "@/hooks/store/use-root-store";
import type { TIssueType, TProjectIssueType } from "@/plane-web/types/issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueType: TIssueType;
  linkedProjectIssueType: TProjectIssueType | undefined;
  canPerformActions: boolean;
};

export const TypeLinkItem = observer(function TypeLinkItem({
  workspaceSlug,
  projectId,
  issueType,
  linkedProjectIssueType,
  canPerformActions,
}: Props) {
  const { issueTypeStore } = useRootStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (newValue: boolean) => {
    setIsLoading(true);
    try {
      if (newValue) {
        await issueTypeStore.linkProjectIssueType(workspaceSlug, projectId, issueType.id);
      } else if (linkedProjectIssueType) {
        await issueTypeStore.unlinkProjectIssueType(workspaceSlug, projectId, linkedProjectIssueType.id);
      }
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: newValue ? "Failed to link issue type to project." : "Failed to unlink issue type from project.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-custom-border-100 px-3.5 py-3"
      data-test="project-issue-type-item"
    >
      <div className="flex items-center gap-3 truncate">
        <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
        <div className="truncate">
          <p className="text-sm font-medium text-custom-text-100 truncate">{issueType.name}</p>
          {issueType.description && <p className="text-xs text-custom-text-300 truncate">{issueType.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {linkedProjectIssueType?.is_default && (
          <span
            className="rounded bg-custom-primary-100/20 px-2 py-0.5 text-xs font-medium text-custom-primary-100"
            data-test="project-issue-type-default"
          >
            Default
          </span>
        )}
        <div data-test="project-issue-type-toggle">
          <ToggleSwitch
            value={!!linkedProjectIssueType}
            onChange={(value) => {
              void handleToggle(value);
            }}
            disabled={!canPerformActions || isLoading}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
});
