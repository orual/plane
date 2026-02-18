/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentConversationService } from "./agent-conversation.service";

describe("AgentConversationService", () => {
  let service: AgentConversationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentConversationService();
  });

  describe("Conversation endpoints - URL construction", () => {
    it("should construct correct list conversations endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: [] });

      await service.listConversations("test-workspace");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agent-conversations/");
    });

    it("should construct correct create conversation endpoint", async () => {
      const postSpy = vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: {} });

      const payload = { title: "My Conversation" };

      await service.createConversation("test-workspace", payload);

      expect(postSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agent-conversations/", payload);
    });

    it("should construct correct get conversation endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: {} });

      await service.getConversation("test-workspace", "conv-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agent-conversations/conv-1/");
    });
  });

  describe("Conversation endpoints - error handling", () => {
    it("should throw error response data on list failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.listConversations("test-workspace")).rejects.toEqual(errorData);
    });

    it("should throw error response data on create failure", async () => {
      const errorData: any = { error: "Invalid data" };
      vi.spyOn(service, "post" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      const payload = { title: "My Conversation" };

      await expect(service.createConversation("test-workspace", payload)).rejects.toEqual(errorData);
    });

    it("should throw error response data on get failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.getConversation("test-workspace", "conv-1")).rejects.toEqual(errorData);
    });
  });

  describe("Message endpoints - URL construction", () => {
    it("should construct correct list messages endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: [] });

      await service.listMessages("test-workspace", "conv-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agent-conversations/conv-1/messages/");
    });

    it("should construct correct send message endpoint", async () => {
      const postSpy = vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: {} });

      const payload = { content: "Hello, agent!" };

      await service.sendMessage("test-workspace", "conv-1", payload);

      expect(postSpy).toHaveBeenCalledWith(
        "/api/workspaces/test-workspace/agent-conversations/conv-1/messages/",
        payload
      );
    });
  });

  describe("Message endpoints - error handling", () => {
    it("should throw error response data on list messages failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.listMessages("test-workspace", "conv-1")).rejects.toEqual(errorData);
    });

    it("should throw error response data on send message failure", async () => {
      const errorData: any = { error: "Invalid message" };
      vi.spyOn(service, "post" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      const payload = { content: "Hello, agent!" };

      await expect(service.sendMessage("test-workspace", "conv-1", payload)).rejects.toEqual(errorData);
    });
  });

  describe("Response parsing", () => {
    it("should return parsed conversation data on success", async () => {
      const mockConversation: any = {
        id: "conv-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        title: "Test Conversation",
        is_active: true,
        created_at: "2026-02-18T00:00:00Z",
        updated_at: "2026-02-18T00:00:00Z",
      };

      vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: mockConversation });

      const result = await service.createConversation("test-workspace", {});

      expect(result).toEqual(mockConversation);
    });

    it("should return parsed message data on success", async () => {
      const mockMessage: any = {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "user",
        content: "Hello, agent!",
        run_id: null,
        created_at: "2026-02-18T00:00:00Z",
        updated_at: "2026-02-18T00:00:00Z",
      };

      vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: mockMessage });

      const result = await service.sendMessage("test-workspace", "conv-1", { content: "Hello, agent!" });

      expect(result).toEqual(mockMessage);
    });

    it("should return parsed messages array on success", async () => {
      const mockMessages: any = [
        {
          id: "msg-1",
          conversation_id: "conv-1",
          role: "user",
          content: "Hello",
          run_id: null,
          created_at: "2026-02-18T00:00:00Z",
          updated_at: "2026-02-18T00:00:00Z",
        },
        {
          id: "msg-2",
          conversation_id: "conv-1",
          role: "assistant",
          content: "Hi there!",
          run_id: "run-1",
          created_at: "2026-02-18T00:01:00Z",
          updated_at: "2026-02-18T00:01:00Z",
        },
      ];

      vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: mockMessages });

      const result = await service.listMessages("test-workspace", "conv-1");

      expect(result).toEqual(mockMessages);
    });
  });
});
