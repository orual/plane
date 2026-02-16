/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Tooltip } from "@plane/propel/tooltip";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  issueId: string;
  side: "left" | "right";
  top: number;
};

export const PhantomAnchor = observer(function PhantomAnchor({ issueId, side, top }: Props) {
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProjectIdentifierById } = useProject();

  const issue = getIssueById(issueId);
  if (!issue) return null;

  const projectIdentifier = getProjectIdentifierById(issue.project_id);
  const tooltipContent = `${projectIdentifier}-${issue.sequence_id}: ${issue.name}\n${issue.start_date ?? "No start"} → ${issue.target_date ?? "No end"}`;

  return (
    <Tooltip tooltipContent={tooltipContent}>
      <div
        className="absolute flex items-center justify-center w-4 h-4 rounded-full bg-custom-primary-100/20 border border-custom-primary-100/50 cursor-help z-10"
        style={{
          [side]: 4,
          top: top + 14,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-custom-primary-100" />
      </div>
    </Tooltip>
  );
});
