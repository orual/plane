/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Supported property types for custom properties.
 */
export type TPropertyType = "text" | "number" | "select" | "multi_select" | "url" | "date" | "boolean";

/**
 * A custom property definition for a workspace.
 * Matches backend PropertyDefinitionSerializer output.
 */
export type IIssuePropertyDefinition = {
  id: string;
  workspace_id: string;
  issue_type_id: string | null;
  name: string;
  property_type: TPropertyType;
  options: string[];
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
