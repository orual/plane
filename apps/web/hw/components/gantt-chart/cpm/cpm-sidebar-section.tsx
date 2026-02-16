/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CPM sidebar section — read-only scheduling data in the peek overview properties panel.
 *
 * Shows ES/EF/LS/LF and total float when CPM is enabled. For critical-path
 * issues, shows a red "On critical path" badge instead of individual dates.
 * Returns null when CPM is off or when the issue has no CPM result.
 *
 * Because the peek overview renders via portal (outside TimeLineTypeContext),
 * this component checks all timeline stores directly rather than relying on
 * the context to pick the right one.
 */

import { useContext } from "react";
import { observer } from "mobx-react";
import { StoreContext } from "@/lib/store-context";
import type { IBaseTimelineStore } from "@/plane-web/store/timeline/base-timeline.store";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";

type Props = {
  issueId: string;
};

type CpmLookup = {
  result: CpmResult | undefined;
  isComputedDate: boolean;
};

function findCpmInfo(stores: IBaseTimelineStore[], issueId: string): CpmLookup {
  let result: CpmResult | undefined;
  let isComputedDate = false;

  for (const store of stores) {
    if (!result && store.cpmEnabled) {
      result = store.cpmResults.get(issueId);
    }
    if (!isComputedDate && store.blocksMap[issueId]?.dateSource === "computed") {
      isComputedDate = true;
    }
  }

  return { result, isComputedDate };
}

function CpmPropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex shrink-0 items-center w-30 text-body-xs-regular text-tertiary h-7.5">
        <span>{label}</span>
      </div>
      <div className="grow flex items-center h-7.5">
        <span className="text-body-xs-medium">{value}</span>
      </div>
    </div>
  );
}

export const CpmSidebarSection = observer(function CpmSidebarSection({ issueId }: Props) {
  const storeContext = useContext(StoreContext);
  if (!storeContext) return null;

  const { timelineStore } = storeContext;
  const stores = [
    timelineStore.issuesTimeLineStore,
    timelineStore.modulesTimeLineStore,
    timelineStore.projectTimeLineStore,
    timelineStore.groupedTimeLineStore,
  ] as IBaseTimelineStore[];

  const { result: cpmResult, isComputedDate } = findCpmInfo(stores, issueId);
  if (!cpmResult) return null;

  return (
    <div className="border-t border-subtle pt-3 mt-3">
      <h6 className="text-body-xs-medium">Schedule analysis</h6>
      {isComputedDate && (
        <p className="text-body-xs-regular text-tertiary mt-1">Dates derived from dependencies</p>
      )}
      <div className="w-full space-y-3 mt-3">
        {cpmResult.isCritical ? (
          <div className="flex items-center gap-2 h-7.5">
            <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-body-xs-medium text-red-500">On critical path — zero slack</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <CpmPropertyRow label="Early start" value={cpmResult.es} />
              <CpmPropertyRow label="Early finish" value={cpmResult.ef} />
              <CpmPropertyRow label="Late start" value={cpmResult.ls} />
              <CpmPropertyRow label="Late finish" value={cpmResult.lf} />
            </div>
            <CpmPropertyRow label="Total float" value={`${cpmResult.slack.toFixed(1)} days`} />
          </>
        )}
      </div>
    </div>
  );
});
