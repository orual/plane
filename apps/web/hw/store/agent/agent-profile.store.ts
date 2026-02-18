/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { makeObservable, observable, action, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// service
import { AgentService } from "@/plane-web/services/agent.service";
// types
import type { CoreRootStore } from "@/store/root.store";
import type { TAgentProfile, TCreateAgentProfilePayload } from "@/plane-web/types/agent";

export interface IAgentProfileStore {
  // observables
  profiles: Record<string, TAgentProfile> | null;
  apiToken: string | null;

  // computed helpers
  getProfileById: (agentId: string) => TAgentProfile | null;

  // fetch actions
  fetchProfiles: (workspaceSlug: string) => Promise<TAgentProfile[]>;
  fetchProfileById: (workspaceSlug: string, agentId: string) => Promise<TAgentProfile>;

  // crud actions
  createProfile: (
    workspaceSlug: string,
    data: TCreateAgentProfilePayload
  ) => Promise<{ profile: TAgentProfile; apiToken: string }>;
  updateProfile: (workspaceSlug: string, agentId: string, data: Partial<TAgentProfile>) => Promise<TAgentProfile>;
  removeProfile: (workspaceSlug: string, agentId: string) => Promise<void>;

  // token actions
  clearApiToken: () => void;
}

export class AgentProfileStore implements IAgentProfileStore {
  // observables
  profiles: Record<string, TAgentProfile> | null = null;
  apiToken: string | null = null;

  // services
  private agentService: AgentService;
  // root store
  private rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      profiles: observable,
      apiToken: observable.ref,

      // fetch actions
      fetchProfiles: action,
      fetchProfileById: action,

      // CRUD actions
      createProfile: action,
      updateProfile: action,
      removeProfile: action,

      // token actions
      clearApiToken: action,

      // computed helpers
      getProfileById: action,
    });

    // services
    this.agentService = new AgentService();
    // root store
    this.rootStore = _rootStore;
  }

  /**
   * get agent profile from the object of profiles in the store using profile id
   * @param agentId
   */
  getProfileById = computedFn((agentId: string) => this.profiles?.[agentId] || null);

  /**
   * fetch all the agent profiles for a workspace
   * @param workspaceSlug
   */
  fetchProfiles = async (workspaceSlug: string) =>
    await this.agentService.listAgentProfiles(workspaceSlug).then((response) => {
      const profileObject: { [agentId: string]: TAgentProfile } = response.reduce((accumulator, currentProfile) => {
        if (currentProfile && currentProfile.id) {
          return { ...accumulator, [currentProfile.id]: currentProfile };
        }
        return accumulator;
      }, {});
      runInAction(() => {
        this.profiles = profileObject;
      });
      return response;
    });

  /**
   * fetch agent profile info from API using agent id
   * @param workspaceSlug
   * @param agentId
   */
  fetchProfileById = async (workspaceSlug: string, agentId: string) =>
    await this.agentService.getAgentProfile(workspaceSlug, agentId).then((response) => {
      runInAction(() => {
        this.profiles = {
          ...this.profiles,
          [response.id]: response,
        };
      });
      return response;
    });

  /**
   * create a new agent profile for a workspace using the data
   * @param workspaceSlug
   * @param data
   */
  createProfile = async (workspaceSlug: string, data: TCreateAgentProfilePayload) =>
    await this.agentService.createAgentProfile(workspaceSlug, data).then((response) => {
       
      const { api_token: _apiToken, ...profileData } = response;
      const _token = _apiToken ?? null;

      const _profiles = this.profiles;
      if (profileData && profileData.id && _profiles) _profiles[profileData.id] = profileData;

      runInAction(() => {
        this.apiToken = _token || null;
        this.profiles = _profiles;
      });

      return { profile: profileData, apiToken: _token };
    });

  /**
   * update an agent profile using the data
   * @param workspaceSlug
   * @param agentId
   * @param data
   */
  updateProfile = async (workspaceSlug: string, agentId: string, data: Partial<TAgentProfile>) =>
    await this.agentService.updateAgentProfile(workspaceSlug, agentId, data).then((response) => {
      let _profiles = this.profiles;
      if (agentId && _profiles && this.profiles)
        _profiles = { ..._profiles, [agentId]: { ...this.profiles[agentId], ...data } };
      runInAction(() => {
        this.profiles = _profiles;
      });
      return response;
    });

  /**
   * delete an agent profile using agent id
   * @param workspaceSlug
   * @param agentId
   */
  removeProfile = async (workspaceSlug: string, agentId: string) =>
    await this.agentService.deleteAgentProfile(workspaceSlug, agentId).then(() => {
      const _profiles = this.profiles ?? {};
      delete _profiles[agentId];
      runInAction(() => {
        this.profiles = _profiles;
      });
      return undefined;
    });

  /**
   * clear api token from the store
   */
  clearApiToken = () => {
    this.apiToken = null;
  };
}
