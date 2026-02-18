# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.hw.models import AgentProfile, AgentRun, AgentRunActivity, AgentConversation, AgentConversationMessage


class AgentProfileSerializer(BaseSerializer):
    class Meta:
        model = AgentProfile
        fields = [
            "id",
            "user_id",
            "workspace_id",
            "webhook_url",
            "event_triggers",
            "is_active",
            "display_name",
            "description",
            "agent_type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "workspace_id",
            "agent_type",
            "created_at",
            "updated_at",
        ]


class AgentProfileCreateSerializer(BaseSerializer):
    class Meta:
        model = AgentProfile
        fields = [
            "display_name",
            "description",
            "webhook_url",
            "webhook_secret",
            "event_triggers",
            "agent_type",
        ]


class AgentRunSerializer(BaseSerializer):
    class Meta:
        model = AgentRun
        fields = [
            "id",
            "agent_id",
            "workspace_id",
            "project_id",
            "issue_id",
            "status",
            "stale_timeout",
            "last_activity_at",
            "completed_at",
            "trigger_metadata",
            "conversation_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "agent_id",
            "workspace_id",
            "project_id",
            "issue_id",
            "last_activity_at",
            "completed_at",
            "conversation_id",
            "created_at",
            "updated_at",
        ]


class AgentRunCreateSerializer(BaseSerializer):
    agent_id = serializers.UUIDField(write_only=True)
    project_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    issue_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = AgentRun
        fields = [
            "agent_id",
            "project_id",
            "issue_id",
            "trigger_metadata",
        ]


class AgentRunActivitySerializer(BaseSerializer):
    class Meta:
        model = AgentRunActivity
        fields = [
            "id",
            "run_id",
            "activity_type",
            "content",
            "metadata",
            "is_ephemeral",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "run_id",
            "is_ephemeral",
            "created_at",
            "updated_at",
        ]


class AgentConversationSerializer(BaseSerializer):
    class Meta:
        model = AgentConversation
        fields = [
            "id",
            "workspace_id",
            "user_id",
            "title",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "user_id",
            "created_at",
            "updated_at",
        ]


class AgentConversationMessageSerializer(BaseSerializer):
    class Meta:
        model = AgentConversationMessage
        fields = [
            "id",
            "conversation_id",
            "role",
            "content",
            "run_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "conversation_id",
            "run_id",
            "created_at",
            "updated_at",
        ]
