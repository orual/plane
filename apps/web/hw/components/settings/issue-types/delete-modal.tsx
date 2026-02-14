/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// ui
import { AlertModalCore } from "@plane/ui";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  data: TIssueType | null;
};

export const DeleteIssueTypeModal = observer(function DeleteIssueTypeModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, data } = props;
  // store hooks
  const { issueTypeStore } = useRootStore();
  // states
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const handleClose = () => {
    onClose();
    setIsDeleteLoading(false);
  };

  const handleDeletion = async () => {
    if (!data) return;

    setIsDeleteLoading(true);

    try {
      await issueTypeStore.deleteIssueType(workspaceSlug, data.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Issue type deleted successfully",
      });
      handleClose();
    } catch (error) {
      setIsDeleteLoading(false);
      let errorMessage = "Issue type could not be deleted. Please try again.";
      if (
        error &&
        typeof error === "object" &&
        "error" in error &&
        typeof (error as Record<string, unknown>).error === "string"
      ) {
        errorMessage = (error as Record<string, unknown>).error as string;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: errorMessage,
      });
    }
  };

  return (
    <div data-test="issue-type-delete-modal">
      <AlertModalCore
        handleClose={handleClose}
        handleSubmit={() => void handleDeletion()}
        isSubmitting={isDeleteLoading}
        isOpen={isOpen}
        title="Delete Issue Type"
        content={
          <>
            Are you sure you want to delete <span className="font-medium text-primary">{data?.name}</span>? This will
            remove the issue type from all work items that reference it.
          </>
        }
        primaryButtonText={{
          default: "Delete",
          loading: "Deleting",
        }}
      />
    </div>
  );
});
