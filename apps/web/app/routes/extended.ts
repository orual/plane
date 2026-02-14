/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

export const extendedRoutes: RouteConfigEntry[] = [
  // HW Settings routes - merged into the core settings layout hierarchy
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        // Workspace issue types settings (under workspace settings layout)
        layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
          route(
            ":workspaceSlug/settings/issue-types",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/issue-types/page.tsx"
          ),
        ]),
        // Project issue types settings (under project settings layout)
        layout("./(all)/[workspaceSlug]/(settings)/settings/projects/layout.tsx", [
          layout("./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx", [
            route(
              ":workspaceSlug/settings/projects/:projectId/issue-types",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/issue-types/page.tsx"
            ),
          ]),
        ]),
      ]),
    ]),
  ]),
];
