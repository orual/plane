/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentProfileStore } from "./agent-profile.store";

// Mock the AgentService before importing it
vi.mock("../../services/agent.service");

import { AgentService } from "../../services/agent.service";
import type { TAgentProfile, TCreateAgentProfilePayload } from "../../types/agent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRootStore = any;

describe("AgentProfileStore", () => {
  let store: AgentProfileStore;
  let mockRootStore: MockRootStore;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create a minimal mock root store
    mockRootStore = {
      workspaceRoot: {
        currentWorkspace: {
          id: "workspace-1",
          slug: "test-workspace",
        },
      },
    };

    // Create an instance of the store
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    store = new AgentProfileStore(mockRootStore);
  });

  describe("fetchProfiles", () => {
    it("should fetch profiles and populate store correctly (AC1.1)", async () => {
      const mockProfiles: TAgentProfile[] = [
        {
          id: "agent-1",
          user_id: "user-1",
          workspace_id: "workspace-1",
          agent_type: "external",
          webhook_url: "https://example.com/webhook",
          webhook_secret: "secret",
          event_triggers: {},
          is_active: true,
          display_name: "Agent 1",
          description: "Test agent 1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "agent-2",
          user_id: "user-1",
          workspace_id: "workspace-1",
          agent_type: "builtin",
          webhook_url: "https://builtin.example.com/webhook",
          webhook_secret: "builtin-secret",
          event_triggers: {},
          is_active: true,
          display_name: "Built-in Agent",
          description: "Built-in agent",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      vi.spyOn(AgentService.prototype, "listAgentProfiles").mockResolvedValueOnce(mockProfiles);

      await store.fetchProfiles("test-workspace");

      expect(store.profiles).toBeDefined();
      expect(store.profiles?.["agent-1"]).toEqual(mockProfiles[0]);
      expect(store.profiles?.["agent-2"]).toEqual(mockProfiles[1]);
      expect(store.profiles?.["agent-1"].agent_type).toBe("external");
      expect(store.profiles?.["agent-1"].is_active).toBe(true);
    });

    it("should handle empty profiles list", async () => {
      vi.spyOn(AgentService.prototype, "listAgentProfiles").mockResolvedValueOnce([]);

      await store.fetchProfiles("test-workspace");

      expect(store.profiles).toEqual({});
    });
  });

  describe("fetchProfileById", () => {
    it("should fetch single profile and add to store", async () => {
      const mockProfile: TAgentProfile = {
        id: "agent-1",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
        event_triggers: {},
        is_active: true,
        display_name: "Agent 1",
        description: "Test agent",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      vi.spyOn(AgentService.prototype, "getAgentProfile").mockResolvedValueOnce(mockProfile);

      await store.fetchProfileById("test-workspace", "agent-1");

      expect(store.profiles?.["agent-1"]).toEqual(mockProfile);
    });
  });

  describe("createProfile", () => {
    it("should create profile and store api token (AC1.2)", async () => {
      // Initialize profiles as empty object (simulating after fetch)
       
      store.profiles = {};

      const mockCreatePayload: TCreateAgentProfilePayload = {
        display_name: "New Agent",
        description: "New test agent",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
      };

      const mockResponse = {
        ...mockCreatePayload,
        id: "agent-3",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external" as const,
        event_triggers: {},
        is_active: true,
        created_at: "2024-01-02T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        api_token: "token-xyz-123",
      };

      vi.spyOn(AgentService.prototype, "createAgentProfile").mockResolvedValueOnce(mockResponse);

      const result = await store.createProfile("test-workspace", mockCreatePayload);

      expect(store.profiles?.["agent-3"]).toBeDefined();
      expect(store.profiles?.["agent-3"].display_name).toBe("New Agent");
      expect(store.apiToken).toBe("token-xyz-123");
      expect(result.apiToken).toBe("token-xyz-123");
    });

    it("should propagate validation errors (AC1.7)", async () => {
      const mockCreatePayload: TCreateAgentProfilePayload = {
        display_name: "Duplicate Agent",
        description: "Duplicate name",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
      };

      const validationError = { display_name: ["Agent with this display name already exists"] };

      vi.spyOn(AgentService.prototype, "createAgentProfile").mockRejectedValueOnce(validationError);

      await expect(store.createProfile("test-workspace", mockCreatePayload)).rejects.toEqual(validationError);

      // Verify profiles map was not modified
      expect(store.profiles).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("should update profile is_active field (AC1.5)", async () => {
      // Pre-populate store
      const existingProfile: TAgentProfile = {
        id: "agent-1",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
        event_triggers: {},
        is_active: true,
        display_name: "Agent 1",
        description: "Test agent",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

       
      store.profiles = { "agent-1": existingProfile };

      const updatePayload: Partial<TAgentProfile> = { is_active: false };
      const mockResponse = { ...existingProfile, ...updatePayload };

      vi.spyOn(AgentService.prototype, "updateAgentProfile").mockResolvedValueOnce(mockResponse);

      await store.updateProfile("test-workspace", "agent-1", updatePayload);

      expect(store.profiles?.["agent-1"].is_active).toBe(false);
    });
  });

  describe("removeProfile", () => {
    it("should remove profile from store", async () => {
      const existingProfile: TAgentProfile = {
        id: "agent-1",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
        event_triggers: {},
        is_active: true,
        display_name: "Agent 1",
        description: "Test agent",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

       
      store.profiles = { "agent-1": existingProfile };

      vi.spyOn(AgentService.prototype, "deleteAgentProfile").mockResolvedValueOnce(undefined);

      await store.removeProfile("test-workspace", "agent-1");

      expect(store.profiles?.["agent-1"]).toBeUndefined();
    });
  });

  describe("clearApiToken", () => {
    it("should clear api token", () => {
      store.apiToken = "token-xyz-123";

      store.clearApiToken();

      expect(store.apiToken).toBeNull();
    });
  });

  describe("getProfileById", () => {
    it("should return profile by id when it exists", () => {
      const mockProfile: TAgentProfile = {
        id: "agent-1",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "secret",
        event_triggers: {},
        is_active: true,
        display_name: "Agent 1",
        description: "Test agent",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

       
      store.profiles = { "agent-1": mockProfile };

      const result = store.getProfileById("agent-1");

      expect(result).toEqual(mockProfile);
    });

    it("should return null when profile does not exist", () => {
       
      store.profiles = {};

      const result = store.getProfileById("nonexistent");

      expect(result).toBeNull();
    });

    it("should return null when profiles is null", () => {
      store.profiles = null;

      const result = store.getProfileById("agent-1");

      expect(result).toBeNull();
    });
  });

  describe("full lifecycle", () => {
    it("should handle fetch, create, update, and remove workflow", async () => {
      // Initial fetch
      const mockProfiles: TAgentProfile[] = [
        {
          id: "agent-1",
          user_id: "user-1",
          workspace_id: "workspace-1",
          agent_type: "external",
          webhook_url: "https://example.com/webhook",
          webhook_secret: "secret",
          event_triggers: {},
          is_active: true,
          display_name: "Agent 1",
          description: "Test agent",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      vi.spyOn(AgentService.prototype, "listAgentProfiles").mockResolvedValueOnce(mockProfiles);
      await store.fetchProfiles("test-workspace");
      expect(Object.keys(store.profiles || {}).length).toBe(1);

      // Create new profile
      const newProfilePayload: TCreateAgentProfilePayload = {
        display_name: "Agent 2",
        description: "New agent",
        webhook_url: "https://example.com/webhook2",
        webhook_secret: "secret2",
      };

      const newProfileResponse = {
        ...newProfilePayload,
        id: "agent-2",
        user_id: "user-1",
        workspace_id: "workspace-1",
        agent_type: "external" as const,
        event_triggers: {},
        is_active: true,
        created_at: "2024-01-02T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        api_token: "token-xyz",
      };

      vi.spyOn(AgentService.prototype, "createAgentProfile").mockResolvedValueOnce(newProfileResponse);
      await store.createProfile("test-workspace", newProfilePayload);
      expect(Object.keys(store.profiles || {}).length).toBe(2);

      // Update profile
      const updatePayload: Partial<TAgentProfile> = { is_active: false };
      vi.spyOn(AgentService.prototype, "updateAgentProfile").mockResolvedValueOnce({
        ...mockProfiles[0],
        ...updatePayload,
      });
      await store.updateProfile("test-workspace", "agent-1", updatePayload);
      expect(store.profiles?.["agent-1"].is_active).toBe(false);

      // Remove profile
      vi.spyOn(AgentService.prototype, "deleteAgentProfile").mockResolvedValueOnce(undefined);
      await store.removeProfile("test-workspace", "agent-1");
      expect(Object.keys(store.profiles || {}).length).toBe(1);
    });
  });
});
