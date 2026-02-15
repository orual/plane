/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useWorkspacePropertyDefinitions } from "./use-issue-properties";
import type { IIssuePropertyWithValue } from "../types";

/**
 * Extended hook that combines property definitions with placeholder values.
 * Used in workspace-level views to show available custom properties.
 */
export const useWorkspaceIssuePropertiesExtended = (
  workspaceSlug: string | string[] | undefined
): {
  properties: IIssuePropertyWithValue[];
  isLoading: boolean;
  error: string | null;
} => {
  const slug = typeof workspaceSlug === "string" ? workspaceSlug : undefined;
  const { definitions, isLoading, error } = useWorkspacePropertyDefinitions(slug);

  const properties = useMemo<IIssuePropertyWithValue[]>(
    () =>
      definitions.map((def) => ({
        definition: def,
        value: null,
        currentValue: null,
      })),
    [definitions]
  );

  return { properties, isLoading, error };
};
