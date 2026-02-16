# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.app.serializers import BaseSerializer
from plane.hw.models import AgentProfile, AgentRun, AgentRunActivity


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
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "workspace_id",
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
            "created_at",
            "updated_at",
        ]


class AgentRunCreateSerializer(BaseSerializer):
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
