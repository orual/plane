/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, Building, CreditCard, LayoutList, Users, Webhook } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

type WorkspaceSettingsIconKey = TWorkspaceSettingsTabs | "workspace_issue_types";

export const WORKSPACE_SETTINGS_ICONS: Record<WorkspaceSettingsIconKey, LucideIcon | React.FC<ISvgIcons>> = {
  general: Building,
  members: Users,
  export: ArrowUpToLine,
  "billing-and-plans": CreditCard,
  webhooks: Webhook,
  workspace_issue_types: LayoutList,
};
