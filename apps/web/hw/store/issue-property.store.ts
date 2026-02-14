/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable, action, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// service
import { IssuePropertyService } from "../services/issue-property.service";
// types
import type { CoreRootStore } from "@/store/root.store";
import type { IIssuePropertyDefinition, IIssuePropertyValueDetail, IIssuePropertyValueUpsertItem } from "../types";

export interface IIssuePropertyStore {
  // State
  isLoading: boolean;
  error: string | null;
  // Maps
  definitionsMap: Map<string, IIssuePropertyDefinition>;
  valuesMap: Map<string, Map<string, IIssuePropertyValueDetail>>;
  // Selectors
  getAllDefinitions: () => IIssuePropertyDefinition[];
  getDefinitionById: (propertyId: string) => IIssuePropertyDefinition | undefined;
  getIssueValues: (issueKey: string) => IIssuePropertyValueDetail[];
  getIssueValueByDefinitionId: (issueKey: string, definitionId: string) => IIssuePropertyValueDetail | undefined;
  // Actions
  fetchDefinitions: (workspaceSlug: string) => Promise<void>;
  fetchIssueValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
  upsertIssueValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    items: IIssuePropertyValueUpsertItem[]
  ) => Promise<void>;
}

/**
 * MobX store for custom property definitions and issue-specific property values.
 *
 * definitionsMap: workspace-scoped property definitions keyed by definition ID
 * valuesMap: issue-specific property values, keyed by `issueId`, inner map keyed by `property_definition_id`
 */
export class IssuePropertyStore implements IIssuePropertyStore {
  isLoading = false;

  error: string | null = null;
  definitionsMap = new Map<string, IIssuePropertyDefinition>();
  valuesMap = new Map<string, Map<string, IIssuePropertyValueDetail>>();

  // service
  private service: IssuePropertyService;
  private rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    this.rootStore = rootStore;
    this.service = new IssuePropertyService();
    makeObservable(this, {
      isLoading: observable,
      error: observable,
      definitionsMap: observable,
      valuesMap: observable,
      fetchDefinitions: action,
      fetchIssueValues: action,
      upsertIssueValues: action,
    });
  }

  /**
   * Get all definitions as array.
   */
  getAllDefinitions = computedFn(() => {
    return Array.from(this.definitionsMap.values());
  });

  /**
   * Get definition by ID.
   */
  getDefinitionById = computedFn((propertyId: string) => {
    return this.definitionsMap.get(propertyId);
  });

  /**
   * Get all property values for an issue.
   */
  getIssueValues = computedFn((issueId: string) => {
    const valueMap = this.valuesMap.get(issueId);
    return valueMap ? Array.from(valueMap.values()) : [];
  });

  /**
   * Get a specific property value for an issue.
   */
  getIssueValueByDefinitionId = computedFn((issueId: string, definitionId: string) => {
    return this.valuesMap.get(issueId)?.get(definitionId);
  });

  /**
   * Fetch all property definitions for a workspace.
   */
  async fetchDefinitions(workspaceSlug: string): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      const definitions = await this.service.fetchPropertyDefinitions(workspaceSlug);
      runInAction(() => {
        this.definitionsMap.clear();
        definitions.forEach((def) => {
          this.definitionsMap.set(def.id, def);
        });
        this.isLoading = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to fetch property definitions";
        } else {
          this.error = "Failed to fetch property definitions";
        }
        this.isLoading = false;
      });
    }
  }

  /**
   * Fetch property values for a specific issue.
   */
  async fetchIssueValues(workspaceSlug: string, projectId: string, issueId: string): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const values = await this.service.fetchIssuePropertyValues(workspaceSlug, projectId, issueId);
      runInAction(() => {
        const valueMap = new Map<string, IIssuePropertyValueDetail>();
        values.forEach((val) => {
          valueMap.set(val.property_definition_id, val);
        });
        this.valuesMap.set(issueId, valueMap);
        this.isLoading = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to fetch property values";
        } else {
          this.error = "Failed to fetch property values";
        }
        this.isLoading = false;
      });
    }
  }

  /**
   * Bulk upsert property values for an issue.
   */
  async upsertIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    items: IIssuePropertyValueUpsertItem[]
  ): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      const results = await this.service.upsertIssuePropertyValues(workspaceSlug, projectId, issueId, items);
      runInAction(() => {
        if (!this.valuesMap.has(issueId)) {
          this.valuesMap.set(issueId, new Map());
        }
        const valueMap = this.valuesMap.get(issueId)!;
        results.forEach((val) => {
          valueMap.set(val.property_definition_id, val);
        });
        this.isLoading = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to upsert property values";
        } else {
          this.error = "Failed to upsert property values";
        }
        this.isLoading = false;
      });
    }
  }
}
