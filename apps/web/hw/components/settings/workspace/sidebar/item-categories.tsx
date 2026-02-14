/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { useParams } from "react-router";
// plane imports
import {
  EUserPermissionsLevel,
  GROUPED_WORKSPACE_SETTINGS,
  WORKSPACE_SETTINGS_CATEGORIES,
  WORKSPACE_SETTINGS_CATEGORY,
} from "@plane/constants";
import { EUserWorkspaceRoles } from "@plane/types";
import type { TWorkspaceSettingsItem } from "@plane/types";
import { useTranslation } from "@plane/i18n";
// components
import { SettingsSidebarItem } from "@/components/settings/sidebar/item";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";

// Extended workspace settings with issue types
const EXTENDED_GROUPED_WORKSPACE_SETTINGS: Record<WORKSPACE_SETTINGS_CATEGORY, TWorkspaceSettingsItem[]> = {
  ...GROUPED_WORKSPACE_SETTINGS,
  [WORKSPACE_SETTINGS_CATEGORY.FEATURES]: [
    ...(GROUPED_WORKSPACE_SETTINGS[WORKSPACE_SETTINGS_CATEGORY.FEATURES] || []),
    {
      key: "export",
      i18n_label: "workspace_settings.settings.issue_types.title",
      href: "/settings/issue-types",
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
      highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/issue-types/`,
    },
  ],
};

export const WorkspaceSettingsSidebarItemCategories = observer(function WorkspaceSettingsSidebarItemCategories() {
  // params
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  // store hooks
  const { allowPermissions } = useUserPermissions();
  // translation
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-col divide-y divide-subtle px-3">
      {WORKSPACE_SETTINGS_CATEGORIES.map((category) => {
        const categoryItems = EXTENDED_GROUPED_WORKSPACE_SETTINGS[category];
        const accessibleItems = categoryItems.filter((item) =>
          allowPermissions(item.access, EUserPermissionsLevel.WORKSPACE, workspaceSlug)
        );

        if (accessibleItems.length === 0) return null;

        return (
          <div key={category} className="shrink-0 py-3 first:pt-0 last:pb-0">
            <div className="p-2 text-caption-md-medium text-tertiary capitalize">{t(category)}</div>
            <div className="flex flex-col">
              {accessibleItems.map((item) => {
                const isItemActive =
                  item.href === "/settings"
                    ? pathname === `/${workspaceSlug}${item.href}/`
                    : new RegExp(`^/${workspaceSlug}${item.href}/`).test(pathname);

                return (
                  <SettingsSidebarItem
                    key={item.key}
                    as="link"
                    href={`/${workspaceSlug}${item.href}`}
                    label={item.i18n_label}
                    icon={WORKSPACE_SETTINGS_ICONS[item.key]}
                    isActive={isItemActive}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});
