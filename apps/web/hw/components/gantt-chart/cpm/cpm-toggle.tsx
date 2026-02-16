/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ToggleSwitch } from "@plane/ui";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

export const CpmToggle = observer(function CpmToggle() {
  const { workspaceSlug } = useParams();
  const timelineStore = useTimeLineChartStore();
  const isActive = timelineStore.cpmEnabled;

  return (
    <div className="flex items-center gap-2">
      <div
        data-test="cpm-toggle"
        className="flex items-center gap-1.5 text-11 text-custom-text-300"
      >
        <ToggleSwitch
          value={isActive}
          onChange={(value) => timelineStore.setCpmEnabled(value)}
          size="sm"
        />
        <button type="button" className="cursor-pointer" onClick={() => timelineStore.setCpmEnabled(!isActive)}>
          Critical path
        </button>
      </div>
      {isActive && (
        <label className="flex cursor-pointer items-center gap-1.5 text-11 text-custom-text-300">
          <input
            type="checkbox"
            data-test="cpm-cross-project-toggle"
            checked={timelineStore.crossProjectCpmEnabled}
            onChange={(e) => {
              timelineStore.setCrossProjectCpmEnabled(e.target.checked);
              if (e.target.checked) {
                void timelineStore.fetchCrossProjectRelations(workspaceSlug);
              }
            }}
            className="h-3 w-3"
          />
          Cross-project
        </label>
      )}
    </div>
  );
});
