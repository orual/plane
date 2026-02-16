/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
// types
import type { TAgentRun, TAgentRunActivity, TCreateActivityPayload } from "@/plane-web/types/agent";

export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ============================================================
  // Agent run endpoints
  // ============================================================

  async listAgentRuns(workspaceSlug: string, issueId?: string): Promise<TAgentRun[]> {
    const params = issueId ? `?issue_id=${issueId}` : "";
    return this.get(`/api/workspaces/${workspaceSlug}/agent-runs/${params}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getAgentRun(workspaceSlug: string, runId: string): Promise<TAgentRun> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-runs/${runId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ============================================================
  // Agent run activity endpoints
  // ============================================================

  async listRunActivities(workspaceSlug: string, runId: string): Promise<TAgentRunActivity[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-runs/${runId}/activities/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async postActivity(workspaceSlug: string, runId: string, data: TCreateActivityPayload): Promise<TAgentRunActivity> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-runs/${runId}/activities/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
