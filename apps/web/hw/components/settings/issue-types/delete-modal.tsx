/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
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
  // i18n
  const { t } = useTranslation();
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
        title: t("workspace_settings.settings.issue_types.delete_success"),
        message: "",
      });
      handleClose();
    } catch (error) {
      setIsDeleteLoading(false);
      let errorMessage = t("workspace_settings.settings.issue_types.delete_error");
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
        title: t("error"),
        message: errorMessage,
      });
    }
  };

  return (
    <div data-test="issue-type-delete-modal" data-test-confirm="issue-type-delete-confirm">
      <AlertModalCore
        handleClose={handleClose}
        handleSubmit={() => void handleDeletion()}
        isSubmitting={isDeleteLoading}
        isOpen={isOpen}
        title={t("workspace_settings.settings.issue_types.delete")}
        content={<>{t("workspace_settings.settings.issue_types.delete_confirmation", { name: data?.name })}</>}
        primaryButtonText={{
          default: t("workspace_settings.settings.issue_types.delete"),
          loading: t("loading"),
        }}
      />
    </div>
  );
});
