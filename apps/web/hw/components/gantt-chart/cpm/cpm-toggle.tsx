/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

export const CpmToggle = observer(function CpmToggle() {
  const { workspaceSlug } = useParams();
  const timelineStore = useTimeLineChartStore();
  const isActive = timelineStore.cpmEnabled;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
          isActive ? "bg-red-500/10 text-red-600" : "text-custom-text-300 hover:bg-custom-background-80"
        }`}
        onClick={() => timelineStore.setCpmEnabled(!isActive)}
      >
        <span className={`h-2 w-2 rounded-full ${isActive ? "bg-red-500" : "bg-custom-text-400"}`} />
        Critical path
      </button>
      {isActive && (
        <label className="flex items-center gap-1.5 text-xs text-custom-text-300 cursor-pointer pl-2">
          <input
            type="checkbox"
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
