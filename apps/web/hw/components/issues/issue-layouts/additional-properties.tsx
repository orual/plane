/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// store hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { IIssueDisplayProperties, TIssue } from "@plane/types";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { displayProperties, issue } = props;

  // store
  const { issueTypeStore } = useRootStore();

  // Check if issue type should be displayed
  if (!displayProperties?.issue_type || !issue.type_id) return null;

  const issueType = issueTypeStore.getIssueTypeById(issue.type_id);

  if (!issueType) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-layer-2-hover rounded-full">
      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
      <span className="text-xs font-medium text-text-color-secondary">{issueType.name}</span>
    </div>
  );
});
