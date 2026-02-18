/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { X, Plus } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// components
import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
// hooks
import { useChatSSE } from "@/plane-web/hooks/use-chat-sse";
// types
import type { TCreateMessagePayload } from "@/plane-web/types/agent";

interface IAgentChatPanelProps {
  workspaceSlug: string;
}

/**
 * AgentChatPanel: Main container for the agent chat interface.
 *
 * Features:
 * - Fixed-width right sidebar with slide-in/slide-out animation
 * - Header with title, new conversation button, and close button
 * - Message list with auto-scroll
 * - Text input with send button
 * - Real-time SSE streaming of agent activities
 */
export const AgentChatPanel = observer(function AgentChatPanel({ workspaceSlug }: IAgentChatPanelProps) {
  const { agentConversationStore } = useRootStore();

  // Set up SSE connection (always call, even if panel is closed)
  useChatSSE(workspaceSlug, agentConversationStore?.activeConversationId ?? null);

  // On mount, fetch conversations
  useEffect(() => {
    if (agentConversationStore) {
      void agentConversationStore.fetchConversations(workspaceSlug);
    }
  }, [workspaceSlug, agentConversationStore]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (agentConversationStore?.activeConversationId) {
      void agentConversationStore.fetchMessages(workspaceSlug, agentConversationStore.activeConversationId);
    }
  }, [agentConversationStore?.activeConversationId, workspaceSlug, agentConversationStore]);

  if (!agentConversationStore) return null;
  if (!agentConversationStore.isPanelOpen) return null;

  const { activeConversationId, isLoading } = agentConversationStore;

  const handleNewConversation = () => {
    void agentConversationStore.createConversation(workspaceSlug, { title: "New Conversation" });
  };

  const handleSendMessage = async (content: string): Promise<void> => {
    if (!agentConversationStore.activeConversationId) {
      // Create a conversation if none is active
      await agentConversationStore.createConversation(workspaceSlug, {
        title: "New Conversation",
      });
    }

    // Send message to active conversation
    if (agentConversationStore.activeConversationId) {
      await agentConversationStore.sendMessage(workspaceSlug, agentConversationStore.activeConversationId, {
        content,
      } as TCreateMessagePayload);
    }
  };

  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-screen w-96 bg-layer-1 border-l border-subtle",
        "flex flex-col transition-transform duration-300 ease-in-out z-40",
        agentConversationStore.isPanelOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="border-b border-subtle px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-14 font-semibold">Agent Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewConversation}
            className="p-1.5 hover:bg-layer-2 rounded transition-colors"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => agentConversationStore.closePanel()}
            className="p-1.5 hover:bg-layer-2 rounded transition-colors"
            title="Close panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Conversation selector */}
      {agentConversationStore.conversations && Object.keys(agentConversationStore.conversations).length > 0 && (
        <div className="border-b border-subtle px-4 py-2 max-h-20 overflow-y-auto">
          <div className="space-y-1">
            {Object.values(agentConversationStore.conversations).map((conv) => (
              <button
                key={conv.id}
                onClick={() => agentConversationStore.setActiveConversation(conv.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded text-13 truncate transition-colors",
                  activeConversationId === conv.id
                    ? "bg-accent-subtle text-accent-primary"
                    : "hover:bg-layer-2 text-secondary"
                )}
              >
                {conv.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message list */}
      {activeConversationId ? (
        <ChatMessageList workspaceSlug={workspaceSlug} conversationId={activeConversationId} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-13 text-tertiary text-center px-4">Start a new conversation to chat with the agent</p>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSendMessage} disabled={isLoading} placeholder="Send a message..." />
    </div>
  );
});
