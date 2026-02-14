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
  // CRUD actions
  createDefinition: (
    workspaceSlug: string,
    data: Partial<IIssuePropertyDefinition>
  ) => Promise<IIssuePropertyDefinition>;
  updateDefinition: (
    workspaceSlug: string,
    propertyId: string,
    data: Partial<IIssuePropertyDefinition>
  ) => Promise<IIssuePropertyDefinition>;
  deleteDefinition: (workspaceSlug: string, propertyId: string) => Promise<void>;
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
      createDefinition: action,
      updateDefinition: action,
      deleteDefinition: action,
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
        throw error;
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
      if (error instanceof Error) {
        this.error = error.message;
      } else if (error && typeof error === "object" && "message" in error) {
        this.error = String((error as { message: unknown }).message) || "Failed to fetch property values";
      } else {
        this.error = "Failed to fetch property values";
      }
      this.isLoading = false;
      throw error;
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
      if (error instanceof Error) {
        this.error = error.message;
      } else if (error && typeof error === "object" && "message" in error) {
        this.error = String((error as { message: unknown }).message) || "Failed to upsert property values";
      } else {
        this.error = "Failed to upsert property values";
      }
      this.isLoading = false;
      throw error;
    }
  }

  /**
   * Create a new property definition.
   */
  async createDefinition(
    workspaceSlug: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    try {
      const definition = await this.service.createPropertyDefinition(workspaceSlug, data);
      runInAction(() => {
        this.definitionsMap.set(definition.id, definition);
      });
      return definition;
    } catch (error: unknown) {
      runInAction(() => {
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to create property definition";
        } else {
          this.error = "Failed to create property definition";
        }
      });
        throw error;
    }
  }

  /**
   * Update an existing property definition with optimistic updates.
   */
  async updateDefinition(
    workspaceSlug: string,
    propertyId: string,
    data: Partial<IIssuePropertyDefinition>
  ): Promise<IIssuePropertyDefinition> {
    const originalData = this.definitionsMap.get(propertyId);
    try {
      // Optimistic update
      if (originalData) {
        runInAction(() => {
          this.definitionsMap.set(propertyId, { ...originalData, ...data } as IIssuePropertyDefinition);
        });
      }

      const definition = await this.service.updatePropertyDefinition(workspaceSlug, propertyId, data);
      runInAction(() => {
        this.definitionsMap.set(propertyId, definition);
      });
      return definition;
    } catch (error: unknown) {
      // Rollback on error
      runInAction(() => {
        if (originalData) {
          this.definitionsMap.set(propertyId, originalData);
        }
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to update property definition";
        } else {
          this.error = "Failed to update property definition";
        }
      });
        throw error;
    }
  }

  /**
   * Delete a property definition with optimistic updates.
   */
  async deleteDefinition(workspaceSlug: string, propertyId: string): Promise<void> {
    const originalData = this.definitionsMap.get(propertyId);
    try {
      // Optimistic delete
      runInAction(() => {
        this.definitionsMap.delete(propertyId);
      });

      await this.service.deletePropertyDefinition(workspaceSlug, propertyId);
    } catch (error: unknown) {
      // Rollback on error
      runInAction(() => {
        if (originalData) {
          this.definitionsMap.set(propertyId, originalData);
        }
        if (error instanceof Error) {
          this.error = error.message;
        } else if (error && typeof error === "object" && "message" in error) {
          this.error = String((error as { message: unknown }).message) || "Failed to delete property definition";
        } else {
          this.error = "Failed to delete property definition";
        }
      });
        throw error;
    }
  }
}
