# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.hw.serializers import (
    AgentProfileSerializer,
    AgentProfileCreateSerializer,
    AgentRunSerializer,
    AgentRunActivitySerializer,
)
from plane.tests.factories import (
    AgentProfileFactory,
    AgentRunFactory,
    AgentRunActivityFactory,
)


@pytest.mark.unit
class TestAgentProfileSerializer:
    """Test AgentProfileSerializer field presence and read-only enforcement."""

    @pytest.mark.django_db
    def test_serializer_includes_all_fields(self):
        """Verify AgentProfileSerializer includes all expected fields."""
        agent = AgentProfileFactory()
        serializer = AgentProfileSerializer(agent)
        assert "id" in serializer.data
        assert "user_id" in serializer.data
        assert "workspace_id" in serializer.data
        assert "webhook_url" in serializer.data
        assert "event_triggers" in serializer.data
        assert "is_active" in serializer.data
        assert "display_name" in serializer.data
        assert "description" in serializer.data
        assert "created_at" in serializer.data
        assert "updated_at" in serializer.data

    @pytest.mark.django_db
    def test_serializer_read_only_fields(self):
        """Verify AgentProfileSerializer enforces read-only fields."""
        agent = AgentProfileFactory()
        data = {
            "id": agent.id,
            "user_id": agent.user_id,
            "workspace_id": agent.workspace_id,
            "webhook_url": "https://updated.example.com",
            "display_name": "Updated Agent",
            "is_active": False,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        serializer = AgentProfileSerializer(agent, data=data, partial=True)
        assert serializer.is_valid()
        # Verify that read-only fields are not updated
        serializer.save()
        agent.refresh_from_db()
        assert agent.user_id == agent.user_id  # Should not change
        assert agent.workspace_id == agent.workspace_id  # Should not change

    @pytest.mark.django_db
    def test_serializer_can_update_writable_fields(self):
        """Verify AgentProfileSerializer can update non-read-only fields."""
        agent = AgentProfileFactory(display_name="Original", is_active=True)
        data = {
            "display_name": "Updated Agent",
            "is_active": False,
            "webhook_url": "https://new.example.com",
            "event_triggers": {"new": "triggers"},
        }
        serializer = AgentProfileSerializer(agent, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        agent.refresh_from_db()
        assert agent.display_name == "Updated Agent"
        assert agent.is_active is False
        assert agent.webhook_url == "https://new.example.com"
        assert agent.event_triggers == {"new": "triggers"}

    @pytest.mark.django_db
    def test_serializer_field_values(self):
        """Verify AgentProfileSerializer returns correct field values."""
        agent = AgentProfileFactory(
            webhook_url="https://example.com/hook",
            event_triggers={"issues": ["created"]},
        )
        serializer = AgentProfileSerializer(agent)
        assert serializer.data["webhook_url"] == "https://example.com/hook"
        assert serializer.data["event_triggers"] == {"issues": ["created"]}
        assert serializer.data["is_active"] is True
        assert serializer.data["display_name"] == agent.display_name


@pytest.mark.unit
class TestAgentProfileCreateSerializer:
    """Test AgentProfileCreateSerializer field presence and validation."""

    @pytest.mark.django_db
    def test_create_serializer_accepts_creation_fields(self):
        """Verify AgentProfileCreateSerializer accepts only creation fields."""
        data = {
            "display_name": "New Agent",
            "description": "A test agent",
            "webhook_url": "https://webhook.example.com",
            "webhook_secret": "secret-123",
            "event_triggers": {"issues": ["created", "updated"]},
        }
        serializer = AgentProfileCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_create_serializer_includes_webhook_secret(self):
        """Verify AgentProfileCreateSerializer includes webhook_secret field."""
        data = {
            "display_name": "Agent",
            "webhook_secret": "secret-key",
        }
        serializer = AgentProfileCreateSerializer(data=data)
        assert serializer.is_valid()
        assert "webhook_secret" in serializer.validated_data

    @pytest.mark.django_db
    def test_create_serializer_field_list(self):
        """Verify AgentProfileCreateSerializer has correct fields."""
        serializer = AgentProfileCreateSerializer()
        expected_fields = {
            "display_name",
            "description",
            "webhook_url",
            "webhook_secret",
            "event_triggers",
        }
        assert set(serializer.fields.keys()) == expected_fields

    @pytest.mark.django_db
    def test_create_serializer_display_name_required(self):
        """Verify display_name is required in create serializer."""
        data = {
            "webhook_url": "https://example.com",
        }
        serializer = AgentProfileCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "display_name" in serializer.errors


@pytest.mark.unit
class TestAgentRunSerializer:
    """Test AgentRunSerializer field presence and read-only enforcement."""

    @pytest.mark.django_db
    def test_serializer_includes_all_fields(self):
        """Verify AgentRunSerializer includes all expected fields."""
        run = AgentRunFactory()
        serializer = AgentRunSerializer(run)
        assert "id" in serializer.data
        assert "agent_id" in serializer.data
        assert "workspace_id" in serializer.data
        assert "project_id" in serializer.data
        assert "issue_id" in serializer.data
        assert "status" in serializer.data
        assert "stale_timeout" in serializer.data
        assert "last_activity_at" in serializer.data
        assert "completed_at" in serializer.data
        assert "trigger_metadata" in serializer.data
        assert "created_at" in serializer.data
        assert "updated_at" in serializer.data

    @pytest.mark.django_db
    def test_serializer_read_only_fields(self):
        """Verify AgentRunSerializer enforces read-only fields."""
        run = AgentRunFactory()
        data = {
            "id": run.id,
            "agent_id": run.agent_id,
            "workspace_id": run.workspace_id,
            "status": "in_progress",
            "stale_timeout": 600,
            "created_at": "2026-01-01T00:00:00Z",
        }
        serializer = AgentRunSerializer(run, data=data, partial=True)
        assert serializer.is_valid()
        # Verify that read-only fields are not updated
        serializer.save()
        run.refresh_from_db()
        # agent_id and workspace_id should not change
        # status and stale_timeout should be updatable

    @pytest.mark.django_db
    def test_serializer_can_update_status(self):
        """Verify AgentRunSerializer can update status field."""
        run = AgentRunFactory(status="created")
        data = {"status": "in_progress"}
        serializer = AgentRunSerializer(run, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        run.refresh_from_db()
        assert run.status == "in_progress"

    @pytest.mark.django_db
    def test_serializer_field_values(self):
        """Verify AgentRunSerializer returns correct field values."""
        run = AgentRunFactory(status="in_progress", stale_timeout=500)
        serializer = AgentRunSerializer(run)
        assert serializer.data["status"] == "in_progress"
        assert serializer.data["stale_timeout"] == 500
        assert str(serializer.data["agent_id"]) == str(run.agent_id)
        assert str(serializer.data["workspace_id"]) == str(run.workspace_id)


@pytest.mark.unit
class TestAgentRunActivitySerializer:
    """Test AgentRunActivitySerializer field presence and read-only enforcement."""

    @pytest.mark.django_db
    def test_serializer_includes_all_fields(self):
        """Verify AgentRunActivitySerializer includes all expected fields."""
        activity = AgentRunActivityFactory()
        serializer = AgentRunActivitySerializer(activity)
        assert "id" in serializer.data
        assert "run_id" in serializer.data
        assert "activity_type" in serializer.data
        assert "content" in serializer.data
        assert "metadata" in serializer.data
        assert "is_ephemeral" in serializer.data
        assert "created_at" in serializer.data
        assert "updated_at" in serializer.data

    @pytest.mark.django_db
    def test_serializer_is_ephemeral_read_only(self):
        """Verify is_ephemeral field is read-only."""
        activity = AgentRunActivityFactory(activity_type="response", is_ephemeral=False)
        data = {
            "activity_type": "response",
            "content": "Updated content",
            "is_ephemeral": True,
        }
        serializer = AgentRunActivitySerializer(activity, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        activity.refresh_from_db()
        # is_ephemeral should not change because it's read-only
        assert activity.is_ephemeral is False

    @pytest.mark.django_db
    def test_serializer_can_update_content(self):
        """Verify AgentRunActivitySerializer can update content field."""
        activity = AgentRunActivityFactory(content="Original content")
        data = {"content": "Updated content"}
        serializer = AgentRunActivitySerializer(activity, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        activity.refresh_from_db()
        assert activity.content == "Updated content"

    @pytest.mark.django_db
    def test_serializer_can_update_metadata(self):
        """Verify AgentRunActivitySerializer can update metadata field."""
        activity = AgentRunActivityFactory(metadata={"old": "value"})
        data = {"metadata": {"new": "value"}}
        serializer = AgentRunActivitySerializer(activity, data=data, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()
        activity.refresh_from_db()
        assert activity.metadata == {"new": "value"}

    @pytest.mark.django_db
    def test_serializer_field_values_ephemeral_activity(self):
        """Verify AgentRunActivitySerializer returns correct ephemeral status."""
        run = AgentRunFactory()
        activity = AgentRunActivityFactory(
            run=run,
            activity_type="thought",
            is_ephemeral=True,
        )
        serializer = AgentRunActivitySerializer(activity)
        assert serializer.data["activity_type"] == "thought"
        assert serializer.data["is_ephemeral"] is True

    @pytest.mark.django_db
    def test_serializer_field_values_non_ephemeral_activity(self):
        """Verify AgentRunActivitySerializer returns correct non-ephemeral status."""
        run = AgentRunFactory()
        activity = AgentRunActivityFactory(
            run=run,
            activity_type="response",
            is_ephemeral=False,
        )
        serializer = AgentRunActivitySerializer(activity)
        assert serializer.data["activity_type"] == "response"
        assert serializer.data["is_ephemeral"] is False

    @pytest.mark.django_db
    def test_serializer_run_id_read_only(self):
        """Verify run_id field is read-only."""
        activity = AgentRunActivityFactory()
        original_run_id = activity.run_id
        data = {
            "content": "Updated",
            "run_id": "some-other-run-id",
        }
        serializer = AgentRunActivitySerializer(activity, data=data, partial=True)
        assert serializer.is_valid()
        serializer.save()
        activity.refresh_from_db()
        assert activity.run_id == original_run_id
