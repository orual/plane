# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.db.models import IssueType, ProjectIssueType


class IssueTypeSerializer(BaseSerializer):
    class Meta:
        model = IssueType
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace"]


class ProjectIssueTypeSerializer(BaseSerializer):
    issue_type_id = serializers.PrimaryKeyRelatedField(source="issue_type", queryset=IssueType.objects.all())

    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue_type_id",
            "level",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]


class ProjectIssueTypeDetailSerializer(BaseSerializer):
    """Read-only serializer that nests the IssueType data."""

    issue_type_detail = IssueTypeSerializer(source="issue_type", read_only=True)

    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue_type_id",
            "issue_type_detail",
            "level",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]
