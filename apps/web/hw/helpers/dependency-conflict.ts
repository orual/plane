/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationMap, TIssueRelationTypes } from "@plane/types";

export type ConflictInfo = {
  predecessorIssueId: string;
  relationType: TIssueRelationTypes;
  message: string;
};

type IssueDates = {
  start_date: string | null;
  target_date: string | null;
};

/**
 * Detects whether an issue's dates violate any dependency constraints from its predecessors.
 *
 * @param issueId - the issue to check
 * @param issueDates - the issue's dates (start_date and target_date, either can be null)
 * @param relationMap - the full relation map from the store (TIssueRelationMap)
 * @param getIssueDates - lookup function for predecessor dates
 * @returns array of ConflictInfo objects describing violations, or empty array if no conflicts
 */
export function detectDependencyConflicts(
  issueId: string,
  issueDates: IssueDates,
  relationMap: TIssueRelationMap,
  getIssueDates: (id: string) => IssueDates | undefined
): Array<ConflictInfo> {
  const conflicts: Array<ConflictInfo> = [];

  // AC7.7: If the issue has no dates, return empty array (no conflicts possible)
  if (!issueDates.start_date && !issueDates.target_date) {
    return conflicts;
  }

  // Look up the issue's relations from the relationMap
  const issueRelations = relationMap[issueId];
  if (!issueRelations) {
    return conflicts;
  }

  // Helper function to compare dates (handling potential null values)
  const isDateBefore = (dateA: string | null | undefined, dateB: string | null | undefined): boolean => {
    if (!dateA || !dateB) return false;
    return dateA < dateB;
  };

  // Add one day to a date (for FS constraint checking: start_date should be >= predecessor target_date + 1 day)
  const addDays = (dateStr: string, days: number): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
  };

  // Check blocked_by relations (FS - Finish-to-Start)
  // Issue should not start before predecessor finishes
  const blockedByIds = issueRelations["blocked_by"] ?? [];
  for (const predecessorId of blockedByIds) {
    const predecessorDates = getIssueDates(predecessorId);
    if (!predecessorDates) continue;

    // If issue has start_date, check if it's before (predecessor target_date + 1 day)
    if (issueDates.start_date && predecessorDates.target_date) {
      const minStartDate = addDays(predecessorDates.target_date, 1);
      if (isDateBefore(issueDates.start_date, minStartDate)) {
        conflicts.push({
          predecessorIssueId: predecessorId,
          relationType: "blocked_by",
          message: `Start date is before ${predecessorId} finishes (blocking)`,
        });
      }
    }
  }

  // Check start_after relations (SS - Start-to-Start)
  // Issue should not start before predecessor starts
  const startAfterIds = issueRelations["start_after"] ?? [];
  for (const predecessorId of startAfterIds) {
    const predecessorDates = getIssueDates(predecessorId);
    if (!predecessorDates) continue;

    // If issue has start_date, check if it's before predecessor's start_date
    if (issueDates.start_date && predecessorDates.start_date) {
      if (isDateBefore(issueDates.start_date, predecessorDates.start_date)) {
        conflicts.push({
          predecessorIssueId: predecessorId,
          relationType: "start_after",
          message: `Start date is before ${predecessorId} starts (start after)`,
        });
      }
    }
  }

  // Check finish_after relations (FF - Finish-to-Finish)
  // Issue should not finish before predecessor finishes
  const finishAfterIds = issueRelations["finish_after"] ?? [];
  for (const predecessorId of finishAfterIds) {
    const predecessorDates = getIssueDates(predecessorId);
    if (!predecessorDates) continue;

    // If issue has target_date, check if it's before predecessor's target_date
    if (issueDates.target_date && predecessorDates.target_date) {
      if (isDateBefore(issueDates.target_date, predecessorDates.target_date)) {
        conflicts.push({
          predecessorIssueId: predecessorId,
          relationType: "finish_after",
          message: `End date is before ${predecessorId} ends (finish after)`,
        });
      }
    }
  }

  return conflicts;
}
