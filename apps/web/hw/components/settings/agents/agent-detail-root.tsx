/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type AgentDetailRootProps = {
  workspaceSlug: string;
  agentId: string;
};

export function AgentDetailRoot(_props: AgentDetailRootProps) {
  return <div>Agent Detail Root Component</div>;
}
