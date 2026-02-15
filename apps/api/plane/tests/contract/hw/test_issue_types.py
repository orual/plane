# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from uuid import uuid4

from plane.db.models import IssueType, ProjectIssueType, Issue, Project, ProjectMember, State, WorkspaceMember


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
def issue_type(db, workspace):
    """Create a test issue type."""
    return IssueType.objects.create(
        name="Electrical",
        description="Electrical engineering work items",
        logo_props={"color": "#F59E0B"},
        workspace=workspace,
    )


@pytest.fixture
def issue_type_data():
    """Sample issue type data for creation tests."""
    return {
        "name": "Mechanical",
        "description": "Mechanical engineering work items",
        "logo_props": {"color": "#10B981"},
    }


@pytest.fixture
def guest_user(db):
    """Create a guest user."""
    from plane.db.models import User

    user = User.objects.create(
        email="guest@plane.so",
        username="guest_user",
        first_name="Guest",
        last_name="User",
    )
    user.set_password("guest@123")
    user.save()
    return user


@pytest.fixture
def guest_client(api_client, guest_user, workspace):
    """Return a session-authenticated client for a guest-level workspace member."""
    WorkspaceMember.objects.create(workspace=workspace, member=guest_user, role=5)
    api_client.force_authenticate(user=guest_user)
    return api_client


@pytest.fixture
def member_user(db):
    """Create a member user."""
    from plane.db.models import User

    user = User.objects.create(
        email="member@plane.so",
        username="member_user",
        first_name="Member",
        last_name="User",
    )
    user.set_password("member@123")
    user.save()
    return user


@pytest.fixture
def member_client(api_client, member_user, workspace):
    """Return a session-authenticated client for a member-level workspace member."""
    WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)
    api_client.force_authenticate(user=member_user)
    return api_client


# ============================================================
# Workspace IssueType endpoints
# ============================================================


@pytest.mark.contract
class TestIssueTypeListCreate:
    """Test workspace-scoped IssueType list and create endpoints."""

    def get_url(self, workspace_slug):
        return f"/api/workspaces/{workspace_slug}/issue-types/"

    @pytest.mark.django_db
    def test_list_issue_types(self, session_client, workspace, issue_type):
        """Test listing issue types for a workspace."""
        url = self.get_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        names = [it["name"] for it in response.data]
        assert "Electrical" in names

    @pytest.mark.django_db
    def test_create_issue_type_as_admin(self, session_client, workspace, issue_type_data):
        """Test creating an issue type as workspace admin."""
        url = self.get_url(workspace.slug)
        response = session_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == issue_type_data["name"]
        assert response.data["description"] == issue_type_data["description"]
        assert IssueType.objects.filter(workspace=workspace, name=issue_type_data["name"]).exists()

    @pytest.mark.django_db
    def test_create_issue_type_as_member_forbidden(self, member_client, workspace, issue_type_data):
        """Members should not be able to create issue types."""
        url = self.get_url(workspace.slug)
        response = member_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_create_issue_type_as_guest_forbidden(self, guest_client, workspace, issue_type_data):
        """Guests should not be able to create issue types."""
        url = self.get_url(workspace.slug)
        response = guest_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_create_issue_type_missing_name(self, session_client, workspace):
        """Creating an issue type without a name should fail."""
        url = self.get_url(workspace.slug)
        response = session_client.post(url, {"description": "No name"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_list_issue_types_as_guest(self, guest_client, workspace, issue_type):
        """Guests should be able to list issue types."""
        url = self.get_url(workspace.slug)
        response = guest_client.get(url)

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.contract
class TestIssueTypeDetail:
    """Test workspace-scoped IssueType retrieve, update, and delete."""

    def get_url(self, workspace_slug, issue_type_id):
        return f"/api/workspaces/{workspace_slug}/issue-types/{issue_type_id}/"

    @pytest.mark.django_db
    def test_retrieve_issue_type(self, session_client, workspace, issue_type):
        """Test retrieving a single issue type."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue_type.id)
        assert response.data["name"] == "Electrical"

    @pytest.mark.django_db
    def test_retrieve_nonexistent_issue_type(self, session_client, workspace):
        """Retrieving a nonexistent issue type should return 404."""
        url = self.get_url(workspace.slug, uuid4())
        response = session_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_update_issue_type(self, session_client, workspace, issue_type):
        """Test updating an issue type."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.patch(url, {"name": "Electrical v2"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        issue_type.refresh_from_db()
        assert issue_type.name == "Electrical v2"

    @pytest.mark.django_db
    def test_update_issue_type_as_member_forbidden(self, member_client, workspace, issue_type):
        """Members should not be able to update issue types."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = member_client.patch(url, {"name": "Hacked"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_delete_issue_type(self, session_client, workspace, issue_type):
        """Test deleting an issue type with no referencing issues."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        # Default manager filters out soft-deleted records
        assert not IssueType.objects.filter(id=issue_type.id).exists()

    @pytest.mark.django_db
    def test_delete_issue_type_in_use(self, session_client, workspace, issue_type, project, create_user):
        """Deleting an issue type that is referenced by issues should fail."""
        state = State.objects.filter(project=project).first()
        if not state:
            state = State.objects.create(
                name="Todo",
                project=project,
                workspace=workspace,
                group="backlog",
            )

        Issue.objects.create(
            name="Test Issue",
            project=project,
            workspace=workspace,
            state=state,
            type=issue_type,
            created_by=create_user,
        )

        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "in use" in response.data["error"].lower()
        assert IssueType.objects.filter(id=issue_type.id).exists()

    @pytest.mark.django_db
    def test_delete_issue_type_as_guest_forbidden(self, guest_client, workspace, issue_type):
        """Guests should not be able to delete issue types."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = guest_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================
# Project IssueType endpoints
# ============================================================


@pytest.mark.contract
class TestProjectIssueTypeListCreate:
    """Test project-scoped IssueType linking endpoints."""

    def get_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-types/"

    @pytest.mark.django_db
    def test_list_project_issue_types(self, session_client, workspace, project, issue_type):
        """Test listing issue types linked to a project."""
        # Link the issue type to the project
        ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["issue_type_detail"]["name"] == "Electrical"

    @pytest.mark.django_db
    def test_link_issue_type_to_project(self, session_client, workspace, project, issue_type):
        """Test linking an issue type to a project."""
        url = self.get_url(workspace.slug, project.id)
        response = session_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert ProjectIssueType.objects.filter(project=project, issue_type=issue_type).exists()

    @pytest.mark.django_db
    def test_link_duplicate_issue_type(self, session_client, workspace, project, issue_type):
        """Linking the same issue type twice should return 409."""
        ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id)
        response = session_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_link_issue_type_as_member_forbidden(self, member_client, member_user, workspace, project, issue_type):
        """Members should not be able to link issue types to projects."""
        # Add the member user to the project as a member
        ProjectMember.objects.create(
            project=project,
            member=member_user,
            role=15,
            is_active=True,
        )

        url = self.get_url(workspace.slug, project.id)
        response = member_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestProjectIssueTypeDelete:
    """Test project-scoped IssueType unlinking."""

    def get_url(self, workspace_slug, project_id, project_issue_type_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-types/{project_issue_type_id}/"

    @pytest.mark.django_db
    def test_unlink_issue_type_from_project(self, session_client, workspace, project, issue_type):
        """Test unlinking an issue type from a project."""
        pit = ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id, pit.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectIssueType.objects.filter(id=pit.id).exists()
