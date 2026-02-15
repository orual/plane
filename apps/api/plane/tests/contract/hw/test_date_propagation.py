# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Contract tests for the date propagation API endpoint.

Tests the issue update endpoint with date propagation integration.
"""

import pytest
from rest_framework import status
from datetime import date
from unittest.mock import patch

from plane.db.models import ProjectMember, WorkspaceMember, IssueRelation
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


@pytest.fixture(autouse=True)
def mock_issue_activity():
    """Mock Celery task to avoid connection issues."""
    with patch("plane.hw.services.propagation.issue_activity") as mock_task:
        yield mock_task


@pytest.mark.contract
@pytest.mark.django_db
class TestDatePropagationAPI:
    """Test suite for date propagation API endpoint."""

    def test_fs_propagation_api_response(self, session_client_auth, project):
        """Test AC5.1 & AC5.6: FS propagation returns updated_dependents in response."""
        # Create issues with dates
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )
        issue_b = IssueFactory(
            project=project,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 10),
        )

        # Create: A blocked_by B (B → A)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # PATCH B's target_date to trigger propagation
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/",
            {
                "target_date": "2026-01-13",
            },
        )

        # Should return 200 with updated_dependents
        assert response.status_code == status.HTTP_200_OK
        assert "updated_dependents" in response.data
        assert isinstance(response.data["updated_dependents"], list)

        # Check updated_dependents format (AC5.6)
        if response.data["updated_dependents"]:
            dependent = response.data["updated_dependents"][0]
            assert "id" in dependent
            assert "start_date" in dependent
            assert "target_date" in dependent

    def test_multi_hop_propagation_api(self, session_client_auth, project):
        """Test AC5.4: Multi-hop chain propagation via API."""
        # Create A→B→C chain
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )
        issue_c = IssueFactory(
            project=project,
            start_date=date(2026, 1, 21),
            target_date=date(2026, 1, 30),
        )

        # Create relations: B blocked_by A, C blocked_by B
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # PATCH A's target_date
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/",
            {
                "target_date": "2026-01-13",
            },
        )

        # Should update both B and C
        assert response.status_code == status.HTTP_200_OK
        assert "updated_dependents" in response.data
        assert len(response.data["updated_dependents"]) == 2

        # Verify IDs are present
        updated_ids = {dep["id"] for dep in response.data["updated_dependents"]}
        assert str(issue_b.id) in updated_ids
        assert str(issue_c.id) in updated_ids

    def test_multi_predecessor_api(self, session_client_auth, project):
        """Test AC5.5: Multi-predecessor resolution via API."""
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_c = IssueFactory(
            project=project,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 12),
        )
        issue_b = IssueFactory(
            project=project,
            start_date=date(2026, 1, 13),
            target_date=date(2026, 1, 20),
        )

        # B depends on both A and C
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # Move C's target_date
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_c.id}/",
            {
                "target_date": "2026-01-15",
            },
        )

        # B should be updated with max constraint
        assert response.status_code == status.HTTP_200_OK
        assert "updated_dependents" in response.data
        assert len(response.data["updated_dependents"]) > 0
        # At least B should be updated
        updated_b = next(
            (d for d in response.data["updated_dependents"] if d["id"] == str(issue_b.id)),
            None,
        )
        assert updated_b is not None, "Issue B should be in updated_dependents"
        assert updated_b["start_date"] == date(2026, 1, 16)

    def test_no_date_skip_api(self, session_client_auth, project):
        """Test AC5.8: Issues without dates are not updated."""
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project,
            start_date=None,  # No dates
            target_date=None,
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # PATCH A's date
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/",
            {
                "target_date": "2026-01-13",
            },
        )

        # B should not be in updated_dependents since it has no dates
        # When no dependents are updated, the response should be 204
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert response.data is None

    def test_non_date_update_no_propagation(self, session_client_auth, project):
        """Test that non-date updates don't trigger propagation."""
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 20),
            name="Original Name",
        )
        issue_b = IssueFactory(
            project=project,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 25),
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # PATCH A's name (not a date)
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_a.id}/",
            {
                "name": "New Name",
            },
        )

        # Should return 204 (no propagation)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        # No updated_dependents key
        assert response.data is None

    def test_response_includes_issue_data(self, session_client_auth, project):
        """Test that 200 response includes the updated issue."""
        issue_a = IssueFactory(
            project=project,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
            name="Issue A",
        )
        issue_b = IssueFactory(
            project=project,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 10),
            name="Issue B",
        )

        # Create: A blocked_by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project,
            workspace=project.workspace,
        )

        # PATCH B's date
        response = session_client_auth.patch(
            f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/issues/{issue_b.id}/",
            {
                "target_date": "2026-01-13",
            },
        )

        # Response should include issue data and updated_dependents
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue_b.id)
        assert "updated_dependents" in response.data
