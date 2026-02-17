/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Bot } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";

export type TRunStatusBadgeProps = {
  issueId: string;
};

/**
 * RunStatusBadge: Displays a small badge indicating active agent runs.
 * Shows a Bot icon with a pulse animation when the issue has active agent runs.
 * Used in issue lists/kanban views to indicate active agent activity.
 */
export const RunStatusBadge = observer(function RunStatusBadge({ issueId }: TRunStatusBadgeProps) {
  const { agentRunStore } = useRootStore();

  // Check if this issue has active runs
  const hasActive = agentRunStore.hasActiveRuns(issueId);

  if (!hasActive) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        "w-6 h-6 rounded-full",
        "bg-custom-primary-100/20 text-custom-primary-100",
        "relative"
      )}
      title="Agent is active"
    >
      {/* Pulse animation background */}
      <div className={cn("absolute inset-0 rounded-full", "bg-custom-primary-100/20", "animate-pulse")} />
      {/* Icon */}
      <Bot size={14} className="relative z-10" />
    </div>
  );
});
