/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// hw components
import { IssueTypesSettingsRoot, IssueTypesSettingsHeader } from "@/plane-web/components/settings/issue-types";
// types
import type { Route } from "./+types/page";

const WorkspaceIssueTypesSettingsPage = observer(function WorkspaceIssueTypesSettingsPage({
  params,
}: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const canViewSettings = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Issue types` : undefined;

  if (workspaceUserInfo && !canViewSettings) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypesSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <IssueTypesSettingsRoot workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
});

export default WorkspaceIssueTypesSettingsPage;
