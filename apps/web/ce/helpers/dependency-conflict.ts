/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationTypes } from "@plane/types";

/**
 * CE stub: ConflictInfo type matching the HW version.
 * Exported for type safety but conflict detection is HW-only.
 */
export type ConflictInfo = {
  predecessorIssueId: string;
  relationType: TIssueRelationTypes;
  message: string;
};
