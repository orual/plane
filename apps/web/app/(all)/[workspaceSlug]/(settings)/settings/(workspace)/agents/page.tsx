/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable react-refresh/only-export-components */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
// components
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { AgentsList, CreateAgentModal } from "@/plane-web/components/settings/agents";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useRootStore } from "@/hooks/store/use-root-store";
import { useParams } from "react-router";
// local imports
import { AgentsWorkspaceSettingsHeader } from "./header";

function AgentsListPageComponent() {
  // states
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  // router
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  // plane hooks
  const { t } = useTranslation();
  // mobx store
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { agentProfileStore } = useRootStore();
  // derived values
  const canPerformWorkspaceAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useSWR(
    canPerformWorkspaceAdminActions && workspaceSlug ? `AGENT_PROFILES_LIST_${workspaceSlug}` : null,
    canPerformWorkspaceAdminActions && workspaceSlug ? () => agentProfileStore.fetchProfiles(workspaceSlug) : null
  );

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.agents.title")}`
    : undefined;

  // clear api token when modal is closed.
  useEffect(() => {
    if (!showCreateAgentModal && agentProfileStore.apiToken) agentProfileStore.clearApiToken();
  }, [showCreateAgentModal, agentProfileStore.apiToken, agentProfileStore]);

  if (workspaceUserInfo && !canPerformWorkspaceAdminActions) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  if (agentProfileStore.profiles === null) {
    return (
      <SettingsContentWrapper header={<AgentsWorkspaceSettingsHeader />}>
        <PageHead title={pageTitle} />
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-subtle border-t-text-primary" />
        </div>
      </SettingsContentWrapper>
    );
  }

  return (
    <SettingsContentWrapper header={<AgentsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <CreateAgentModal isOpen={showCreateAgentModal} onClose={() => setShowCreateAgentModal(false)} />
        <SettingsHeading
          title={t("workspace_settings.settings.agents.title")}
          description={t("workspace_settings.settings.agents.description")}
          control={
            <Button variant="primary" size="lg" onClick={() => setShowCreateAgentModal(true)}>
              {t("workspace_settings.settings.agents.add_agent")}
            </Button>
          }
        />
        {Object.keys(agentProfileStore.profiles).length > 0 ? (
          <div className="mt-4">
            <AgentsList />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col">
            <div className="h-full w-full flex items-center justify-center">
              <EmptyStateCompact
                assetKey="webhook"
                title={t("settings_empty_state.agents.title")}
                description={t("settings_empty_state.agents.description")}
                actions={[
                  {
                    label: t("settings_empty_state.agents.cta_primary"),
                    onClick: () => {
                      setShowCreateAgentModal(true);
                    },
                  },
                ]}
                align="start"
                rootClassName="py-20"
              />
            </div>
          </div>
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(AgentsListPageComponent);
