/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { useContext, useEffect, useMemo } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IIssuePropertyStore } from "../store/issue-property.store";
import type { IIssuePropertyValueDetail, IIssuePropertyValueUpsertItem } from "../types";

/**
 * Hook to access the IssuePropertyStore from the root store.
 */
export const useIssueProperties = (): IIssuePropertyStore => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useIssueProperties must be used within StoreProvider");
  }
  return (context as any).issuePropertyStore;
};

/**
 * Hook to fetch and access property definitions for a workspace.
 * Triggers fetch on mount if definitions aren't loaded.
 */
export const useWorkspacePropertyDefinitions = (workspaceSlug: string | undefined) => {
  const store = useIssueProperties();

  useEffect(() => {
    if (workspaceSlug && store.definitionsMap.size === 0) {
      void store.fetchDefinitions(workspaceSlug);
    }
  }, [workspaceSlug, store]);

  return useMemo(
    () => ({
      definitions: store.getAllDefinitions(),
      isLoading: store.isLoading,
      error: store.error,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.isLoading, store.error, store.definitionsMap.size]
  );
};

/**
 * Hook to fetch and access property values for a specific issue.
 * Triggers fetch on mount if values aren't loaded.
 */
export const useIssuePropertyValues = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined
) => {
  const store = useIssueProperties();

  useEffect(() => {
    if (workspaceSlug && projectId && issueId) {
      if (!store.valuesMap.has(issueId)) {
        void store.fetchIssueValues(workspaceSlug, projectId, issueId);
      }
    }
  }, [workspaceSlug, projectId, issueId, store]);

  const upsertValues = useMemo(
    () => (items: IIssuePropertyValueUpsertItem[]) => {
      if (workspaceSlug && projectId && issueId) {
        return store.upsertIssueValues(workspaceSlug, projectId, issueId, items);
      }
      return Promise.resolve();
    },
    [workspaceSlug, projectId, issueId, store]
  );

  return useMemo(
    () => ({
      values: issueId ? store.getIssueValues(issueId) : ([] as IIssuePropertyValueDetail[]),
      isLoading: store.isLoading,
      error: store.error,
      upsertValues,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issueId, store.isLoading, store.error, store.valuesMap.size, upsertValues]
  );
};
