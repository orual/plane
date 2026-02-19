/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable react-refresh/only-export-components */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { AgentDetailRoot } from "@/plane-web/components/settings/agents";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useParams } from "react-router";
// local imports
import { AgentDetailsWorkspaceSettingsHeader } from "./header";

function AgentDetailsPageComponent() {
  // router
  const params = useParams<{ workspaceSlug: string; agentId: string }>();
  // hooks
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Agent` : undefined;

  if (!params.workspaceSlug || !params.agentId) {
    return <div>Invalid parameters</div>;
  }

  return (
    <SettingsContentWrapper header={<AgentDetailsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <AgentDetailRoot workspaceSlug={params.workspaceSlug} agentId={params.agentId} />
    </SettingsContentWrapper>
  );
}

export default observer(AgentDetailsPageComponent);
