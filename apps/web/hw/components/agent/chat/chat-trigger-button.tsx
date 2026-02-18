/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Bot } from "lucide-react";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";

/**
 * ChatTriggerButton: Floating action button to open/close the agent chat panel.
 *
 * Positioned in the bottom-right corner of the workspace. Toggles `isPanelOpen`
 * on the conversation store.
 */
export const ChatTriggerButton = observer(function ChatTriggerButton() {
  const { agentConversationStore } = useRootStore();

  if (!agentConversationStore) return null;

  return (
    <button
      onClick={() => agentConversationStore.togglePanel()}
      className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-accent-primary text-white hover:bg-accent-primary/90 shadow-lg transition-all duration-200"
      title="Open agent chat"
    >
      <Bot size={20} />
    </button>
  );
});
