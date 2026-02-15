/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { autorun } from "mobx";
// Plane-web
import type { RootStore } from "@/plane-web/store/root.store";
import type { IBaseTimelineStore } from "@/plane-web/store/timeline/base-timeline.store";
import { BaseTimeLineStore } from "@/plane-web/store/timeline/base-timeline.store";

export interface IIssuesTimeLineStore extends IBaseTimelineStore {
  isDependencyEnabled: boolean;
}

export class IssuesTimeLineStore extends BaseTimeLineStore implements IIssuesTimeLineStore {
  constructor(_rootStore: RootStore) {
    super(_rootStore);

    autorun(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getIssueById = this.rootStore.issue.issues.getIssueById;
      // Access currentViewData so MobX tracks it as a dependency — ensures
      // block positions are recalculated when the view changes (different dayWidth).
      const _viewData = this.currentViewData;
      this.updateBlocks(getIssueById);
    });
  }
}
