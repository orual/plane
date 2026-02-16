/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TAgentRunStatus = "created" | "in_progress" | "completed" | "failed" | "stopped" | "stale";
export type TAgentActivityType = "thought" | "action" | "response" | "elicitation" | "error";

export type TAgentRun = {
  id: string;
  agent_id: string;
  workspace_id: string;
  project_id: string | null;
  issue_id: string | null;
  status: TAgentRunStatus;
  stale_timeout: number;
  last_activity_at: string;
  completed_at: string | null;
  trigger_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TAgentRunActivity = {
  id: string;
  run_id: string;
  activity_type: TAgentActivityType;
  content: string;
  metadata: Record<string, unknown>;
  is_ephemeral: boolean;
  created_at: string;
  updated_at: string;
};

export type TCreateActivityPayload = {
  activity_type: TAgentActivityType;
  content: string;
  metadata?: Record<string, unknown>;
};
