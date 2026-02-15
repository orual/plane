/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable, action, computed, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// service
import { IssueTypeService } from "../services/issue-type.service";
// types
import type { CoreRootStore } from "@/store/root.store";
import type { TIssueType, TProjectIssueType } from "../types/issue-types";

export interface IIssueTypeStore {
  // observables
  issueTypeMap: Record<string, TIssueType>;
  projectIssueTypeMap: Record<string, TProjectIssueType>;
  isLoading: boolean;
  error: string | null;

  // actions
  fetchIssueTypes: (workspaceSlug: string) => Promise<void>;
  fetchProjectIssueTypes: (workspaceSlug: string, projectId: string) => Promise<void>;
  createIssueType: (workspaceSlug: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateIssueType: (workspaceSlug: string, issueTypeId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  deleteIssueType: (workspaceSlug: string, issueTypeId: string) => Promise<void>;
  linkProjectIssueType: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<TProjectIssueType>;
  unlinkProjectIssueType: (workspaceSlug: string, projectId: string, projectIssueTypeId: string) => Promise<void>;

  // computed getters
  getWorkspaceIssueTypes: (workspaceSlug: string) => TIssueType[];
  getProjectIssueTypes: (workspaceSlug: string, projectId: string) => TProjectIssueType[];
  getIssueTypeById: (issueTypeId: string) => TIssueType | undefined;
  getDefaultIssueType: (workspaceSlug: string) => TIssueType | undefined;
}

export class IssueTypeStore implements IIssueTypeStore {
  // observables
  issueTypeMap: Record<string, TIssueType> = {};
  projectIssueTypeMap: Record<string, TProjectIssueType> = {};
  isLoading = false;
  error: string | null = null;

  // services
  private issueTypeService: IssueTypeService;
  private rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    this.rootStore = rootStore;
    this.issueTypeService = new IssueTypeService();

    makeObservable(this, {
      // observables
      issueTypeMap: observable,
      projectIssueTypeMap: observable,
      isLoading: observable,
      error: observable,

      // actions
      fetchIssueTypes: action,
      fetchProjectIssueTypes: action,
      createIssueType: action,
      updateIssueType: action,
      deleteIssueType: action,
      linkProjectIssueType: action,
      unlinkProjectIssueType: action,

      // computed
      getWorkspaceIssueTypes: computed,
      getProjectIssueTypes: computed,
      getIssueTypeById: computed,
      getDefaultIssueType: computed,
    });
  }

  // ============================================================
  // Actions
  // ============================================================

  fetchIssueTypes = async (workspaceSlug: string): Promise<void> => {
    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const issueTypes = await this.issueTypeService.listIssueTypes(workspaceSlug);

      runInAction(() => {
        // Clear existing entries to prevent stale data from persisting
        this.issueTypeMap = {};
        issueTypes.forEach((issueType) => {
          this.issueTypeMap[issueType.id] = issueType;
        });
        this.isLoading = false;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      runInAction(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to fetch issue types";
        this.isLoading = false;
      });
      throw error;
    }
  };

  fetchProjectIssueTypes = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      runInAction(() => {
        this.isLoading = true;
        this.error = null;
      });

      const projectIssueTypes = await this.issueTypeService.listProjectIssueTypes(workspaceSlug, projectId);

      runInAction(() => {
        // Clear existing entries to prevent stale data from persisting
        this.projectIssueTypeMap = {};
        projectIssueTypes.forEach((projectIssueType) => {
          this.projectIssueTypeMap[projectIssueType.id] = projectIssueType;
          // Also cache the nested issue type detail
          if (projectIssueType.issue_type_detail) {
            this.issueTypeMap[projectIssueType.issue_type_detail.id] = projectIssueType.issue_type_detail;
          }
        });
        this.isLoading = false;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      runInAction(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to fetch project issue types";
        this.isLoading = false;
      });
      throw error;
    }
  };

  createIssueType = async (workspaceSlug: string, data: Partial<TIssueType>): Promise<TIssueType> => {
    try {
      const issueType = await this.issueTypeService.createIssueType(workspaceSlug, data);

      runInAction(() => {
        this.issueTypeMap[issueType.id] = issueType;
      });

      return issueType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      runInAction(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to create issue type";
      });
      throw error;
    }
  };

  updateIssueType = async (
    workspaceSlug: string,
    issueTypeId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> => {
    const originalData = this.issueTypeMap[issueTypeId];
    try {
      // Optimistic update
      runInAction(() => {
        this.issueTypeMap[issueTypeId] = { ...originalData, ...data } as TIssueType;
      });

      const issueType = await this.issueTypeService.updateIssueType(workspaceSlug, issueTypeId, data);

      runInAction(() => {
        this.issueTypeMap[issueTypeId] = issueType;
      });

      return issueType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Rollback on error
      runInAction(() => {
        if (originalData) this.issueTypeMap[issueTypeId] = originalData;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to update issue type";
      });
      throw error;
    }
  };

  deleteIssueType = async (workspaceSlug: string, issueTypeId: string): Promise<void> => {
    const originalData = this.issueTypeMap[issueTypeId];
    try {
      // Optimistic delete
      runInAction(() => {
        delete this.issueTypeMap[issueTypeId];
      });

      await this.issueTypeService.deleteIssueType(workspaceSlug, issueTypeId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Rollback on error
      runInAction(() => {
        if (originalData) this.issueTypeMap[issueTypeId] = originalData;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to delete issue type";
      });
      throw error;
    }
  };

  linkProjectIssueType = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string
  ): Promise<TProjectIssueType> => {
    try {
      const projectIssueType = await this.issueTypeService.linkProjectIssueType(workspaceSlug, projectId, {
        issue_type_id: issueTypeId,
      });

      runInAction(() => {
        this.projectIssueTypeMap[projectIssueType.id] = projectIssueType;
      });

      return projectIssueType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      runInAction(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to link issue type to project";
      });
      throw error;
    }
  };

  unlinkProjectIssueType = async (
    workspaceSlug: string,
    projectId: string,
    projectIssueTypeId: string
  ): Promise<void> => {
    const originalData = this.projectIssueTypeMap[projectIssueTypeId];
    try {
      // Optimistic delete
      runInAction(() => {
        delete this.projectIssueTypeMap[projectIssueTypeId];
      });

      await this.issueTypeService.unlinkProjectIssueType(workspaceSlug, projectId, projectIssueTypeId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Rollback on error
      runInAction(() => {
        if (originalData) this.projectIssueTypeMap[projectIssueTypeId] = originalData;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        this.error = error?.message || "Failed to unlink issue type from project";
      });
      throw error;
    }
  };

  // ============================================================
  // Computed getters
  // ============================================================

  get getWorkspaceIssueTypes() {
    return computedFn((_workspaceSlug: string): TIssueType[] => {
      // Filter issue types by workspace based on the workspace slug stored in the rootStore
      // For now, we return all cached issue types (workspace filtering is implicit via fetchIssueTypes)
      return Object.values(this.issueTypeMap);
    });
  }

  get getProjectIssueTypes() {
    return computedFn((_workspaceSlug: string, projectId: string): TProjectIssueType[] => {
      // Filter project issue types by project ID
      return Object.values(this.projectIssueTypeMap).filter((pit) => pit.project_id === projectId);
    });
  }

  get getIssueTypeById() {
    return computedFn((issueTypeId: string): TIssueType | undefined => {
      return this.issueTypeMap[issueTypeId];
    });
  }

  get getDefaultIssueType() {
    return computedFn((_workspaceSlug: string): TIssueType | undefined => {
      return Object.values(this.issueTypeMap).find((it) => it.is_default);
    });
  }
}
