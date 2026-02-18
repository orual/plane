# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Tests for agent event streaming (SSE)."""

import json
import pytest
from unittest.mock import patch, MagicMock

from plane.hw.models import AgentActivityType
from plane.hw.services.agent_events import (
    emit_activity_event,
    emit_run_status_event,
    format_sse,
)
from plane.tests.factories import (
    WorkspaceFactory,
    UserFactory,
    AgentProfileFactory,
    AgentRunFactory,
    AgentRunActivityFactory,
    AgentConversationFactory,
)


pytestmark = pytest.mark.unit


class TestFormatSSE:
    """Test SSE formatting helper."""

    def test_format_sse_basic(self):
        """Test basic SSE format."""
        result = format_sse("test_event", '{"key": "value"}')
        assert result == 'event: test_event\ndata: {"key": "value"}\n\n'

    def test_format_sse_with_complex_data(self):
        """Test SSE format with complex JSON data."""
        data = json.dumps({"nested": {"key": "value"}, "list": [1, 2, 3]})
        result = format_sse("complex", data)
        expected = f'event: complex\ndata: {data}\n\n'
        assert result == expected


@pytest.mark.django_db
class TestEmitActivityEvent:
    """Test activity event emission via Redis pub/sub."""

    def setup_method(self):
        """Set up test workspace, user, and agent."""
        self.workspace = WorkspaceFactory()
        self.user = UserFactory()
        self.agent = AgentProfileFactory(workspace=self.workspace)

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_activity_event_run_only(self, mock_redis):
        """Test activity event published to run-level channel."""
        # Create run without conversation
        run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

        # Create activity
        activity = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
        )

        # Set up mock Redis
        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        # Emit event
        emit_activity_event(activity)

        # Verify publish was called on run channel
        mock_redis_client.publish.assert_called()
        call_args = mock_redis_client.publish.call_args_list

        # Should have at least one call to run channel
        run_channel_calls = [call for call in call_args if f"agent-run-{run.id}" in str(call)]
        assert len(run_channel_calls) > 0

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_activity_event_run_and_conversation(self, mock_redis):
        """Test activity event published to both run and conversation channels."""
        # Create conversation
        conversation = AgentConversationFactory(workspace=self.workspace, user=self.user)

        # Create run with conversation
        run = AgentRunFactory(
            agent=self.agent,
            workspace=self.workspace,
            conversation=conversation,
        )

        # Create activity
        activity = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
        )

        # Set up mock Redis
        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        # Emit event
        emit_activity_event(activity)

        # Verify publish was called
        mock_redis_client.publish.assert_called()
        call_args = mock_redis_client.publish.call_args_list

        # Should have calls to both channels
        run_channel_calls = [call for call in call_args if f"agent-run-{run.id}" in str(call)]
        conv_channel_calls = [call for call in call_args if f"agent-conversation-{conversation.id}" in str(call)]

        assert len(run_channel_calls) > 0
        assert len(conv_channel_calls) > 0

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_activity_event_redis_failure(self, mock_redis):
        """Test activity event handles Redis failure gracefully."""
        run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

        activity = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
        )

        # Make redis fail
        mock_redis.side_effect = Exception("Redis connection failed")

        # Should not raise exception
        emit_activity_event(activity)

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_run_status_event_run_only(self, mock_redis):
        """Test run status event publishes to run channel only (no conversation)."""
        run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        emit_run_status_event(run)

        mock_redis_client.publish.assert_called_once()
        channel, payload_str = mock_redis_client.publish.call_args[0]
        assert channel == f"agent-run-{run.id}"

        payload = json.loads(payload_str)
        assert payload["event_type"] == "run_status_changed"
        assert payload["data"]["run_id"] == str(run.id)

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_run_status_event_with_conversation(self, mock_redis):
        """Test run status event publishes to both run and conversation channels."""
        conversation = AgentConversationFactory(workspace=self.workspace, user=self.user)
        run = AgentRunFactory(
            agent=self.agent,
            workspace=self.workspace,
            conversation=conversation,
        )

        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        emit_run_status_event(run)

        call_args = mock_redis_client.publish.call_args_list
        assert len(call_args) == 2

        channels = {call[0][0] for call in call_args}
        assert f"agent-run-{run.id}" in channels
        assert f"agent-conversation-{conversation.id}" in channels

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_run_status_event_redis_failure(self, mock_redis):
        """Test run status event handles Redis failure gracefully."""
        run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

        # Make redis fail
        mock_redis.side_effect = Exception("Redis connection failed")

        # Should not raise exception
        emit_run_status_event(run)

    @patch("plane.hw.services.agent_events.redis_instance")
    def test_emit_activity_event_serialization(self, mock_redis):
        """Test activity event payload structure."""
        run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

        activity = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
        )

        # Set up mock Redis
        mock_redis_client = MagicMock()
        mock_redis.return_value = mock_redis_client

        # Emit event
        emit_activity_event(activity)

        # Verify payload structure
        call_args = mock_redis_client.publish.call_args_list
        assert len(call_args) > 0

        # Extract the payload from one of the calls
        _, payload_str = call_args[0][0]
        payload = json.loads(payload_str)

        # Verify payload structure
        assert "event_type" in payload
        assert "data" in payload
        assert payload["event_type"] == "activity_created"


