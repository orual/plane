# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import IssueType, ProjectIssueType, Project
from plane.hw.serializers import (
    IssueTypeSerializer,
    ProjectIssueTypeDetailSerializer,
)


@pytest.mark.unit
class TestIssueTypeSerializer:
    """Test IssueTypeSerializer validation and output shape."""

    @pytest.mark.django_db
    def test_valid_data(self, workspace):
        """Serializer accepts valid issue type data."""
        data = {"name": "Electrical", "description": "EE work", "logo_props": {"color": "#F59E0B"}}
        serializer = IssueTypeSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_missing_name(self, workspace):
        """Serializer rejects data without a name."""
        data = {"description": "No name"}
        serializer = IssueTypeSerializer(data=data)
        assert not serializer.is_valid()
        assert "name" in serializer.errors

    @pytest.mark.django_db
    def test_output_shape(self, workspace):
        """Serialized output contains all expected fields."""
        issue_type = IssueType.objects.create(
            name="Mechanical",
            workspace=workspace,
            logo_props={"color": "#10B981"},
        )
        serializer = IssueTypeSerializer(issue_type)
        data = serializer.data

        assert "id" in data
        assert "name" in data
        assert "description" in data
        assert "logo_props" in data
        assert "workspace_id" in data
        assert "is_default" in data
        assert "is_active" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert data["name"] == "Mechanical"


@pytest.mark.unit
class TestProjectIssueTypeDetailSerializer:
    """Test ProjectIssueTypeDetailSerializer nesting."""

    @pytest.mark.django_db
    def test_nested_issue_type_detail(self, workspace, create_user):
        """Detail serializer includes nested issue type data."""
        project = Project.objects.create(
            name="Test Project",
            identifier="TP",
            workspace=workspace,
            created_by=create_user,
        )
        issue_type = IssueType.objects.create(
            name="Design",
            workspace=workspace,
            logo_props={"color": "#7C3AED"},
        )
        pit = ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        serializer = ProjectIssueTypeDetailSerializer(pit)
        data = serializer.data

        assert "issue_type_detail" in data
        assert data["issue_type_detail"]["name"] == "Design"
        assert data["issue_type_detail"]["logo_props"] == {"color": "#7C3AED"}
        assert data["issue_type_id"] == str(issue_type.id)
        assert data["project_id"] == str(project.id)
