# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State, WorkspaceMember
from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue


@pytest.fixture
def project(db, workspace, create_user):
    """Create a test project with the user as an admin member."""
    proj = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
        is_issue_type_enabled=True,
    )
    ProjectMember.objects.create(
        project=proj,
        member=create_user,
        role=20,
        is_active=True,
    )
    return proj


@pytest.fixture
def issue(db, workspace, project, create_user):
    """Create a test issue."""
    state = State.objects.filter(project=project).first()
    if not state:
        state = State.objects.create(
            name="Todo",
            project=project,
            workspace=workspace,
            group="backlog",
        )
    return Issue.objects.create(
        name="Test Issue",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )


# ============================================================
# Property Definition endpoints
# ============================================================


@pytest.mark.contract
class TestPropertyDefinitionListCreate:
    """Test workspace-scoped property definition list and create endpoints."""

    def get_url(self, workspace_slug):
        return f"/api/workspaces/{workspace_slug}/property-definitions/"

    @pytest.mark.django_db
    def test_list_property_definitions(self, session_client, workspace):
        """Test listing property definitions for a workspace."""
        IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom Field",
            property_type="text",
        )

        url = self.get_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        names = [p["name"] for p in response.data]
        assert "Custom Field" in names

    @pytest.mark.django_db
    def test_create_property_definition(self, session_client, workspace):
        """Test creating a property definition."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Status",
            "property_type": "select",
            "options": ["Open", "Closed", "In Progress"],
            "is_required": False,
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Status"
        assert response.data["property_type"] == "select"
        assert IssuePropertyDefinition.objects.filter(
            workspace=workspace, name="Status"
        ).exists()

    @pytest.mark.django_db
    def test_create_property_definition_missing_name(self, session_client, workspace):
        """Creating a property without a name should fail."""
        url = self.get_url(workspace.slug)
        data = {"property_type": "text"}
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_select_property_without_options(self, session_client, workspace):
        """Creating a select property without options should fail."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Select Field",
            "property_type": "select",
            "options": [],
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_text_property_with_options_rejected(self, session_client, workspace):
        """Options for text properties should be rejected."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Text Field",
            "property_type": "text",
            "options": ["A", "B"],
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestPropertyDefinitionDetail:
    """Test workspace-scoped property definition retrieve, update, and delete."""

    def get_url(self, workspace_slug, prop_id):
        return f"/api/workspaces/{workspace_slug}/property-definitions/{prop_id}/"

    @pytest.mark.django_db
    def test_retrieve_property_definition(self, session_client, workspace):
        """Test retrieving a single property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Priority",
            property_type="select",
            options=["High", "Medium", "Low"],
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Priority"
        assert response.data["property_type"] == "select"

    @pytest.mark.django_db
    def test_update_property_definition(self, session_client, workspace):
        """Test updating a property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Old Name",
            property_type="text",
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.patch(url, {"name": "New Name"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        prop_def.refresh_from_db()
        assert prop_def.name == "New Name"

    @pytest.mark.django_db
    def test_delete_property_definition(self, session_client, workspace):
        """Test deleting a property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="To Delete",
            property_type="text",
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT


# ============================================================
# Property Value endpoints
# ============================================================


@pytest.mark.contract
class TestPropertyValueListCreate:
    """Test issue-scoped property value list and create endpoints."""

    def get_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/property-values/"

    @pytest.mark.django_db
    def test_list_property_values(self, session_client, workspace, project, issue):
        """Test listing property values for an issue."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom Field",
            property_type="text",
        )
        IssuePropertyValue.objects.create(
            issue=issue,
            property_definition=prop_def,
            workspace=workspace,
            value={"value": "test"},
        )

        url = self.get_url(workspace.slug, project.id, issue.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    @pytest.mark.django_db
    def test_create_property_value(self, session_client, workspace, project, issue):
        """Test creating a property value."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Text Field",
            property_type="text",
        )

        url = self.get_url(workspace.slug, project.id, issue.id)
        data = {
            "property_definition": str(prop_def.id),
            "value": {"value": "some text"},
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert IssuePropertyValue.objects.filter(
            issue=issue, property_definition=prop_def
        ).exists()

    @pytest.mark.django_db
    def test_bulk_upsert_property_values(self, session_client, workspace, project, issue):
        """Test bulk upserting property values."""
        prop_def1 = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Field 1",
            property_type="text",
        )
        prop_def2 = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Field 2",
            property_type="number",
        )

        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/property-values/bulk-upsert/"
        data = [
            {"property_definition_id": str(prop_def1.id), "value": {"value": "text"}},
            {"property_definition_id": str(prop_def2.id), "value": {"value": 42}},
        ]
        response = session_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2


@pytest.mark.contract
class TestPropertyValueDelete:
    """Test issue-scoped property value deletion."""

    @pytest.mark.django_db
    def test_delete_property_value(self, session_client, workspace, project, issue):
        """Test deleting a property value."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom",
            property_type="text",
        )
        prop_value = IssuePropertyValue.objects.create(
            issue=issue,
            property_definition=prop_def,
            workspace=workspace,
            value={"value": "test"},
        )

        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/property-values/{prop_value.id}/"
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
