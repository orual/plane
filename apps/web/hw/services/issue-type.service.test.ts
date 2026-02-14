/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { IssueTypeService } from "./issue-type.service";

describe("IssueTypeService", () => {
  let service: IssueTypeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IssueTypeService();
  });

  describe("URL construction", () => {
    it("should construct correct workspace-scoped issue type endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: [] });

      await service.listIssueTypes("test-workspace");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/issue-types/");
    });

    it("should construct correct workspace-scoped get single issue type endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: {} });

      await service.getIssueType("test-workspace", "type-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/issue-types/type-1/");
    });

    it("should construct correct workspace-scoped create issue type endpoint", async () => {
      const postSpy = vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: {} });

      await service.createIssueType("test-workspace", { name: "Bug" });

      expect(postSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/issue-types/", { name: "Bug" });
    });

    it("should construct correct workspace-scoped update issue type endpoint", async () => {
      const patchSpy = vi.spyOn(service, "patch" as any).mockResolvedValueOnce({ data: {} });

      await service.updateIssueType("test-workspace", "type-1", { name: "Bug" });

      expect(patchSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/issue-types/type-1/", { name: "Bug" });
    });

    it("should construct correct workspace-scoped delete issue type endpoint", async () => {
      const deleteSpy = vi.spyOn(service, "delete" as any).mockResolvedValueOnce({});

      await service.deleteIssueType("test-workspace", "type-1");

      expect(deleteSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/issue-types/type-1/");
    });

    it("should construct correct project-scoped list issue types endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: [] });

      await service.listProjectIssueTypes("test-workspace", "project-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/projects/project-1/issue-types/");
    });

    it("should construct correct project-scoped get single issue type endpoint", async () => {
      const getSpy = vi.spyOn(service, "get" as any).mockResolvedValueOnce({ data: {} });

      await service.getProjectIssueType("test-workspace", "project-1", "pit-1");

      expect(getSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/projects/project-1/issue-types/pit-1/");
    });

    it("should construct correct project-scoped link issue type endpoint", async () => {
      const postSpy = vi.spyOn(service, "post" as any).mockResolvedValueOnce({ data: {} });

      await service.linkProjectIssueType("test-workspace", "project-1", { issue_type_id: "type-1" });

      expect(postSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/projects/project-1/issue-types/", {
        issue_type_id: "type-1",
      });
    });

    it("should construct correct project-scoped unlink issue type endpoint", async () => {
      const deleteSpy = vi.spyOn(service, "delete" as any).mockResolvedValueOnce({});

      await service.unlinkProjectIssueType("test-workspace", "project-1", "pit-1");

      expect(deleteSpy).toHaveBeenCalledWith("/api/workspaces/test-workspace/projects/project-1/issue-types/pit-1/");
    });
  });

  describe("error handling", () => {
    it("should throw error response data on get failure", async () => {
      const errorData: any = { error: "Not found" };
      vi.spyOn(service, "get" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.getIssueType("test-workspace", "type-1")).rejects.toEqual(errorData);
    });

    it("should throw error response data on post failure", async () => {
      const errorData: any = { error: "Invalid data" };
      vi.spyOn(service, "post" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.createIssueType("test-workspace", { name: "Bug" })).rejects.toEqual(errorData);
    });

    it("should throw error response data on patch failure", async () => {
      const errorData: any = { error: "Conflict" };
      vi.spyOn(service, "patch" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.updateIssueType("test-workspace", "type-1", { name: "Bug" })).rejects.toEqual(errorData);
    });

    it("should throw error response data on delete failure", async () => {
      const errorData: any = { error: "Forbidden" };
      vi.spyOn(service, "delete" as any).mockRejectedValueOnce({
        response: { data: errorData },
      });

      await expect(service.deleteIssueType("test-workspace", "type-1")).rejects.toEqual(errorData);
    });
  });
});
