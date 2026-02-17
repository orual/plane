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
import { ElicitationCard } from "./elicitation-card";

export type TAgentRunPanelProps = {
  workspaceSlug: string;
  issueId: string;
};

function getStatusBadgeClass(status: TAgentRun["status"]): string {
  switch (status) {
    case "in_progress":
      return "bg-success-subtle text-success-primary border-success-strong";
    case "stale":
      return "bg-warning-subtle text-warning-primary border-warning-strong";
    case "failed":
      return "bg-danger-subtle text-danger-primary border-danger-strong";
    case "completed":
      return "bg-accent-subtle text-accent-primary border-accent-strong";
    case "created":
    case "stopped":
    default:
      return "bg-layer-2 text-secondary border-subtle";
  }
}

const AgentRunItem = observer(function AgentRunItem({ run, workspaceSlug }: { run: TAgentRun; workspaceSlug: string }) {
  const { agentRunStore } = useRootStore();

  const activities = agentRunStore.getActivitiesByRunId(run.id);

  const handleDisclosureOpen = (isOpen: boolean) => {
    if (isOpen && activities.length === 0) {
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
    <Disclosure as="div" className="border border-subtle rounded-lg overflow-hidden">
      {({ open }) => (
        <>
          <Disclosure.Button
            onClick={() => {
              handleDisclosureOpen(!open);
            }}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3",
              "hover:bg-layer-1 transition-colors",
              open && "bg-layer-1"
            )}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn("px-2 py-0.5 text-11 font-medium rounded border", getStatusBadgeClass(run.status))}>
                {run.status.replace("_", " ")}
              </div>
              <span className="text-13 font-medium text-primary truncate">Agent Run</span>
              <span className="text-11 text-tertiary">{formatDate(run.created_at)}</span>
            </div>
            <ChevronDown
              size={16}
              className={cn("flex-shrink-0 text-tertiary transition-transform", open && "rotate-180")}
            />
          </Disclosure.Button>

          <Disclosure.Panel className="border-t border-subtle px-4 py-3 space-y-3 bg-surface-1">
            {agentRunStore.loader && activities.length === 0 ? (
              <div className="text-13 text-tertiary">Loading activities...</div>
            ) : activities.length === 0 ? (
              <div className="text-13 text-tertiary">No activities yet</div>
            ) : (
              <div className="space-y-2.5">
                {activities.map((activity) => (
                  <div key={activity.id}>
                    {activity.activity_type === "thought" && <ThoughtRenderer activity={activity} />}
                    {activity.activity_type === "action" && <ActionRenderer activity={activity} />}
                    {activity.activity_type === "error" && <ErrorRenderer activity={activity} />}
                    {activity.activity_type === "response" && <ResponseRenderer activity={activity} />}
                    {activity.activity_type === "elicitation" && (
                      <ElicitationCard
                        activity={activity}
                        onSubmit={(response) => agentRunStore.postElicitationResponse(workspaceSlug, run.id, response)}
                      />
                    )}
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

export const AgentRunPanel = observer(function AgentRunPanel({ workspaceSlug, issueId }: TAgentRunPanelProps) {
  const { agentRunStore } = useRootStore();

  const runs = agentRunStore.getRunsByIssueId(issueId);

  useEffect(() => {
    agentRunStore.fetchRunsForIssue(workspaceSlug, issueId).catch((error) => {
      console.error("Failed to fetch agent runs:", error);
    });
  }, [workspaceSlug, issueId, agentRunStore]);

  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-13 font-semibold text-primary">Agent Activity</h3>
      <div className="space-y-2">
        {runs.map((run) => (
          <AgentRunItem key={run.id} run={run} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </div>
  );
});
