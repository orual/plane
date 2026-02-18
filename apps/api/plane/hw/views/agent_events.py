# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""SSE streaming views for agent runs and conversations.

These views provide real-time event streaming for agent run activities
and conversation-scoped messaging using Server-Sent Events (SSE) via
Redis pub/sub.
"""

import json
import logging
from typing import AsyncGenerator

import redis.asyncio
from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.views import View

from plane.db.models import WorkspaceMember
from plane.hw.models import AgentConversation, AgentRun
from plane.hw.services.agent_events import format_sse


logger = logging.getLogger("plane.worker")


async def _redis_subscriber(channel_name: str) -> AsyncGenerator[str, None]:
    """Subscribe to a Redis channel and yield messages as SSE events.

    Args:
        channel_name: The Redis channel to subscribe to

    Yields:
        SSE-formatted messages from the channel
    """
    r = None
    pubsub = None
    try:
        if settings.REDIS_SSL:
            r = redis.asyncio.from_url(
                settings.REDIS_URL,
                ssl_cert_reqs=None,
                decode_responses=True,
            )
        else:
            r = redis.asyncio.from_url(
                settings.REDIS_URL,
                decode_responses=True,
            )

        pubsub = r.pubsub()
        await pubsub.subscribe(channel_name)

        async for message in pubsub.listen():
            if message["type"] == "message":
                payload_str = message["data"]
                payload = json.loads(payload_str)
                yield format_sse(payload["event_type"], json.dumps(payload["data"]))

    except Exception as e:
        logger.exception(f"Error in Redis subscriber for {channel_name}: {e}")
        yield format_sse("error", json.dumps({"message": "Connection error"}))

    finally:
        if pubsub:
            await pubsub.unsubscribe(channel_name)
            await pubsub.close()
        if r:
            await r.close()


class AgentRunEventsView(View):
    """SSE endpoint for run-level event streaming.

    URL: /workspaces/{slug}/agent-runs/{run_id}/events/

    Auth: User must be authenticated and a member of the workspace.
    The run must exist in the workspace.

    Streaming: Subscribes to Redis channel agent-run-{run_id} and streams
    all activities created for that run.
    """

    def get(self, request, slug, run_id):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        try:
            run = AgentRun.objects.select_related("workspace").get(
                id=run_id,
                workspace__slug=slug,
            )
        except AgentRun.DoesNotExist:
            return JsonResponse({"error": "Run not found"}, status=404)

        if not WorkspaceMember.objects.filter(
            workspace=run.workspace,
            member=request.user,
        ).exists():
            return JsonResponse({"error": "Forbidden"}, status=403)

        async def event_generator():
            channel_name = f"agent-run-{run_id}"
            async for event in _redis_subscriber(channel_name):
                yield event.encode("utf-8")

        return StreamingHttpResponse(
            event_generator(),
            content_type="text/event-stream",
            status=200,
        )


class AgentConversationEventsView(View):
    """SSE endpoint for conversation-level event streaming.

    URL: /workspaces/{slug}/agent-conversations/{conversation_id}/events/

    Auth: User must be authenticated. The conversation must be owned by
    the user and must exist in the workspace.

    Streaming: Subscribes to Redis channel agent-conversation-{conversation_id}
    and streams all activities from all runs within that conversation.
    """

    def get(self, request, slug, conversation_id):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Authentication required"}, status=401)

        try:
            conversation = AgentConversation.objects.select_related("workspace").get(
                id=conversation_id,
                workspace__slug=slug,
            )
        except AgentConversation.DoesNotExist:
            return JsonResponse({"error": "Conversation not found"}, status=404)

        if conversation.user_id != request.user.id:
            return JsonResponse({"error": "Forbidden"}, status=403)

        async def event_generator():
            channel_name = f"agent-conversation-{conversation_id}"
            async for event in _redis_subscriber(channel_name):
                yield event.encode("utf-8")

        return StreamingHttpResponse(
            event_generator(),
            content_type="text/event-stream",
            status=200,
        )
