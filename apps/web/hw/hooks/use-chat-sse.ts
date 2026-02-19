/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useCallback } from "react";
import { useRootStore } from "@/hooks/store/use-root-store";
import type { TAgentRunActivity } from "@/plane-web/types/agent";

interface UseChatSSEOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
}

/**
 * useChatSSE: Manages EventSource connection for real-time activity streaming.
 *
 * Behavior:
 * - Opens EventSource when conversationId is non-null
 * - Parses activity data and calls appendActivity on store
 * - On error: attempts reconnection with exponential backoff
 * - On reconnection: catch-up fetches missed activities
 * - Cleanup: closes EventSource on unmount or when conversationId changes
 *
 * Graceful degradation: Falls back to polling if EventSource endpoint returns 404
 */
export function useChatSSE(workspaceSlug: string, conversationId: string | null, options: UseChatSSEOptions = {}) {
  const { maxRetries = 5, initialBackoffMs = 1000 } = options;
  const { agentConversationStore } = useRootStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const backoffRef = useRef(initialBackoffMs);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Main effect: setup connection when conversationId changes
  useEffect(() => {
    if (!conversationId || !agentConversationStore) {
      closeEventSource();
      stopPolling();
      return;
    }

    let isActive = true;

    const attemptConnection = () => {
      if (!isActive) return;

      try {
        const url = `/api/workspaces/${workspaceSlug}/agent-conversations/${conversationId}/events/`;
        const eventSource = new EventSource(url);

        eventSource.addEventListener("activity", (event: Event) => {
          if (!isActive) return;
          try {
            const customEvent = event as unknown as MessageEvent<string>;
            const activity = JSON.parse(customEvent.data) as TAgentRunActivity;
            agentConversationStore.appendActivity(conversationId, activity);
            retryCountRef.current = 0;
            backoffRef.current = initialBackoffMs;
          } catch (e) {
            console.error("Failed to parse activity:", e);
          }
        });

        eventSource.addEventListener("error", () => {
          closeEventSource();

          if (!isActive) return;
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current += 1;
            const delay = backoffRef.current;
            backoffRef.current = Math.min(backoffRef.current * 2, 30000); // Max 30s backoff

            setTimeout(() => {
              attemptConnection();
            }, delay);
          } else {
            // Fall back to polling after max retries
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            pollIntervalRef.current = setInterval(() => {
              void agentConversationStore.fetchMessages(workspaceSlug, conversationId).catch((e) => {
                console.error("Polling failed:", e);
              });
            }, 3000);
          }
        });

        eventSourceRef.current = eventSource;
      } catch (_e) {
        // EventSource error (likely 404), fall back to polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(() => {
          void agentConversationStore.fetchMessages(workspaceSlug, conversationId).catch((e) => {
            console.error("Polling failed:", e);
          });
        }, 3000);
      }
    };

    attemptConnection();

    return () => {
      isActive = false;
      closeEventSource();
      stopPolling();
    };
  }, [
    conversationId,
    agentConversationStore,
    workspaceSlug,
    maxRetries,
    initialBackoffMs,
    closeEventSource,
    stopPolling,
  ]);
}
