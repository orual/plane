/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// APIService base methods return untyped responses
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { IIssuePropertyDefinition, IIssuePropertyValueDetail, IIssuePropertyValueUpsertItem } from "../types";

export class IssuePropertyService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchPropertyDefinitions(workspaceSlug: string): Promise<IIssuePropertyDefinition[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/property-definitions/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPropertyDefinition(
    workspaceSlug: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    return this.post(`/api/workspaces/${workspaceSlug}/property-definitions/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePropertyDefinition(
    workspaceSlug: string,
    propertyId: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    return this.patch(`/api/workspaces/${workspaceSlug}/property-definitions/${propertyId}/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePropertyDefinition(workspaceSlug: string, propertyId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/property-definitions/${propertyId}/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IIssuePropertyValueDetail[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/`)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async upsertIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    items: IIssuePropertyValueUpsertItem[]
  ): Promise<IIssuePropertyValueDetail[]> {
    return this.put(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/property-values/bulk-upsert/`,
      items
    )
      .then((res) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = res?.data;
        // Handle 207 Multi-Status: backend returns {results: [...], errors: [...]}
        return Array.isArray(data) ? data : (data?.results ?? []);
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
