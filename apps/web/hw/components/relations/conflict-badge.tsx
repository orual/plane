/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { AlertTriangle } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueRelationTypes } from "@plane/types";
// helpers
import { detectDependencyConflicts } from "@/plane-web/helpers/dependency-conflict";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { EIssueServiceType } from "@plane/types";

type ConflictBadgeProps = {
  issueId: string;
  relationIssueId: string;
  relationType: TIssueRelationTypes;
};

export const ConflictBadge = observer(function ConflictBadge(props: ConflictBadgeProps) {
  const { issueId, relationIssueId, relationType } = props;

  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail(EIssueServiceType.ISSUES);

  // Get dates for both issues
  const mainIssue = getIssueById(issueId);
  const relationIssue = getIssueById(relationIssueId);

  if (!mainIssue || !relationIssue) {
    return null;
  }

  // Check if this specific relation has a conflict
  const issueDates = {
    start_date: mainIssue.start_date ?? null,
    target_date: mainIssue.target_date ?? null,
  };

  // Get relation map - build it for this specific relation
  const relationMap: Record<string, Record<TIssueRelationTypes, Array<string>>> = {
    [issueId]: {
      blocked_by: relationType === "blocked_by" ? [relationIssueId] : [],
      start_after: relationType === "start_after" ? [relationIssueId] : [],
      finish_after: relationType === "finish_after" ? [relationIssueId] : [],
      blocking: [],
      start_before: [],
      finish_before: [],
      implements: [],
      implemented_by: [],
      relates_to: [],
      duplicate: [],
    },
  };

  const getIssueDates = (id: string) => {
    if (id === relationIssueId) {
      return {
        start_date: relationIssue.start_date ?? null,
        target_date: relationIssue.target_date ?? null,
      };
    }
    return undefined;
  };

  const conflicts = detectDependencyConflicts(issueId, issueDates, relationMap, getIssueDates);

  // If no conflict for this specific relation, render nothing
  if (conflicts.length === 0) {
    return null;
  }

  // Build tooltip content
  const tooltipContent = conflicts.map((conflict) => conflict.message).join("; ");

  return (
    <Tooltip tooltipContent={tooltipContent}>
      <div className="flex-shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-500" strokeWidth={2} />
      </div>
    </Tooltip>
  );
});
