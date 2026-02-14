/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { IssueTypeStore } from "./issue-type.store";

// Mock the IssueTypeService before importing it
vi.mock("../services/issue-type.service");

import { IssueTypeService } from "../services/issue-type.service";
import type { TIssueType, TProjectIssueType } from "../types/issue-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRootStore = any;

describe("IssueTypeStore", () => {
  let store: IssueTypeStore;
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
    store = new IssueTypeStore(mockRootStore);
  });

  describe("createIssueType", () => {
    it("should add a new issue type to issueTypeMap", async () => {
      const newIssueType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "A bug in the software",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: true,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      vi.spyOn(IssueTypeService.prototype, "createIssueType").mockResolvedValueOnce(newIssueType);

      const result = await store.createIssueType("test-workspace", { name: "Bug" });

      expect(result).toEqual(newIssueType);
      expect(store.issueTypeMap["type-1"]).toEqual(newIssueType);
    });

    it("should set error message on creation failure", async () => {
      const error = new Error("Creation failed");

      vi.spyOn(IssueTypeService.prototype, "createIssueType").mockRejectedValueOnce(error);

      await expect(store.createIssueType("test-workspace", { name: "Bug" })).rejects.toThrow();
      expect(store.error).toBe("Creation failed");
    });
  });

  describe("deleteIssueType", () => {
    it("should remove an issue type from issueTypeMap", async () => {
      const issueType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Populate the store
      store.issueTypeMap["type-1"] = issueType;

      vi.spyOn(IssueTypeService.prototype, "deleteIssueType").mockResolvedValueOnce(undefined);

      await store.deleteIssueType("test-workspace", "type-1");

      expect(store.issueTypeMap["type-1"]).toBeUndefined();
    });

    it("should rollback deletion on error", async () => {
      const issueType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = issueType;

      const error = new Error("Deletion failed");
      vi.spyOn(IssueTypeService.prototype, "deleteIssueType").mockRejectedValueOnce(error);

      await expect(store.deleteIssueType("test-workspace", "type-1")).rejects.toThrow();
      expect(store.issueTypeMap["type-1"]).toEqual(issueType);
      expect(store.error).toBe("Deletion failed");
    });
  });

  describe("updateIssueType", () => {
    it("should perform optimistic update and persist server response", async () => {
      const originalType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "Original description",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const updatedType: TIssueType = {
        ...originalType,
        name: "Critical Bug",
        updated_at: "2024-01-02T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = originalType;

      vi.spyOn(IssueTypeService.prototype, "updateIssueType").mockResolvedValueOnce(updatedType);

      const result = await store.updateIssueType("test-workspace", "type-1", { name: "Critical Bug" });

      expect(result).toEqual(updatedType);
      expect(store.issueTypeMap["type-1"]).toEqual(updatedType);
    });

    it("should rollback optimistic update on error", async () => {
      const originalType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = originalType;

      const error = new Error("Update failed");
      vi.spyOn(IssueTypeService.prototype, "updateIssueType").mockRejectedValueOnce(error);

      await expect(store.updateIssueType("test-workspace", "type-1", { name: "New Name" })).rejects.toThrow();
      expect(store.issueTypeMap["type-1"]).toEqual(originalType);
      expect(store.error).toBe("Update failed");
    });
  });

  describe("fetchIssueTypes", () => {
    it("should clear stale data and populate issueTypeMap", async () => {
      const issueTypes: TIssueType[] = [
        {
          id: "type-1",
          workspace_id: "workspace-1",
          name: "Bug",
          description: "",
          logo_props: { color: "#ff0000" },
          is_epic: false,
          is_default: true,
          is_active: true,
          level: 0,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "type-2",
          workspace_id: "workspace-1",
          name: "Feature",
          description: "",
          logo_props: { color: "#00ff00" },
          is_epic: false,
          is_default: false,
          is_active: true,
          level: 0,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      // Add stale data
      store.issueTypeMap["stale-id"] = { ...issueTypes[0], id: "stale-id" };

      vi.spyOn(IssueTypeService.prototype, "listIssueTypes").mockResolvedValueOnce(issueTypes);

      await store.fetchIssueTypes("test-workspace");

      expect(store.issueTypeMap["type-1"]).toEqual(issueTypes[0]);
      expect(store.issueTypeMap["type-2"]).toEqual(issueTypes[1]);
      expect(store.issueTypeMap["stale-id"]).toBeUndefined();
      expect(store.isLoading).toBe(false);
    });

    it("should set error on fetch failure", async () => {
      const error = new Error("Fetch failed");
      vi.spyOn(IssueTypeService.prototype, "listIssueTypes").mockRejectedValueOnce(error);

      await expect(store.fetchIssueTypes("test-workspace")).rejects.toThrow();
      expect(store.error).toBe("Fetch failed");
      expect(store.isLoading).toBe(false);
    });
  });

  describe("fetchProjectIssueTypes", () => {
    it("should clear stale data and populate projectIssueTypeMap", async () => {
      const projectIssueTypes: TProjectIssueType[] = [
        {
          id: "pit-1",
          project_id: "project-1",
          workspace_id: "workspace-1",
          issue_type_id: "type-1",
          level: 0,
          is_default: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          issue_type_detail: {
            id: "type-1",
            workspace_id: "workspace-1",
            name: "Bug",
            description: "",
            logo_props: { color: "#ff0000" },
            is_epic: false,
            is_default: true,
            is_active: true,
            level: 0,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        },
      ];

      // Add stale data
      store.projectIssueTypeMap["stale-pit"] = { ...projectIssueTypes[0], id: "stale-pit" };

      vi.spyOn(IssueTypeService.prototype, "listProjectIssueTypes").mockResolvedValueOnce(projectIssueTypes);

      await store.fetchProjectIssueTypes("test-workspace", "project-1");

      expect(store.projectIssueTypeMap["pit-1"]).toEqual(projectIssueTypes[0]);
      expect(store.projectIssueTypeMap["stale-pit"]).toBeUndefined();
      // Should also cache the nested issue type detail
      expect(store.issueTypeMap["type-1"]).toEqual(projectIssueTypes[0].issue_type_detail);
      expect(store.isLoading).toBe(false);
    });
  });

  describe("getIssueTypeById", () => {
    it("should return an issue type by its ID", () => {
      const issueType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = issueType;

      const getter = store.getIssueTypeById;
      const result = getter("type-1");

      expect(result).toEqual(issueType);
    });

    it("should return undefined for non-existent ID", () => {
      const getter = store.getIssueTypeById;
      const result = getter("non-existent");

      expect(result).toBeUndefined();
    });
  });

  describe("getDefaultIssueType", () => {
    it("should return the issue type marked as default", () => {
      const defaultType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: true,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const nonDefaultType: TIssueType = {
        id: "type-2",
        workspace_id: "workspace-1",
        name: "Feature",
        description: "",
        logo_props: { color: "#00ff00" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = defaultType;
      store.issueTypeMap["type-2"] = nonDefaultType;

      const getter = store.getDefaultIssueType;
      const result = getter("test-workspace");

      expect(result).toEqual(defaultType);
    });

    it("should return undefined if no default issue type exists", () => {
      const nonDefaultType: TIssueType = {
        id: "type-1",
        workspace_id: "workspace-1",
        name: "Bug",
        description: "",
        logo_props: { color: "#ff0000" },
        is_epic: false,
        is_default: false,
        is_active: true,
        level: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.issueTypeMap["type-1"] = nonDefaultType;

      const getter = store.getDefaultIssueType;
      const result = getter("test-workspace");

      expect(result).toBeUndefined();
    });
  });

  describe("getWorkspaceIssueTypes", () => {
    it("should return all cached issue types", () => {
      const issueTypes: TIssueType[] = [
        {
          id: "type-1",
          workspace_id: "workspace-1",
          name: "Bug",
          description: "",
          logo_props: { color: "#ff0000" },
          is_epic: false,
          is_default: true,
          is_active: true,
          level: 0,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "type-2",
          workspace_id: "workspace-1",
          name: "Feature",
          description: "",
          logo_props: { color: "#00ff00" },
          is_epic: false,
          is_default: false,
          is_active: true,
          level: 0,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      issueTypes.forEach((type) => {
        store.issueTypeMap[type.id] = type;
      });

      const getter = store.getWorkspaceIssueTypes;
      const result = getter("test-workspace");

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(issueTypes[0]);
      expect(result).toContainEqual(issueTypes[1]);
    });
  });

  describe("getProjectIssueTypes", () => {
    it("should filter project issue types by project ID", () => {
      const projectIssueTypes: TProjectIssueType[] = [
        {
          id: "pit-1",
          project_id: "project-1",
          workspace_id: "workspace-1",
          issue_type_id: "type-1",
          level: 0,
          is_default: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        {
          id: "pit-2",
          project_id: "project-2",
          workspace_id: "workspace-1",
          issue_type_id: "type-1",
          level: 0,
          is_default: false,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      projectIssueTypes.forEach((pit) => {
        store.projectIssueTypeMap[pit.id] = pit;
      });

      const getter = store.getProjectIssueTypes;
      const result = getter("test-workspace", "project-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(projectIssueTypes[0]);
    });

    it("should return empty array if no matching project issue types exist", () => {
      const projectIssueTypes: TProjectIssueType[] = [
        {
          id: "pit-1",
          project_id: "project-2",
          workspace_id: "workspace-1",
          issue_type_id: "type-1",
          level: 0,
          is_default: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      projectIssueTypes.forEach((pit) => {
        store.projectIssueTypeMap[pit.id] = pit;
      });

      const getter = store.getProjectIssueTypes;
      const result = getter("test-workspace", "project-1");

      expect(result).toHaveLength(0);
    });
  });
});
