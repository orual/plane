/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable, action, computed, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// service
import { AgentService } from "../../services/agent.service";
// types
import type { CoreRootStore } from "@/store/root.store";
import type { TAgentRun, TAgentRunActivity } from "../../types/agent";

export interface IAgentRunStore {
  // observables
  runsByIssueId: Record<string, string[]>;
  runMap: Record<string, TAgentRun>;
  activitiesByRunId: Record<string, string[]>;
  activityMap: Record<string, TAgentRunActivity>;
  loader: boolean;

  // computed helpers
  getRunsByIssueId: (issueId: string) => TAgentRun[];
  getActivitiesByRunId: (runId: string) => TAgentRunActivity[];
  hasActiveRuns: (issueId: string) => boolean;

  // actions
  fetchRunsForIssue: (workspaceSlug: string, issueId: string) => Promise<void>;
  fetchActivitiesForRun: (workspaceSlug: string, runId: string) => Promise<void>;
  postElicitationResponse: (workspaceSlug: string, runId: string, content: string) => Promise<void>;
}

export class AgentRunStore implements IAgentRunStore {
  // observables
  runsByIssueId: Record<string, string[]> = {};
  runMap: Record<string, TAgentRun> = {};
  activitiesByRunId: Record<string, string[]> = {};
  activityMap: Record<string, TAgentRunActivity> = {};
  loaderCount = 0;

  get loader(): boolean {
    return this.loaderCount > 0;
  }

  // services
  private agentService: AgentService;
  private rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    this.rootStore = rootStore;
    this.agentService = new AgentService();

    makeObservable(this, {
      // observables
      runsByIssueId: observable,
      runMap: observable,
      activitiesByRunId: observable,
      activityMap: observable,
      loaderCount: observable,

      // actions
      fetchRunsForIssue: action,
      fetchActivitiesForRun: action,
      postElicitationResponse: action,

      // computed
      loader: computed,
      getRunsByIssueId: computed,
      getActivitiesByRunId: computed,
      hasActiveRuns: computed,
    });
  }

  // ============================================================
  // Actions
  // ============================================================

  fetchRunsForIssue = async (workspaceSlug: string, issueId: string): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const runs = await this.agentService.listAgentRuns(workspaceSlug, issueId);

      runInAction(() => {
        // Clear existing runs for this issue to prevent stale data
        this.runsByIssueId[issueId] = [];
        runs.forEach((run) => {
          this.runMap[run.id] = run;
          this.runsByIssueId[issueId].push(run.id);
        });
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  fetchActivitiesForRun = async (workspaceSlug: string, runId: string): Promise<void> => {
    try {
      runInAction(() => {
        this.loaderCount += 1;
      });

      const activities = await this.agentService.listRunActivities(workspaceSlug, runId);

      runInAction(() => {
        // Clear existing activities for this run to prevent stale data
        this.activitiesByRunId[runId] = [];
        activities.forEach((activity) => {
          this.activityMap[activity.id] = activity;
          this.activitiesByRunId[runId].push(activity.id);
        });
      });
    } finally {
      runInAction(() => {
        this.loaderCount -= 1;
      });
    }
  };

  postElicitationResponse = async (workspaceSlug: string, runId: string, content: string): Promise<void> => {
    const response = await this.agentService.postActivity(workspaceSlug, runId, {
      activity_type: "response",
      content,
    });

    runInAction(() => {
      // Add the new activity to the store
      this.activityMap[response.id] = response;
      if (!this.activitiesByRunId[runId]) {
        this.activitiesByRunId[runId] = [];
      }
      this.activitiesByRunId[runId].push(response.id);
    });
  };

  // ============================================================
  // Computed getters
  // ============================================================

  get getRunsByIssueId() {
    return computedFn((issueId: string): TAgentRun[] => {
      const runIds = this.runsByIssueId[issueId] || [];
      return runIds.map((runId) => this.runMap[runId]).filter((run) => run !== undefined);
    });
  }

  get getActivitiesByRunId() {
    return computedFn((runId: string): TAgentRunActivity[] => {
      const activityIds = this.activitiesByRunId[runId] || [];
      return activityIds.map((activityId) => this.activityMap[activityId]).filter((activity) => activity !== undefined);
    });
  }

  get hasActiveRuns() {
    return computedFn((issueId: string): boolean => {
      const runs = this.getRunsByIssueId(issueId);
      return runs.some((run) => ["created", "in_progress", "stale"].includes(run.status));
    });
  }
}
