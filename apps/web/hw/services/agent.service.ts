/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
// types
import type {
  TAgentRun,
  TAgentRunActivity,
  TCreateActivityPayload,
  TAgentProfile,
  TAgentProfileCreateResponse,
  TCreateAgentProfilePayload,
} from "@/plane-web/types/agent";
import type { TAgentSearchResponse } from "@plane/types";

export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ============================================================
  // Agent profile endpoints
  // ============================================================

  async listAgentProfiles(workspaceSlug: string): Promise<TAgentProfile[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getAgentProfile(workspaceSlug: string, agentId: string): Promise<TAgentProfile> {
    return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createAgentProfile(
    workspaceSlug: string,
    data: TCreateAgentProfilePayload
  ): Promise<TAgentProfileCreateResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/agents/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateAgentProfile(
    workspaceSlug: string,
    agentId: string,
    data: Partial<TAgentProfile>
  ): Promise<TAgentProfile> {
    return this.patch(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteAgentProfile(workspaceSlug: string, agentId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
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

  // ============================================================
  // Agent search for mention autocomplete
  // ============================================================

  async searchAgents(workspaceSlug: string, query: string): Promise<TAgentSearchResponse[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/search/?search=${encodeURIComponent(query)}&query_type=agent_mention&count=5`
    )
      .then((response) => response?.data?.agent_mention ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