@pytest.mark.django_db
class TestAgentRunEventsView:
    """Test SSE endpoint for run-level streaming."""

    def setup_method(self):
        """Set up test data."""
        self.workspace = WorkspaceFactory()
        self.user = UserFactory()
        self.agent = AgentProfileFactory(workspace=self.workspace)
        self.run = AgentRunFactory(agent=self.agent, workspace=self.workspace)

    def test_unauthenticated_request_rejected(self, client):
        """Test that unauthenticated requests are rejected."""
        url = f"/api/workspaces/{self.workspace.slug}/agent-runs/{self.run.id}/events/"
        response = client.get(url)
        # Should return 401 or 403
        assert response.status_code in (401, 403)

    def test_non_workspace_member_rejected(self, client):
        """Test that non-workspace members are rejected."""
        other_user = UserFactory()
        client.force_login(other_user)

        url = f"/api/workspaces/{self.workspace.slug}/agent-runs/{self.run.id}/events/"
        response = client.get(url)
        # Should return 403
        assert response.status_code == 403

    def test_workspace_member_gets_stream(self, client):
        """Test that workspace members get streaming response."""
        from plane.db.models import WorkspaceMember

        # Add user as workspace member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.user,
            role=20,
        )

        client.force_login(self.user)

        url = f"/api/workspaces/{self.workspace.slug}/agent-runs/{self.run.id}/events/"
        response = client.get(url)

        # Should return 200 with streaming response
        assert response.status_code == 200
        assert response.get("Content-Type") == "text/event-stream"


@pytest.mark.django_db
class TestAgentConversationEventsView:
    """Test SSE endpoint for conversation-level streaming."""

    def setup_method(self):
        """Set up test data."""
        self.workspace = WorkspaceFactory()
        self.user = UserFactory()
        self.other_user = UserFactory()
        self.conversation = AgentConversationFactory(workspace=self.workspace, user=self.user)

    def test_unauthenticated_request_rejected(self, client):
        """Test that unauthenticated requests are rejected."""
        url = f"/api/workspaces/{self.workspace.slug}/agent-conversations/{self.conversation.id}/events/"
        response = client.get(url)
        # Should return 401 or 403
        assert response.status_code in (401, 403)

    def test_non_conversation_owner_rejected(self, client):
        """Test that non-owners are rejected."""
        from plane.db.models import WorkspaceMember

        # Add other_user as workspace member but not conversation owner
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.other_user,
            role=20,
        )

        client.force_login(self.other_user)

        url = f"/api/workspaces/{self.workspace.slug}/agent-conversations/{self.conversation.id}/events/"
        response = client.get(url)
        # Should return 403
        assert response.status_code == 403

    def test_conversation_owner_gets_stream(self, client):
        """Test that conversation owner gets streaming response."""
        client.force_login(self.user)

        url = f"/api/workspaces/{self.workspace.slug}/agent-conversations/{self.conversation.id}/events/"
        response = client.get(url)

        # Should return 200 with streaming response
        assert response.status_code == 200
        assert response.get("Content-Type") == "text/event-stream"
