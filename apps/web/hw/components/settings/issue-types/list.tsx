/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
// components
import { CountChip } from "@/components/common/count-chip";
import { IssueTypeListItem } from "./list-item";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";

type Props = {
  workspaceSlug: string;
  issueTypes: TIssueType[];
  selectedTypeId: string | null;
  isAdmin: boolean;
  onSelectType: (typeId: string) => void;
  onCreateType: () => void;
  onEditType: (issueType: TIssueType) => void;
  onDeleteType: (issueType: TIssueType) => void;
};

export const IssueTypeList = observer(function IssueTypeList(props: Props) {
  const { issueTypes, selectedTypeId, isAdmin, onSelectType, onCreateType, onEditType, onDeleteType } = props;
  const { t } = useTranslation();

  // Sort: default types first, then alphabetically by name
  const sortedTypes = [...issueTypes].sort((a, b) => {
    if (a.is_default !== b.is_default) {
      return a.is_default ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div data-test="issue-type-list" className="flex flex-col h-full bg-surface-0 border-r border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <h3 className="text-h4-medium text-primary">{t("workspace_settings.settings.issue_types.title")}</h3>
          {sortedTypes.length > 0 && <CountChip count={sortedTypes.length} />}
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={onCreateType} data-test="issue-type-create-btn">
            Add
          </Button>
        )}
      </div>

      {/* List or empty state */}
      <div className="flex-1 overflow-y-auto">
        {sortedTypes.length > 0 ? (
          <div className="space-y-0">
            {sortedTypes.map((issueType) => (
              <IssueTypeListItem
                key={issueType.id}
                issueType={issueType}
                isSelected={selectedTypeId === issueType.id}
                isAdmin={isAdmin}
                onClick={() => onSelectType(issueType.id)}
                onEdit={() => onEditType(issueType)}
                onDelete={() => onDeleteType(issueType)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center text-tertiary p-4">
            <div>
              <p className="text-sm">{t("workspace_settings.settings.issue_types.no_types")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
