# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for the cycle detection API endpoint.

Tests the cycle detection integration in the IssueRelationViewSet.create endpoint.
Tests ensure the HTTP response format and status codes are correct.
"""

import pytest
from rest_framework import status

from plane.db.models import ProjectMember, WorkspaceMember
from plane.tests.factories import IssueFactory, ProjectFactory, WorkspaceFactory, UserFactory


@pytest.fixture
def workspace(db):
    """Create a workspace for testing."""
    return WorkspaceFactory()


@pytest.fixture
def user(db):
    """Create a user for testing."""
    return UserFactory()


@pytest.fixture
def project(db, workspace, user):
    """Create a project with the user as an admin member."""
    proj = ProjectFactory(workspace=workspace, created_by=user)
    ProjectMember.objects.create(
        project=proj,
        member=user,
        role=20,  # Admin role
        is_active=True,
    )
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=20)
    return proj


@pytest.fixture
def session_client_auth(api_client, user):
    """Return a session-authenticated API client."""
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.contract
@pytest.mark.django_db
class TestCycleDetectionAPI:
    """Test suite for cycle detection API endpoint."""

    def test_direct_cycle_blocked_by(self, session_client_auth, project):
        """
        Test AC2.1: API returns HTTP 400 with cycle_detected error on direct cycle A→B→A.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A is blocked by B via API
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B is blocked by A via API - should be rejected
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_transitive_cycle_chain(self, session_client_auth, project):
        """
        Test AC2.2: API returns HTTP 400 with cycle path on transitive cycle A→B→C→A.
        """
        # Create three issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)
        issue_c = IssueFactory(project=project)

        # Create A is blocked by B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Create B is blocked by C
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_c.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create C is blocked by A - should be rejected
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_c.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_cycle_path_in_response(self, session_client_auth, project):
        """
        Test AC2.5: HTTP 400 response includes cycle_path array with issue IDs.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A is blocked by B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B is blocked by A
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "cycle_path" in response.data
        assert isinstance(response.data.get("cycle_path"), list)
        assert len(response.data.get("cycle_path")) == 3  # B, A, B

    def test_relates_to_no_cycle_check(self, session_client_auth, project):
        """
        Test AC2.6: relates_to type doesn't participate in cycle detection.
        Creating relates_to relations in either direction should succeed.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A relates to B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "relates_to",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Create B relates to A - should also succeed (no cycle check for relates_to)
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "relates_to",
                "issues": [str(issue_a.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_duplicate_type_no_cycle_check(self, session_client_auth, project):
        """
        Test AC2.6: duplicate type (symmetric) doesn't participate in cycle detection.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A is duplicate of B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "duplicate",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Create B is duplicate of A - should also succeed (no cycle check for duplicate)
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "duplicate",
                "issues": [str(issue_a.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_self_reference_blocked_by(self, session_client_auth, project):
        """
        Test AC2.7: Self-referencing relation (A→A) is rejected with HTTP 400.
        """
        issue_a = IssueFactory(project=project)

        # Try to create A is blocked by A
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_blocking_relation_cycle_detection(self, session_client_auth, project):
        """
        Test cycle detection with incoming 'blocking' relation type.
        'blocking' is reversed during storage, so proper direction handling is critical.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A blocking B (stored as B blocked_by A)
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocking",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B blocking A (stored as A blocked_by B)
        # This would create: B blocked_by A, A blocked_by B - a cycle!
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "blocking",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_start_before_cycle_detection(self, session_client_auth, project):
        """
        Test cycle detection with start_before relation type.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A start_before B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "start_before",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B start_before A - should be rejected
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "start_before",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_finish_before_cycle_detection(self, session_client_auth, project):
        """
        Test cycle detection with finish_before relation type.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A finish_before B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "finish_before",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B finish_before A - should be rejected
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "finish_before",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_implemented_by_cycle_detection(self, session_client_auth, project):
        """
        Test cycle detection with implemented_by relation type.
        """
        # Create two issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)

        # Create A implemented_by B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "implemented_by",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Try to create B implemented_by A - should be rejected
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "implemented_by",
                "issues": [str(issue_a.id)],
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data.get("error") == "cycle_detected"

    def test_valid_dependency_chain_succeeds(self, session_client_auth, project):
        """
        Test that valid (non-cyclic) dependency chains are allowed.
        Create A→B→C (blocked_by) and verify all succeed.
        """
        # Create three issues
        issue_a = IssueFactory(project=project)
        issue_b = IssueFactory(project=project)
        issue_c = IssueFactory(project=project)

        # Create A is blocked by B
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_b.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Create B is blocked by C
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_c.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Create A is blocked by C (independent edge, valid)
        response = session_client_auth.post(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/relations/",
            {
                "relation_type": "blocked_by",
                "issues": [str(issue_c.id)],
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
