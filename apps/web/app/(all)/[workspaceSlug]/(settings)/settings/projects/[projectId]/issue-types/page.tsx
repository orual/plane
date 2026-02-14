/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hook
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import {
  ProjectIssueTypesSettingsHeader,
  ProjectIssueTypesRoot,
} from "@/plane-web/components/settings/project-issue-types";

function ProjectIssueTypesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const { t } = useTranslation();

  // derived values
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Issue types` : undefined;
  // derived values
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<ProjectIssueTypesSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.issue_types.title")}
          description={t("project_settings.issue_types.description")}
        />
        <div className="mt-6">
          <ProjectIssueTypesRoot
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            canPerformActions={canPerformProjectAdminActions}
          />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(ProjectIssueTypesSettingsPage);
