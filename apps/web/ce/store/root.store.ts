/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";
import { IssueTypeStore } from "@/plane-web/store/issue-type.store";
import type { IIssueTypeStore } from "@/plane-web/store/issue-type.store";
import { IssuePropertyStore } from "@/plane-web/store/issue-property.store";
import type { IIssuePropertyStore } from "@/plane-web/store/issue-property.store";
import { AgentRunStore } from "@/plane-web/store/agent/agent-run.store";
import type { IAgentRunStore } from "@/plane-web/store/agent/agent-run.store";
import { AgentProfileStore } from "@/plane-web/store/agent/agent-profile.store";
import type { IAgentProfileStore } from "@/plane-web/store/agent/agent-profile.store";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  issueTypeStore: IIssueTypeStore;
  issuePropertyStore: IIssuePropertyStore;
  agentRunStore: IAgentRunStore;
  agentProfileStore: IAgentProfileStore;

  constructor() {
    super();

    this.timelineStore = new TimeLineStore(this);
    this.issueTypeStore = new IssueTypeStore(this);
    this.issuePropertyStore = new IssuePropertyStore(this);
    this.agentRunStore = new AgentRunStore(this);
    this.agentProfileStore = new AgentProfileStore(this);
  }
}
