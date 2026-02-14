/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

type TIssueAdditionalPropertiesActivity = {
  activityId: string;
  ends: "top" | "bottom" | undefined;
};

/**
 * Activity component for custom property changes.
 * Full activity tracking will be implemented when the activity module is integrated.
 */
export const IssueAdditionalPropertiesActivity = observer(function IssueAdditionalPropertiesActivity({
  activityId,
  ends,
}: TIssueAdditionalPropertiesActivity) {
  return <div className="space-y-2" data-activity-id={activityId} data-ends={ends} />;
});
