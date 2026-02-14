/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Loader } from "@plane/ui";
import { useRootStore } from "@/hooks/store/use-root-store";
import type { TProjectIssueType } from "@/plane-web/types/issue-types";
import { TypeLinkItem } from "./type-link-item";

type Props = {
  workspaceSlug: string;
  projectId: string;
  canPerformActions: boolean;
};

export const ProjectIssueTypesRoot = observer(function ProjectIssueTypesRoot({
  workspaceSlug,
  projectId,
  canPerformActions,
}: Props) {
  const { issueTypeStore } = useRootStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          issueTypeStore.fetchIssueTypes(workspaceSlug),
          issueTypeStore.fetchProjectIssueTypes(workspaceSlug, projectId),
        ]);
      } catch (_error) {
        // Error handling is done in the store
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, [workspaceSlug, projectId, issueTypeStore]);

  const workspaceIssueTypes = issueTypeStore.getWorkspaceIssueTypes(workspaceSlug) ?? [];
  const projectIssueTypes = issueTypeStore.getProjectIssueTypes(workspaceSlug, projectId) ?? [];

  const getLinkedProjectIssueType = (issueTypeId: string): TProjectIssueType | undefined =>
    projectIssueTypes.find((pit) => pit.issue_type_id === issueTypeId);

  return (
    <div data-test="project-issue-type-list">
      {isLoading ? (
        <Loader className="space-y-4 p-4">
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      ) : workspaceIssueTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-custom-text-300">No issue types have been created for this workspace yet.</p>
          <p className="text-xs text-custom-text-400 mt-1">Create issue types in workspace settings.</p>
        </div>
      ) : (
        <div className="rounded-md border border-custom-border-100">
          {workspaceIssueTypes.map((issueType) => (
            <TypeLinkItem
              key={issueType.id}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueType={issueType}
              linkedProjectIssueType={getLinkedProjectIssueType(issueType.id)}
              canPerformActions={canPerformActions}
            />
          ))}
        </div>
      )}
    </div>
  );
});
