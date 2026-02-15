/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssuePropertyDefinition } from "./issue-property-definitions";

/**
 * A property value associated with a specific issue.
 * Matches backend IssuePropertyValueSerializer output.
 */
export type IIssuePropertyValue = {
  id: string;
  issue_id: string;
  property_definition_id: string;
  value: { value: string | number | boolean | string[] | null };
  workspace_id: string;
  created_at: string;
  updated_at: string;
};

/**
 * Detail view including nested property definition.
 * Matches backend IssuePropertyValueDetailSerializer output.
 */
export type IIssuePropertyValueDetail = IIssuePropertyValue & {
  property_definition_detail: IIssuePropertyDefinition;
};

/**
 * Bulk upsert request payload item.
 * PUT /api/workspaces/{slug}/projects/{id}/issues/{issue_id}/property-values/bulk-upsert/
 */
export type IIssuePropertyValueUpsertItem = {
  property_definition_id: string;
  value: { value: string | number | boolean | string[] | null };
};

/**
 * Combined view: definition + current value for an issue.
 * Used in UI components to render fields with their current state.
 */
export type IIssuePropertyWithValue = {
  definition: IIssuePropertyDefinition;
  value: IIssuePropertyValue | null;
  currentValue: string | number | boolean | string[] | null;
};
