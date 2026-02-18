/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
// plane imports
import { cn } from "@plane/utils";
import { AppRailRoot } from "@/components/navigation";
import { useAppRailVisibility } from "@/lib/app-rail";
// local imports
import { TopNavigationRoot } from "../navigations";
import { AgentChatPanel, ChatTriggerButton } from "@/plane-web/components/agent/chat";

export const WorkspaceContentWrapper = observer(function WorkspaceContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use the context to determine if app rail should render
  const { shouldRenderAppRail } = useAppRailVisibility();
  const { workspaceSlug } = useParams();

  return (
    <div className="flex flex-col relative size-full overflow-hidden bg-canvas transition-all ease-in-out duration-300">
      <TopNavigationRoot />
      <div className="relative flex size-full overflow-hidden">
        {/* Conditionally render AppRailRoot based on context */}
        {shouldRenderAppRail && <AppRailRoot />}
        <div
          className={cn(
            "relative size-full pl-2 pb-2 pr-2 flex-grow transition-all ease-in-out duration-300 overflow-hidden",
            {
              "pl-0!": shouldRenderAppRail,
            }
          )}
        >
          {children}
        </div>
        {/* Agent chat panel */}
        {workspaceSlug && <AgentChatPanel workspaceSlug={workspaceSlug} />}
      </div>
      {/* Chat trigger button */}
      <ChatTriggerButton />
    </div>
  );
});
