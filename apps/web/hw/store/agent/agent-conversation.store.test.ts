/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentConversationStore } from "./agent-conversation.store";
import type { CoreRootStore } from "@/store/root.store";
import type { TAgentConversation, TAgentConversationMessage, TAgentRunActivity } from "../../types/agent";

describe("AgentConversationStore", () => {
  let store: AgentConversationStore;
  let mockRootStore: CoreRootStore;

  const mockConversation: TAgentConversation = {
    id: "conv-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    title: "Test Conversation",
    is_active: true,
    created_at: "2026-02-18T00:00:00Z",
    updated_at: "2026-02-18T00:00:00Z",
  };

  const mockMessage: TAgentConversationMessage = {
    id: "msg-1",
    conversation_id: "conv-1",
    role: "user",
    content: "Hello, agent!",
    run_id: null,
    created_at: "2026-02-18T00:00:00Z",
    updated_at: "2026-02-18T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRootStore = {} as CoreRootStore;
    store = new AgentConversationStore(mockRootStore);
  });

  describe("Panel visibility", () => {
    it("should initialize with panel closed", () => {
      expect(store.isPanelOpen).toBe(false);
    });

    it("should open panel", () => {
      store.openPanel();
      expect(store.isPanelOpen).toBe(true);
    });

    it("should close panel", () => {
      store.openPanel();
      store.closePanel();
      expect(store.isPanelOpen).toBe(false);
    });

    it("should toggle panel", () => {
      expect(store.isPanelOpen).toBe(false);
      store.togglePanel();
      expect(store.isPanelOpen).toBe(true);
      store.togglePanel();
      expect(store.isPanelOpen).toBe(false);
    });
  });

  describe("Conversation management", () => {
    it("should initialize with no active conversation", () => {
      expect(store.activeConversationId).toBeNull();
    });

    it("should set active conversation", () => {
      store.setActiveConversation("conv-1");
      expect(store.activeConversationId).toBe("conv-1");
    });

    it("should return active conversation", () => {
      store.conversations = { "conv-1": mockConversation };
      store.setActiveConversation("conv-1");

      const active = store.activeConversation;
      expect(active).toEqual(mockConversation);
    });

    it("should return null for inactive conversation", () => {
      store.conversations = { "conv-1": mockConversation };
      expect(store.activeConversation).toBeNull();
    });

    it("should have correct hasActiveConversation flag", () => {
      expect(store.hasActiveConversation).toBe(false);
      store.setActiveConversation("conv-1");
      store.conversations = { "conv-1": mockConversation };
      expect(store.hasActiveConversation).toBe(true);
    });
  });

  describe("Message management", () => {
    it("should return empty array for nonexistent conversation", () => {
      const messages = store.activeMessages;
      expect(messages).toEqual([]);
    });

    it("should return messages for active conversation", () => {
      const mockMessages = [mockMessage];
      store.messagesByConversationId = { "conv-1": mockMessages };
      store.setActiveConversation("conv-1");

      expect(store.activeMessages).toEqual(mockMessages);
    });

    it("should append activity to conversation", () => {
      const activity: TAgentRunActivity = {
        id: "act-1",
        run_id: "run-1",
        activity_type: "response",
        content: "Agent response",
        metadata: {},
        is_ephemeral: false,
        created_at: "2026-02-18T00:00:00Z",
        updated_at: "2026-02-18T00:00:00Z",
      };

      store.messagesByConversationId = { "conv-1": [] };
      store.appendActivity("conv-1", activity);

      expect(store.messagesByConversationId["conv-1"]).toContainEqual(
        expect.objectContaining({
          role: "assistant",
          content: activity.content,
          run_id: activity.run_id,
        })
      );
    });
  });

  describe("Loader state", () => {
    it("should initialize with no loading", () => {
      expect(store.isLoading).toBe(false);
    });

    it("should track loader count", () => {
      store["loaderCount"] = 1;
      expect(store.isLoading).toBe(true);

      store["loaderCount"] = 2;
      expect(store.isLoading).toBe(true);

      store["loaderCount"] = 0;
      expect(store.isLoading).toBe(false);
    });
  });

  describe("Async operations", () => {
    it("should fetch conversations", async () => {
      const mockConversations = [mockConversation];
      const listSpy = vi
        .spyOn(store["agentConversationService"], "listConversations" as any)
        .mockResolvedValueOnce(mockConversations);

      await store.fetchConversations("ws-1");

      expect(listSpy).toHaveBeenCalledWith("ws-1");
      expect(store.conversations?.["conv-1"]).toEqual(mockConversation);
    });

    it("should create conversation and set as active", async () => {
      const createSpy = vi
        .spyOn(store["agentConversationService"], "createConversation" as any)
        .mockResolvedValueOnce(mockConversation);

      await store.createConversation("ws-1", { title: "Test" });

      expect(createSpy).toHaveBeenCalledWith("ws-1", { title: "Test" });
      expect(store.conversations?.["conv-1"]).toEqual(mockConversation);
      expect(store.activeConversationId).toBe("conv-1");
    });

    it("should fetch messages for conversation", async () => {
      const mockMessages = [mockMessage];
      const listSpy = vi
        .spyOn(store["agentConversationService"], "listMessages" as any)
        .mockResolvedValueOnce(mockMessages);

      await store.fetchMessages("ws-1", "conv-1");

      expect(listSpy).toHaveBeenCalledWith("ws-1", "conv-1");
      expect(store.messagesByConversationId["conv-1"]).toEqual(mockMessages);
    });

    it("should send message", async () => {
      const newMessage: TAgentConversationMessage = {
        ...mockMessage,
        id: "msg-2",
      };
      const sendSpy = vi
        .spyOn(store["agentConversationService"], "sendMessage" as any)
        .mockResolvedValueOnce(newMessage);
      store.messagesByConversationId = { "conv-1": [mockMessage] };

      await store.sendMessage("ws-1", "conv-1", { content: "New message" });

      expect(sendSpy).toHaveBeenCalledWith("ws-1", "conv-1", { content: "New message" });
      expect(store.messagesByConversationId["conv-1"]).toContainEqual(newMessage);
    });
  });

  describe("Error handling", () => {
    it("should handle fetch conversations error", async () => {
      const error = new Error("Network error");
      vi.spyOn(store["agentConversationService"], "listConversations" as any).mockRejectedValueOnce(error);

      await expect(store.fetchConversations("ws-1")).rejects.toThrow(error);
    });

    it("should handle create conversation error", async () => {
      const error = new Error("Invalid payload");
      vi.spyOn(store["agentConversationService"], "createConversation" as any).mockRejectedValueOnce(error);

      await expect(store.createConversation("ws-1", { title: "Test" })).rejects.toThrow(error);
    });

    it("should handle send message error", async () => {
      const error = new Error("Message too long");
      vi.spyOn(store["agentConversationService"], "sendMessage" as any).mockRejectedValueOnce(error);

      await expect(store.sendMessage("ws-1", "conv-1", { content: "Test" })).rejects.toThrow(error);
    });
  });
});
