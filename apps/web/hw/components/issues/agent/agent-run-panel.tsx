/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Disclosure } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { TAgentRun } from "@/plane-web/types/agent";
// components
import { ActionRenderer, ErrorRenderer, ResponseRenderer, ThoughtRenderer } from "./activity-renderers";

export type TAgentRunPanelProps = {
  workspaceSlug: string;
  issueId: string;
};

/**
 * Helper to get the background color for a run status badge.
 */
function getStatusBadgeClass(status: TAgentRun["status"]): string {
  switch (status) {
    case "in_progress":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "created":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "stale":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "failed":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "completed":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "stopped":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
  }
}

/**
 * Single run activity timeline with activities lazy-loaded on expand.
 */
const AgentRunItem = observer(function AgentRunItem({ run, workspaceSlug }: { run: TAgentRun; workspaceSlug: string }) {
  const { agentRunStore } = useRootStore();

  // Get activities for this run from the store
  const activities = agentRunStore.getActivitiesByRunId(run.id);

  const handleDisclosureOpen = (isOpen: boolean) => {
    if (isOpen && activities.length === 0) {
      // Fetch activities when expanding if not already loaded
      void agentRunStore.fetchActivitiesForRun(workspaceSlug, run.id).catch((error) => {
        console.error("Failed to fetch activities for run:", error);
      });
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateString;
    }
  };

  return (
    <Disclosure as="div" className="border border-custom-border-200 rounded-lg overflow-hidden">
      {({ open }) => (
        <>
          <Disclosure.Button
            onClick={() => {
              handleDisclosureOpen(!open);
            }}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3",
              "hover:bg-custom-background-90 transition-colors",
              open && "bg-custom-background-90"
            )}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn("px-2 py-1 text-xs font-medium rounded border", getStatusBadgeClass(run.status))}>
                {run.status}
              </div>
              <span className="text-sm font-medium text-custom-text-100 truncate">Agent Run</span>
              <span className="text-xs text-custom-text-400">{formatDate(run.created_at)}</span>
            </div>
            <ChevronDown
              size={16}
              className={cn("flex-shrink-0 text-custom-text-400 transition-transform", open && "rotate-180")}
            />
          </Disclosure.Button>

          <Disclosure.Panel className="border-t border-custom-border-200 px-4 py-3 space-y-3 bg-custom-background-90">
            {agentRunStore.loader && activities.length === 0 ? (
              <div className="text-sm text-custom-text-400">Loading activities...</div>
            ) : activities.length === 0 ? (
              <div className="text-sm text-custom-text-400">No activities yet</div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="space-y-1">
                    <div className="text-xs text-custom-text-400">
                      {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                    </div>
                    <div className="text-sm">
                      {activity.activity_type === "thought" && <ThoughtRenderer activity={activity} />}
                      {activity.activity_type === "action" && <ActionRenderer activity={activity} />}
                      {activity.activity_type === "error" && <ErrorRenderer activity={activity} />}
                      {activity.activity_type === "response" && <ResponseRenderer activity={activity} />}
                      {activity.activity_type === "elicitation" && <ResponseRenderer activity={activity} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
});

/**
 * AgentRunPanel: Displays all active agent runs for an issue as collapsible panels.
 * Fetches runs on mount and renders each as a disclosure component.
 */
export const AgentRunPanel = observer(function AgentRunPanel({ workspaceSlug, issueId }: TAgentRunPanelProps) {
  const { agentRunStore } = useRootStore();

  // Get runs for this issue from the store
  const runs = agentRunStore.getRunsByIssueId(issueId);

  useEffect(() => {
    // Fetch runs for this issue on mount
    agentRunStore.fetchRunsForIssue(workspaceSlug, issueId).catch((error) => {
      console.error("Failed to fetch agent runs:", error);
    });
  }, [workspaceSlug, issueId, agentRunStore]);

  // Don't render anything if there are no runs
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-custom-text-100">Agent Activity</h3>
      <div className="space-y-2">
        {runs.map((run) => (
          <AgentRunItem key={run.id} run={run} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </div>
  );
});
