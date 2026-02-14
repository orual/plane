/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { CreateUpdateIssueTypeModal } from "./create-update-modal";
import { DeleteIssueTypeModal } from "./delete-modal";
import { IssueTypeList } from "./list";
import { IssueTypeSidePanel } from "./side-panel";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
import { useUserPermissions } from "@/hooks/store/user";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";

type Props = {
  workspaceSlug: string;
};

export const IssueTypesSettingsRoot = observer(function IssueTypesSettingsRoot(props: Props) {
  const { workspaceSlug } = props;

  // store hooks
  const { issueTypeStore, issuePropertyStore } = useRootStore();
  const { allowPermissions } = useUserPermissions();

  // state management
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TIssueType | null>(null);
  const [deletingType, setDeletingType] = useState<TIssueType | null>(null);

  // permission checks
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  // fetch data on mount and when workspace changes
  useEffect(() => {
     
    void issueTypeStore.fetchIssueTypes(workspaceSlug);
     
    void issuePropertyStore.fetchDefinitions(workspaceSlug);
  }, [workspaceSlug, issueTypeStore, issuePropertyStore]);

  // get data from store
  const issueTypes = issueTypeStore.getWorkspaceIssueTypes(workspaceSlug);
  const selectedType = selectedTypeId ? issueTypeStore.getIssueTypeById(selectedTypeId) : null;

  // handlers
  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
  };

  const handleCreateType = () => {
    setEditingType(null);
    setIsCreateModalOpen(true);
  };

  const handleEditType = (issueType: TIssueType) => {
    setEditingType(issueType);
    setIsCreateModalOpen(true);
  };

  const handleDeleteType = (issueType: TIssueType) => {
    setDeletingType(issueType);
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setEditingType(null);
  };

  const handleCloseSidePanel = () => {
    setSelectedTypeId(null);
  };

  return (
    <>
      <div className="flex h-full gap-0">
        {/* Left column: Issue type list */}
        <div className="flex-1 min-w-0">
          <IssueTypeList
            workspaceSlug={workspaceSlug}
            issueTypes={issueTypes}
            selectedTypeId={selectedTypeId}
            isAdmin={isAdmin}
            onSelectType={handleSelectType}
            onCreateType={handleCreateType}
            onEditType={handleEditType}
            onDeleteType={handleDeleteType}
          />
        </div>

        {/* Right column: Side panel (shown when type is selected) */}
        {selectedType && (
          <IssueTypeSidePanel
            workspaceSlug={workspaceSlug}
            issueType={selectedType}
            isAdmin={isAdmin}
            onClose={handleCloseSidePanel}
            onEdit={() => handleEditType(selectedType)}
          />
        )}
      </div>

      {/* Modals */}
      <CreateUpdateIssueTypeModal
        isOpen={isCreateModalOpen || editingType !== null}
        onClose={handleCloseModal}
        workspaceSlug={workspaceSlug}
        data={editingType}
      />
      <DeleteIssueTypeModal
        isOpen={deletingType !== null}
        onClose={() => setDeletingType(null)}
        workspaceSlug={workspaceSlug}
        data={deletingType}
      />
    </>
  );
});
