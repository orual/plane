/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationTypes } from "@plane/types";

type ConflictBadgeProps = {
  issueId: string;
  relationIssueId: string;
  relationType: TIssueRelationTypes;
};

export function ConflictBadge(_props: ConflictBadgeProps) {
  return null;
}
