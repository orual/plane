/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// components
import { MarkdownRenderer } from "@/components/ui/markdown-to-component";
import { ElicitationCard } from "@/plane-web/components/issues/agent/elicitation-card";
import {
  ThoughtRenderer,
  ActionRenderer,
  ErrorRenderer,
  ResponseRenderer,
} from "@/plane-web/components/issues/agent/activity-renderers";
// types
import type { TAgentConversationMessage, TAgentRunActivity } from "@/plane-web/types/agent";

interface TChatMessageListProps {
  workspaceSlug: string;
  conversationId: string;
}

/**
 * ChatMessageList: Renders the conversation message history with support for:
 * - User messages (right-aligned)
 * - Agent responses and activities (left-aligned)
 * - Elicitation prompts
 * - Auto-scroll to bottom on new messages
 */
export const ChatMessageList = observer(function ChatMessageList({ workspaceSlug }: TChatMessageListProps) {
  const { agentConversationStore } = useRootStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentConversationStore?.activeMessages]);

  if (!agentConversationStore) return null;

  const messages = agentConversationStore.activeMessages;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-13 text-tertiary">No messages yet. Start a conversation!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message: TAgentConversationMessage) => (
            <ChatMessageBubble key={message.id} message={message} workspaceSlug={workspaceSlug} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
});

interface IChatMessageBubbleProps {
  message: TAgentConversationMessage;
  workspaceSlug: string;
}

function ChatMessageBubble({ message, workspaceSlug }: IChatMessageBubbleProps) {
  const { agentRunStore } = useRootStore();

  const isUserMessage = message.role === "user";

  // Try to deserialize as activity if run_id exists
  let activity: TAgentRunActivity | null = null;
  if (message.run_id && agentRunStore) {
    // Attempt to get activity from store
    const activities = agentRunStore.getActivitiesByRunId(message.run_id);
    const activityFromId = activities.find((a: TAgentRunActivity) => a.id === message.id);
    if (activityFromId) {
      activity = activityFromId;
    }
  }

  if (isUserMessage) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-blue-500 px-3 py-2 text-white">
          <p className="text-13">{message.content}</p>
        </div>
      </div>
    );
  }

  // Agent message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {activity ? (
          // Render activity-based content
          <>
            <div className="text-12 text-caption-sm-bold pb-2">Brigid</div>
            {activity.activity_type === "thought" && <ThoughtRenderer activity={activity} />}
            {activity.activity_type === "action" && <ActionRenderer activity={activity} />}
            {activity.activity_type === "error" && <ErrorRenderer activity={activity} />}
            {activity.activity_type === "response" && <ResponseRenderer activity={activity} />}
            {activity.activity_type === "elicitation" && agentRunStore && (
              <ElicitationCard
                activity={activity}
                onSubmit={(response) =>
                  agentRunStore.postElicitationResponse(workspaceSlug, message.run_id || "", response)
                }
              />
            )}
          </>
        ) : (
          // Fallback: render as markdown
          // TODO: render the agent's name, if it's not the built-in one
          <div className="text-13 text-secondary">
            <div className="text-12 text-caption-sm-bold pb-2">Brigid</div>
            <div className="pl-2 text-13 text-secondary">
              <MarkdownRenderer markdown={message.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
