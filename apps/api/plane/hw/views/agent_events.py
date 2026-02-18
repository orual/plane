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
from django.http import StreamingHttpResponse
from django.views import View
from django.utils.decorators import method_decorator

from plane.authentication.decorators import auth_required
from plane.db.models import WorkspaceMember
from plane.hw.models import AgentRun, AgentConversation


logger = logging.getLogger("plane.worker")


def format_sse(event_type: str, data: str) -> str:
    """Format a message as server-sent event (SSE).

    Args:
        event_type: Event type name (e.g. "activity_created")
        data: JSON-serialized event data

    Returns:
        SSE-formatted message with event: and data: lines
    """
    return f"event: {event_type}\ndata: {data}\n\n"


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
        # Create async Redis connection
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

        # Listen for messages on the channel
        async for message in pubsub.listen():
            if message["type"] == "message":
                # Message data is already the JSON payload from emit_*_event
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

    @method_decorator(auth_required)
    def get(self, request, slug, run_id):
        """Stream agent run events via SSE.

        Args:
            request: HTTP request
            slug: Workspace slug
            run_id: AgentRun UUID

        Returns:
            StreamingHttpResponse with text/event-stream content type
        """
        try:
            # Verify run exists and belongs to workspace
            run = AgentRun.objects.select_related("workspace").get(
                id=run_id,
                workspace__slug=slug,
            )
        except AgentRun.DoesNotExist:
            return StreamingHttpResponse(
                [format_sse("error", json.dumps({"message": "Run not found"}))],
                content_type="text/event-stream",
                status=404,
            )

        # Verify user is a workspace member
        if not WorkspaceMember.objects.filter(
            workspace=run.workspace,
            member=request.user,
        ).exists():
            return StreamingHttpResponse(
                [format_sse("error", json.dumps({"message": "Forbidden"}))],
                content_type="text/event-stream",
                status=403,
            )

        # Create the async event generator
        async def event_generator():
            channel_name = f"agent-run-{run_id}"
            async for event in _redis_subscriber(channel_name):
                yield event.encode("utf-8")

        # Return streaming response
        return StreamingHttpResponse(
            event_generator(),
            content_type="text/event-stream",
            status=200,
        )


class AgentConversationEventsView(View):
    """SSE endpoint for conversation-level event streaming.

    URL: /workspaces/{slug}/agent-conversations/{conversation_id}/events/

    Auth: User must be authenticated. The conversation must be owned by
    the user (created_by == user) and must exist in the workspace.

    Streaming: Subscribes to Redis channel agent-conversation-{conversation_id}
    and streams all activities from all runs within that conversation.
    """

    @method_decorator(auth_required)
    def get(self, request, slug, conversation_id):
        """Stream conversation events via SSE.

        Args:
            request: HTTP request
            slug: Workspace slug
            conversation_id: AgentConversation UUID

        Returns:
            StreamingHttpResponse with text/event-stream content type
        """
        try:
            # Verify conversation exists and belongs to workspace
            conversation = AgentConversation.objects.select_related("workspace").get(
                id=conversation_id,
                workspace__slug=slug,
            )
        except AgentConversation.DoesNotExist:
            return StreamingHttpResponse(
                [format_sse("error", json.dumps({"message": "Conversation not found"}))],
                content_type="text/event-stream",
                status=404,
            )

        # Verify user owns the conversation
        if conversation.user_id != request.user.id:
            return StreamingHttpResponse(
                [format_sse("error", json.dumps({"message": "Forbidden"}))],
                content_type="text/event-stream",
                status=403,
            )

        # Create the async event generator
        async def event_generator():
            channel_name = f"agent-conversation-{conversation_id}"
            async for event in _redis_subscriber(channel_name):
                yield event.encode("utf-8")

        # Return streaming response
        return StreamingHttpResponse(
            event_generator(),
            content_type="text/event-stream",
            status=200,
        )
