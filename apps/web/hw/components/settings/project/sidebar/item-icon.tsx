/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, BookCheck, FolderKanban, FolderOpen, FolderTree, Square, Tag, Timer, Users } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TProjectSettingsTabs } from "@plane/types";

export const PROJECT_SETTINGS_ICONS: Record<TProjectSettingsTabs | "issue_types", LucideIcon | React.FC<ISvgIcons>> = {
  general: FolderOpen,
  members: Users,
  features_cycles: FolderTree,
  features_modules: FolderKanban,
  features_views: BookCheck,
  features_pages: Square,
  features_intake: Tag,
  states: Tag,
  labels: Tag,
  estimates: Timer,
  automations: Tag,
  issue_types: Tag,
};