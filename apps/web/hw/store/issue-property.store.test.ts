/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See LICENSE file for details.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { IssuePropertyStore } from "./issue-property.store";

// Mock IssuePropertyService before importing it
vi.mock("../services/issue-property.service");

import { IssuePropertyService } from "../services/issue-property.service";
import type { IIssuePropertyDefinition } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockRootStore = any;

describe("IssuePropertyStore", () => {
  let store: IssuePropertyStore;
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

    // Create an instance of store
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    store = new IssuePropertyStore(mockRootStore);
  });

  describe("createDefinition", () => {
    it("should add a new property definition to definitionsMap", async () => {
      const newDefinition: IIssuePropertyDefinition = {
        id: "def-1",
        workspace_id: "workspace-1",
        issue_type_id: null,
        name: "Priority",
        property_type: "select",
        options: ["Low", "Medium", "High"],
        is_required: false,
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      vi.spyOn(IssuePropertyService.prototype, "createPropertyDefinition").mockResolvedValueOnce(newDefinition);

      const result = await store.createDefinition("test-workspace", { name: "Priority", property_type: "select" });

      expect(result).toEqual(newDefinition);
      expect(store.definitionsMap.get("def-1")).toEqual(newDefinition);
    });

    it("should set error message on creation failure", async () => {
      const error = new Error("Creation failed");

      vi.spyOn(IssuePropertyService.prototype, "createPropertyDefinition").mockRejectedValueOnce(error);

      await expect(store.createDefinition("test-workspace", { name: "Priority" })).rejects.toThrow();
      expect(store.error).toBe("Creation failed");
    });
  });

  describe("updateDefinition", () => {
    it("should perform optimistic update and persist server response", async () => {
      const originalDef: IIssuePropertyDefinition = {
        id: "def-1",
        workspace_id: "workspace-1",
        issue_type_id: null,
        name: "Priority",
        property_type: "select",
        options: ["Low", "Medium", "High"],
        is_required: false,
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const updatedDef: IIssuePropertyDefinition = {
        ...originalDef,
        name: "Urgency",
        options: ["Low", "High"],
        updated_at: "2024-01-02T00:00:00Z",
      };

      store.definitionsMap.set("def-1", originalDef);

      vi.spyOn(IssuePropertyService.prototype, "updatePropertyDefinition").mockResolvedValueOnce(updatedDef);

      const result = await store.updateDefinition("test-workspace", "def-1", { name: "Urgency", options: ["Low", "High"] });

      expect(result).toEqual(updatedDef);
      expect(store.definitionsMap.get("def-1")).toEqual(updatedDef);
    });

    it("should rollback optimistic update on error", async () => {
      const originalDef: IIssuePropertyDefinition = {
        id: "def-1",
        workspace_id: "workspace-1",
        issue_type_id: null,
        name: "Priority",
        property_type: "select",
        options: ["Low", "Medium", "High"],
        is_required: false,
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.definitionsMap.set("def-1", originalDef);

      const error = new Error("Update failed");
      vi.spyOn(IssuePropertyService.prototype, "updatePropertyDefinition").mockRejectedValueOnce(error);

      await expect(store.updateDefinition("test-workspace", "def-1", { name: "New Name" })).rejects.toThrow();
      expect(store.definitionsMap.get("def-1")).toEqual(originalDef);
      expect(store.error).toBe("Update failed");
    });
  });

  describe("deleteDefinition", () => {
    it("should remove a property definition from definitionsMap", async () => {
      const definition: IIssuePropertyDefinition = {
        id: "def-1",
        workspace_id: "workspace-1",
        issue_type_id: null,
        name: "Priority",
        property_type: "select",
        options: ["Low", "Medium", "High"],
        is_required: false,
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      // Populate store
      store.definitionsMap.set("def-1", definition);

      vi.spyOn(IssuePropertyService.prototype, "deletePropertyDefinition").mockResolvedValueOnce(undefined);

      await store.deleteDefinition("test-workspace", "def-1");

      expect(store.definitionsMap.get("def-1")).toBeUndefined();
    });

    it("should rollback deletion on error", async () => {
      const definition: IIssuePropertyDefinition = {
        id: "def-1",
        workspace_id: "workspace-1",
        issue_type_id: null,
        name: "Priority",
        property_type: "select",
        options: ["Low", "Medium", "High"],
        is_required: false,
        sort_order: 0,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      store.definitionsMap.set("def-1", definition);

      const error = new Error("Deletion failed");
      vi.spyOn(IssuePropertyService.prototype, "deletePropertyDefinition").mockRejectedValueOnce(error);

      await expect(store.deleteDefinition("test-workspace", "def-1")).rejects.toThrow();
      expect(store.definitionsMap.get("def-1")).toEqual(definition);
      expect(store.error).toBe("Deletion failed");
    });
  });
});
