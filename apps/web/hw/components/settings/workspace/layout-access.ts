/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// HW version: Extends workspace settings access with issue types route
import { WORKSPACE_SETTINGS_ACCESS as BASE_WORKSPACE_SETTINGS_ACCESS } from "@plane/constants";
import { EUserWorkspaceRoles } from "@plane/types";

export const EXTENDED_WORKSPACE_SETTINGS_ACCESS: Record<string, EUserWorkspaceRoles[]> = {
  ...BASE_WORKSPACE_SETTINGS_ACCESS,
  "/settings/issue-types": [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
};

// Re-export with the same name for drop-in compatibility
export { EXTENDED_WORKSPACE_SETTINGS_ACCESS as WORKSPACE_SETTINGS_ACCESS };
