/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRunStore } from "./agent-run.store";

// Mock the AgentService before importing it
vi.mock("../../services/agent.service");

import { AgentService } from "../../services/agent.service";
import type { TAgentRun, TAgentRunActivity } from "../../types/agent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRootStore = any;

describe("AgentRunStore", () => {
  let store: AgentRunStore;
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
    store = new AgentRunStore(mockRootStore);
  });

  describe("fetchRunsForIssue", () => {
    it("should fetch runs and populate store correctly", async () => {
      const mockRuns: TAgentRun[] = [
        {
          id: "run-1",
          agent_id: "agent-1",
          workspace_id: "workspace-1",
          project_id: "project-1",
          issue_id: "issue-1",
          status: "in_progress",
          stale_timeout: 300,
          last_activity_at: "2024-01-01T00:00:00Z",
          completed_at: null,
          trigger_metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "run-2",
          agent_id: "agent-1",
          workspace_id: "workspace-1",
          project_id: "project-1",
          issue_id: "issue-1",
          status: "created",
          stale_timeout: 300,
          last_activity_at: "2024-01-01T00:00:00Z",
          completed_at: null,
          trigger_metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      vi.spyOn(AgentService.prototype, "listAgentRuns").mockResolvedValueOnce(mockRuns);

      await store.fetchRunsForIssue("test-workspace", "issue-1");

      expect(store.runMap["run-1"]).toEqual(mockRuns[0]);
      expect(store.runMap["run-2"]).toEqual(mockRuns[1]);
      expect(store.runsByIssueId["issue-1"]).toEqual(["run-1", "run-2"]);
      expect(store.loader).toBe(false);
    });

    it("should clear stale data when fetching runs", async () => {
      const oldRun: TAgentRun = {
        id: "old-run",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "completed",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const newRun: TAgentRun = {
        id: "new-run",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "in_progress",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Populate with old run
      store.runMap["old-run"] = oldRun;
      store.runsByIssueId["issue-1"] = ["old-run"];

      vi.spyOn(AgentService.prototype, "listAgentRuns").mockResolvedValueOnce([newRun]);

      await store.fetchRunsForIssue("test-workspace", "issue-1");

      expect(store.runsByIssueId["issue-1"]).toEqual(["new-run"]);
      expect(store.runMap["old-run"]).toEqual(oldRun); // old run still in map
      expect(store.runMap["new-run"]).toEqual(newRun); // but not in the issue's run list
    });

    it("should handle fetch errors gracefully", async () => {
      const error = new Error("Fetch failed");
      vi.spyOn(AgentService.prototype, "listAgentRuns").mockRejectedValueOnce(error);

      await expect(store.fetchRunsForIssue("test-workspace", "issue-1")).rejects.toThrow("Fetch failed");
      expect(store.loader).toBe(false);
    });

    it("should set loader state during fetch", async () => {
      vi.spyOn(AgentService.prototype, "listAgentRuns").mockImplementationOnce(async () => {
        expect(store.loader).toBe(true);
        return [];
      });

      await store.fetchRunsForIssue("test-workspace", "issue-1");
      expect(store.loader).toBe(false);
    });
  });

  describe("fetchActivitiesForRun", () => {
    it("should fetch activities and populate store correctly", async () => {
      const mockActivities: TAgentRunActivity[] = [
        {
          id: "activity-1",
          run_id: "run-1",
          activity_type: "thought",
          content: "Analyzing the issue",
          metadata: {},
          is_ephemeral: false,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "activity-2",
          run_id: "run-1",
          activity_type: "action",
          content: "Creating a comment",
          metadata: {},
          is_ephemeral: false,
          created_at: "2024-01-01T00:01:00Z",
          updated_at: "2024-01-01T00:01:00Z",
        },
      ];

      vi.spyOn(AgentService.prototype, "listRunActivities").mockResolvedValueOnce(mockActivities);

      await store.fetchActivitiesForRun("test-workspace", "run-1");

      expect(store.activityMap["activity-1"]).toEqual(mockActivities[0]);
      expect(store.activityMap["activity-2"]).toEqual(mockActivities[1]);
      expect(store.activitiesByRunId["run-1"]).toEqual(["activity-1", "activity-2"]);
      expect(store.loader).toBe(false);
    });

    it("should clear stale activities when fetching", async () => {
      const oldActivity: TAgentRunActivity = {
        id: "old-activity",
        run_id: "run-1",
        activity_type: "thought",
        content: "Old thought",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const newActivity: TAgentRunActivity = {
        id: "new-activity",
        run_id: "run-1",
        activity_type: "action",
        content: "New action",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:01:00Z",
        updated_at: "2024-01-01T00:01:00Z",
      };

      // Populate with old activity
      store.activityMap["old-activity"] = oldActivity;
      store.activitiesByRunId["run-1"] = ["old-activity"];

      vi.spyOn(AgentService.prototype, "listRunActivities").mockResolvedValueOnce([newActivity]);

      await store.fetchActivitiesForRun("test-workspace", "run-1");

      expect(store.activitiesByRunId["run-1"]).toEqual(["new-activity"]);
    });

    it("should handle fetch errors", async () => {
      const error = new Error("Activities fetch failed");
      vi.spyOn(AgentService.prototype, "listRunActivities").mockRejectedValueOnce(error);

      await expect(store.fetchActivitiesForRun("test-workspace", "run-1")).rejects.toThrow(
        "Activities fetch failed"
      );
      expect(store.loader).toBe(false);
    });
  });

  describe("postElicitationResponse", () => {
    it("should post response and add to store", async () => {
      const mockResponse: TAgentRunActivity = {
        id: "activity-3",
        run_id: "run-1",
        activity_type: "response",
        content: "User response",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:02:00Z",
        updated_at: "2024-01-01T00:02:00Z",
      };

      // Initialize activities for the run
      store.activitiesByRunId["run-1"] = ["activity-1"];
      store.activityMap["activity-1"] = {
        id: "activity-1",
        run_id: "run-1",
        activity_type: "thought",
        content: "Thinking",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      vi.spyOn(AgentService.prototype, "postActivity").mockResolvedValueOnce(mockResponse);

      await store.postElicitationResponse("test-workspace", "run-1", "User response");

      expect(store.activityMap["activity-3"]).toEqual(mockResponse);
      expect(store.activitiesByRunId["run-1"]).toContain("activity-3");
    });

    it("should create activities array if it doesn't exist", async () => {
      const mockResponse: TAgentRunActivity = {
        id: "activity-1",
        run_id: "run-2",
        activity_type: "response",
        content: "First response",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      vi.spyOn(AgentService.prototype, "postActivity").mockResolvedValueOnce(mockResponse);

      // Ensure the run doesn't exist yet
      expect(store.activitiesByRunId["run-2"]).toBeUndefined();

      await store.postElicitationResponse("test-workspace", "run-2", "First response");

      expect(store.activitiesByRunId["run-2"]).toEqual(["activity-1"]);
      expect(store.activityMap["activity-1"]).toEqual(mockResponse);
    });

    it("should handle post errors", async () => {
      const error = new Error("Post failed");
      vi.spyOn(AgentService.prototype, "postActivity").mockRejectedValueOnce(error);

      await expect(store.postElicitationResponse("test-workspace", "run-1", "Response")).rejects.toThrow("Post failed");
    });

    it("should call service with correct parameters", async () => {
      const mockResponse: TAgentRunActivity = {
        id: "activity-1",
        run_id: "run-1",
        activity_type: "response",
        content: "Response content",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const postActivitySpy = vi
        .spyOn(AgentService.prototype, "postActivity")
        .mockResolvedValueOnce(mockResponse);

      await store.postElicitationResponse("workspace-slug", "run-123", "My response");

      expect(postActivitySpy).toHaveBeenCalledWith("workspace-slug", "run-123", {
        activity_type: "response",
        content: "My response",
      });
    });
  });

  describe("getRunsByIssueId", () => {
    it("should return runs for a given issue", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "in_progress",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.getRunsByIssueId;
      const result = getter("issue-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockRun);
    });

    it("should return empty array for non-existent issue", () => {
      const getter = store.getRunsByIssueId;
      const result = getter("non-existent-issue");

      expect(result).toEqual([]);
    });

    it("should filter out undefined runs", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "in_progress",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      // Reference a non-existent run
      store.runsByIssueId["issue-1"] = ["run-1", "run-2"];

      const getter = store.getRunsByIssueId;
      const result = getter("issue-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockRun);
    });
  });

  describe("getActivitiesByRunId", () => {
    it("should return activities for a given run", () => {
      const mockActivity: TAgentRunActivity = {
        id: "activity-1",
        run_id: "run-1",
        activity_type: "thought",
        content: "Thinking",
        metadata: {},
        is_ephemeral: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.activityMap["activity-1"] = mockActivity;
      store.activitiesByRunId["run-1"] = ["activity-1"];

      const getter = store.getActivitiesByRunId;
      const result = getter("run-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockActivity);
    });

    it("should return empty array for non-existent run", () => {
      const getter = store.getActivitiesByRunId;
      const result = getter("non-existent-run");

      expect(result).toEqual([]);
    });

    it("should return activities in order", () => {
      const activities: TAgentRunActivity[] = [
        {
          id: "activity-1",
          run_id: "run-1",
          activity_type: "thought",
          content: "First",
          metadata: {},
          is_ephemeral: false,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "activity-2",
          run_id: "run-1",
          activity_type: "action",
          content: "Second",
          metadata: {},
          is_ephemeral: false,
          created_at: "2024-01-01T00:01:00Z",
          updated_at: "2024-01-01T00:01:00Z",
        },
      ];

      activities.forEach((activity) => {
        store.activityMap[activity.id] = activity;
      });

      store.activitiesByRunId["run-1"] = ["activity-1", "activity-2"];

      const getter = store.getActivitiesByRunId;
      const result = getter("run-1");

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("First");
      expect(result[1].content).toBe("Second");
    });
  });

  describe("hasActiveRuns", () => {
    it("should return true when issue has in_progress run", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "in_progress",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(true);
    });

    it("should return true when issue has created run", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "created",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(true);
    });

    it("should return true when issue has stale run", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "stale",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(true);
    });

    it("should return false when all runs are completed", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "completed",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(false);
    });

    it("should return false when all runs are failed", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "failed",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(false);
    });

    it("should return false when all runs are stopped", () => {
      const mockRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "stopped",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = mockRun;
      store.runsByIssueId["issue-1"] = ["run-1"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(false);
    });

    it("should return false when issue has no runs", () => {
      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(false);
    });

    it("should return true when issue has multiple runs including one active", () => {
      const activeRun: TAgentRun = {
        id: "run-1",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "in_progress",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const completedRun: TAgentRun = {
        id: "run-2",
        agent_id: "agent-1",
        workspace_id: "workspace-1",
        project_id: "project-1",
        issue_id: "issue-1",
        status: "completed",
        stale_timeout: 300,
        last_activity_at: "2024-01-01T00:00:00Z",
        completed_at: "2024-01-01T01:00:00Z",
        trigger_metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.runMap["run-1"] = activeRun;
      store.runMap["run-2"] = completedRun;
      store.runsByIssueId["issue-1"] = ["run-1", "run-2"];

      const getter = store.hasActiveRuns;
      const result = getter("issue-1");

      expect(result).toBe(true);
    });
  });
});
