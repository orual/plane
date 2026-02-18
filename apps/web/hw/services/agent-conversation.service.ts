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
  TAgentConversation,
  TAgentConversationMessage,
  TCreateConversationPayload,
  TCreateMessagePayload,
} from "@/plane-web/types/agent";

export class AgentConversationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ============================================================
  // Conversation endpoints
  // ============================================================

  async listConversations(workspaceSlug: string): Promise<TAgentConversation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-conversations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createConversation(workspaceSlug: string, data: TCreateConversationPayload): Promise<TAgentConversation> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-conversations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getConversation(workspaceSlug: string, conversationId: string): Promise<TAgentConversation> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-conversations/${conversationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ============================================================
  // Conversation message endpoints
  // ============================================================

  async listMessages(workspaceSlug: string, conversationId: string): Promise<TAgentConversationMessage[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent-conversations/${conversationId}/messages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sendMessage(
    workspaceSlug: string,
    conversationId: string,
    data: TCreateMessagePayload
  ): Promise<TAgentConversationMessage> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent-conversations/${conversationId}/messages/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
