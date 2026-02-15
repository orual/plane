/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TIssueTypeLogoProps = {
  color: string;
};

export type TIssueType = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  logo_props: TIssueTypeLogoProps;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  external_source?: string | null;
  external_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type TProjectIssueType = {
  id: string;
  project_id: string;
  workspace_id: string;
  issue_type_id: string;
  issue_type_detail?: TIssueType;
  level: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type TIssueTypeListResponse = TIssueType[];

export type TProjectIssueTypeListResponse = TProjectIssueType[];

export * from "./issue-property-values.d";
