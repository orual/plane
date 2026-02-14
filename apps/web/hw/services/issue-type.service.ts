/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
// types
import type {
  TIssueType,
  TProjectIssueType,
  TIssueTypeListResponse,
  TProjectIssueTypeListResponse,
} from "@/plane-web/types/issue-types";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // ============================================================
  // Workspace-scoped issue type endpoints
  // ============================================================

  async listIssueTypes(workspaceSlug: string): Promise<TIssueTypeListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueType(workspaceSlug: string, issueTypeId: string): Promise<TIssueType> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueType(workspaceSlug: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueType(workspaceSlug: string, issueTypeId: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueType(workspaceSlug: string, issueTypeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/issue-types/${issueTypeId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ============================================================
  // Project-scoped issue type linking endpoints
  // ============================================================

  async listProjectIssueTypes(workspaceSlug: string, projectId: string): Promise<TProjectIssueTypeListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectIssueType(
    workspaceSlug: string,
    projectId: string,
    projectIssueTypeId: string
  ): Promise<TProjectIssueType> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${projectIssueTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async linkProjectIssueType(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TProjectIssueType>
  ): Promise<TProjectIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unlinkProjectIssueType(workspaceSlug: string, projectId: string, projectIssueTypeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${projectIssueTypeId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
