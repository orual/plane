/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable, action, computed, runInAction } from "mobx";
// service
import { AgentConversationService } from "../../services/agent-conversation.service";
// types
import type { CoreRootStore } from "@/store/root.store";
import type {
  TAgentConversation,
  TAgentConversationMessage,
  TCreateConversationPayload,
  TCreateMessagePayload,
  TAgentRunActivity,
} from "../../types/agent";

export const PANEL_MIN_WIDTH = 384;
export const PANEL_MAX_WIDTH = 800;
export const PANEL_DEFAULT_WIDTH = 384;

export interface IAgentConversationStore {
  // observables
  conversations: Record<string, TAgentConversation> | null;
  messagesByConversationId: Record<string, TAgentConversationMessage[]>;
  activeConversationId: string | null;
  isPanelOpen: boolean;
  panelWidth: number;
  isLoading: boolean;

  // computed helpers
  activeConversation: TAgentConversation | null;
  activeMessages: TAgentConversationMessage[];
  hasActiveConversation: boolean;

  // actions
  fetchConversations: (workspaceSlug: string) => Promise<void>;
  createConversation: (workspaceSlug: string, data: TCreateConversationPayload) => Promise<void>;
  fetchMessages: (workspaceSlug: string, conversationId: string) => Promise<void>;
  sendMessage: (workspaceSlug: string, conversationId: string, data: TCreateMessagePayload) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;
  setActiveConversation: (id: string | null) => void;
  appendActivity: (conversationId: string, activity: TAgentRunActivity) => void;
}

export class AgentConversationStore implements IAgentConversationStore {
  // observables
  conversations: Record<string, TAgentConversation> | null = null;
  messagesByConversationId: Record<string, TAgentConversationMessage[]> = {};
  activeConversationId: string | null = null;
  isPanelOpen = false;
  panelWidth = PANEL_DEFAULT_WIDTH;
  loaderCount = 0;

  get isLoading(): boolean {
    return this.loaderCount > 0;
  }

  // services
  private agentConversationService: AgentConversationService;
  private rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    this.rootStore = rootStore;
    this.agentConversationService = new AgentConversationService();

    makeObservable(this, {
      // observables
      conversations: observable,
      messagesByConversationId: observable,
      activeConversationId: observable,
      isPanelOpen: observable,
      panelWidth: observable,
      loaderCount: observable,

      // actions
      fetchConversations: action,
      createConversation: action,
      fetchMessages: action,
      sendMessage: action,
      openPanel: action,
      closePanel: action,
      togglePanel: action,
      setActiveConversation: action,
      setPanelWidth: action,
      appendActivity: action,

      // computed
      isLoading: computed,
      activeConversation: computed,
      activeMessages: computed,
      hasActiveConversation: computed,
    });
  }

  // ============================================================
  // Panel actions
  // ============================================================

  openPanel = (): void => {
    this.isPanelOpen = true;
  };

  closePanel = (): void => {
    this.isPanelOpen = false;
  };

  togglePanel = (): void => {
    this.isPanelOpen = !this.isPanelOpen;
  };

  setActiveConversation = (id: string | null): void => {
    this.activeConversationId = id;
  };

  setPanelWidth = (width: number): void => {
    this.panelWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));
  };

  // ============================================================
  // Conversation actions
  // ============================================================

  fetchConversations = async (workspaceSlug: string): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const conversationList = await this.agentConversationService.listConversations(workspaceSlug);

      runInAction(() => {
        this.conversations = {};
        conversationList.forEach((conversation) => {
          if (this.conversations) {
            this.conversations[conversation.id] = conversation;
          }
        });
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  createConversation = async (workspaceSlug: string, data: TCreateConversationPayload): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const conversation = await this.agentConversationService.createConversation(workspaceSlug, data);

      runInAction(() => {
        if (!this.conversations) {
          this.conversations = {};
        }
        this.conversations[conversation.id] = conversation;
        this.activeConversationId = conversation.id;
        // Initialize messages array for new conversation
        this.messagesByConversationId[conversation.id] = [];
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  // ============================================================
  // Message actions
  // ============================================================

  fetchMessages = async (workspaceSlug: string, conversationId: string): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const messages = await this.agentConversationService.listMessages(workspaceSlug, conversationId);

      runInAction(() => {
        this.messagesByConversationId[conversationId] = messages;
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  sendMessage = async (workspaceSlug: string, conversationId: string, data: TCreateMessagePayload): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const message = await this.agentConversationService.sendMessage(workspaceSlug, conversationId, data);

      runInAction(() => {
        if (!this.messagesByConversationId[conversationId]) {
          this.messagesByConversationId[conversationId] = [];
        }
        this.messagesByConversationId[conversationId].push(message);
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  // ============================================================
  // Activity handling (from SSE)
  // ============================================================

  appendActivity = (conversationId: string, activity: TAgentRunActivity): void => {
    if (!this.messagesByConversationId[conversationId]) {
      this.messagesByConversationId[conversationId] = [];
    }

    // Convert activity to message format
    const message: TAgentConversationMessage = {
      id: activity.id,
      conversation_id: conversationId,
      role: "assistant",
      content: activity.content,
      run_id: activity.run_id,
      created_at: activity.created_at,
      updated_at: activity.updated_at,
    };

    this.messagesByConversationId[conversationId].push(message);
  };

  // ============================================================
  // Computed getters
  // ============================================================

  get activeConversation(): TAgentConversation | null {
    if (!this.activeConversationId || !this.conversations) {
      return null;
    }
    return this.conversations[this.activeConversationId] ?? null;
  }

  get activeMessages(): TAgentConversationMessage[] {
    if (!this.activeConversationId) {
      return [];
    }
    return this.messagesByConversationId[this.activeConversationId] ?? [];
  }

  get hasActiveConversation(): boolean {
    return (
      this.activeConversationId !== null &&
      this.conversations !== null &&
      this.activeConversationId in this.conversations
    );
  }
}
