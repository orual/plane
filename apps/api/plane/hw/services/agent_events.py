# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""SSE event emission for agent runs and activities.

This module handles publishing events to Redis pub/sub channels that clients
can subscribe to via SSE endpoints. Events are published on two channel types:
- Run-level: agent-run-{run_id} — activities for a specific run
- Conversation-level: agent-conversation-{conversation_id} — activities across
  all runs in a conversation.

SSE failures (Redis unavailable, publish fails) must never break execution.
"""

import json
import logging
import uuid

from plane.hw.models import AgentRunActivity, AgentRun
from plane.hw.serializers import AgentRunActivitySerializer
from plane.settings.redis import redis_instance


logger = logging.getLogger("plane.worker")


class _UUIDEncoder(json.JSONEncoder):
    """JSON encoder that converts UUID objects to strings."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return super().default(obj)


def format_sse(event_type: str, data: str) -> str:
    """Format a message as server-sent event (SSE).

    Args:
        event_type: Event type name (e.g. "activity_created")
        data: JSON-serialized event data

    Returns:
        SSE-formatted message with event: and data: lines
    """
    return f"event: {event_type}\ndata: {data}\n\n"


def emit_activity_event(activity: AgentRunActivity) -> None:
    """Emit SSE event for a created activity on the appropriate channels.

    Publishes to:
    - Run-level channel: agent-run-{run_id}
    - Conversation-level channel (if applicable): agent-conversation-{conversation_id}

    Serialization uses AgentRunActivitySerializer to ensure consistent format
    with API responses.

    On Redis failure, logs and continues — SSE failures must never break
    execution of the main flow.

    Args:
        activity: The AgentRunActivity that was created
    """
    try:
        # Serialize activity using the standard serializer
        serializer = AgentRunActivitySerializer(activity)
        activity_data = serializer.data

        # Prepare event payload
        event_payload = {
            "event_type": "activity_created",
            "data": activity_data,
        }
        payload_json = json.dumps(event_payload, cls=_UUIDEncoder)

        # Get Redis instance
        r = redis_instance()
        if not r:
            logger.warning("Redis not configured, skipping activity event emission")
            return

        # Publish to run-level channel
        run_channel = f"agent-run-{activity.run_id}"
        r.publish(run_channel, payload_json)

        # Publish to conversation-level channel if applicable
        if activity.run.conversation_id:
            conversation_channel = f"agent-conversation-{activity.run.conversation_id}"
            r.publish(conversation_channel, payload_json)

    except Exception as e:
        logger.exception(f"Failed to emit activity event for activity {activity.id}: {e}")


def emit_run_status_event(run: AgentRun) -> None:
    """Emit SSE event when a run's status changes.

    Published on the run-level channel: agent-run-{run_id}

    On Redis failure, logs and continues — SSE failures must never break
    execution of the main flow.

    Args:
        run: The AgentRun whose status changed
    """
    try:
        event_payload = {
            "event_type": "run_status_changed",
            "data": {
                "run_id": str(run.id),
                "status": run.status,
                "updated_at": run.updated_at.isoformat() if run.updated_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            },
        }
        payload_json = json.dumps(event_payload, cls=_UUIDEncoder)

        r = redis_instance()
        if not r:
            logger.warning("Redis not configured, skipping run status event emission")
            return

        # Publish to run-level channel
        run_channel = f"agent-run-{run.id}"
        r.publish(run_channel, payload_json)

        # Publish to conversation-level channel if applicable
        if run.conversation_id:
            conversation_channel = f"agent-conversation-{run.conversation_id}"
            r.publish(conversation_channel, payload_json)

    except Exception as e:
        logger.exception(f"Failed to emit run status event for run {run.id}: {e}")
