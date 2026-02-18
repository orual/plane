/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentService } from "./agent.service";

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService();
  });

  describe("Agent profile endpoints - URL construction", () => {
    it("should construct correct list agent profiles endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: [] });

      await service.listAgentProfiles("test-workspace");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agents/");
    });

    it("should construct correct get single agent profile endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: {} });

      await service.getAgentProfile("test-workspace", "agent-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agents/agent-1/");
    });

    it("should construct correct create agent profile endpoint", async () => {
      const postSpy = vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: {} });

      const payload = {
        display_name: "My Agent",
        description: "Test agent",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret123",
      };

      await service.createAgentProfile("test-workspace", payload);

      expect(postSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agents/", payload);
    });

    it("should construct correct update agent profile endpoint", async () => {
      const patchSpy = vi.spyOn(service, "patch" as any).mockResolvedValueOnce({ data: {} });

      await service.updateAgentProfile("test-workspace", "agent-1", { is_active: false });

      expect(patchSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agents/agent-1/", { is_active: false });
    });

    it("should construct correct delete agent profile endpoint", async () => {
      const deleteSpy = vi.spyOn(service, "delete" as any).mockResolvedValueOnce({});

      await service.deleteAgentProfile("test-workspace", "agent-1");

      expect(deleteSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/agents/agent-1/");
    });
  });

  describe("Agent profile endpoints - error handling", () => {
    it("should throw error response data on list failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.listAgentProfiles("test-workspace")).rejects.toEqual(errorData);
    });

    it("should throw error response data on get failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.getAgentProfile("test-workspace", "agent-1")).rejects.toEqual(errorData);
    });

    it("should throw error response data on create failure", async () => {
      const errorData: any = { error: "Invalid data" };
      vi.spyOn(service, "post" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      const payload = {
        display_name: "My Agent",
        description: "Test agent",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret123",
      };

      await expect(service.createAgentProfile("test-workspace", payload)).rejects.toEqual(errorData);
    });

    it("should throw error response data on update failure", async () => {
      const errorData: any = { error: "Conflict" };
      vi.spyOn(service, "patch" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.updateAgentProfile("test-workspace", "agent-1", { is_active: false })).rejects.toEqual(
        errorData
      );
    });

    it("should throw error response data on delete failure", async () => {
      const errorData: any = { error: "Forbidden" };
      vi.spyOn(service, "delete" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.deleteAgentProfile("test-workspace", "agent-1")).rejects.toEqual(errorData);
    });
  });
});
