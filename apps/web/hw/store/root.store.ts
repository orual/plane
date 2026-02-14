/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";
import { IssueTypeStore  } from "@/plane-web/store/issue-type.store";
import type {IIssueTypeStore} from "@/plane-web/store/issue-type.store";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  issueTypeStore: IIssueTypeStore;

  constructor() {
    super();

    this.timelineStore = new TimeLineStore(this);
    this.issueTypeStore = new IssueTypeStore(this);
  }
}
