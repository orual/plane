# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueRelation, Project, ProjectMember
from plane.tests.factories import WorkspaceFactory


@pytest.fixture
def workspace(db):
    """Create a test workspace."""
    return WorkspaceFactory()


@pytest.fixture
def project(db, workspace, create_user):
    """Create a test project with the user as an admin member."""
    proj = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=proj,
        member=create_user,
        role=20,
        is_active=True,
    )
    return proj


@pytest.fixture
def issue_a(db, project, create_user):
    """Create a test issue A."""
    return Issue.objects.create(
        name="Issue A",
        project=project,
        workspace=project.workspace,
        state_id=project.default_state_id,
        created_by=create_user,
    )


@pytest.fixture
def issue_b(db, project, create_user):
    """Create a test issue B."""
    return Issue.objects.create(
        name="Issue B",
        project=project,
        workspace=project.workspace,
        state_id=project.default_state_id,
        created_by=create_user,
    )


@pytest.fixture
def issue_c(db, project, create_user):
    """Create a test issue C."""
    return Issue.objects.create(
        name="Issue C",
        project=project,
        workspace=project.workspace,
        state_id=project.default_state_id,
        created_by=create_user,
    )


@pytest.mark.contract
class TestIssueRelationListCreate:
    """Test issue relation list and create endpoints."""

    def get_list_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/relations/"

    def get_remove_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/relations/remove/"

    @pytest.mark.django_db
    def test_list_empty_relations(self, session_client, workspace, project, issue_a):
        """Test listing relations for an issue with no relations."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        # Response should have all relation types as keys, even if empty
        assert "blocking" in response.data
        assert "blocked_by" in response.data
        assert "start_before" in response.data
        assert "start_after" in response.data
        assert "finish_before" in response.data
        assert "finish_after" in response.data
        assert "implements" in response.data
        assert "implemented_by" in response.data
        assert "relates_to" in response.data
        assert "duplicate" in response.data

    @pytest.mark.django_db
    def test_create_blocking_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.7: Create blocking relation (existing type preserved)."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            url,
            {"relation_type": "blocking", "issues": [str(issue_b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the relation was created
        assert IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="blocked_by",
        ).exists()

    @pytest.mark.django_db
    def test_create_start_before_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.1 and AC1.5: Create start_before relation (new type)."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            url,
            {"relation_type": "start_before", "issues": [str(issue_b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the relation was created
        assert IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="start_before",
        ).exists()

    @pytest.mark.django_db
    def test_create_finish_before_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.2 and AC1.5: Create finish_before relation (new type)."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            url,
            {"relation_type": "finish_before", "issues": [str(issue_b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the relation was created
        assert IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="finish_before",
        ).exists()

    @pytest.mark.django_db
    def test_create_implemented_by_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.5: Create implemented_by relation (structural type)."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            url,
            {"relation_type": "implemented_by", "issues": [str(issue_b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the relation was created
        assert IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="implemented_by",
        ).exists()

    @pytest.mark.django_db
    def test_create_implements_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.5: Create implements relation (reverse of implemented_by)."""
        url = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            url,
            {"relation_type": "implements", "issues": [str(issue_b.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # When storing, implements gets converted to implemented_by with swapped issue/related_issue
        assert IssueRelation.objects.filter(
            issue_id=issue_b.id,
            related_issue_id=issue_a.id,
            relation_type="implemented_by",
        ).exists()

    @pytest.mark.django_db
    def test_bidirectional_start_before_mapping(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.3: Bidirectional mapping of start_before relation."""
        # Create start_before from A to B
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response_a = session_client.post(
            url_a,
            {"relation_type": "start_before", "issues": [str(issue_b.id)]},
            format="json",
        )
        assert response_a.status_code == status.HTTP_201_CREATED

        # Verify issue A shows start_before
        response_a_list = session_client.get(url_a)
        assert response_a_list.status_code == status.HTTP_200_OK
        start_before_issues = response_a_list.data.get("start_before", [])
        assert any(issue["id"] == str(issue_b.id) for issue in start_before_issues)

        # Verify issue B shows start_after (reverse)
        url_b = self.get_list_url(workspace.slug, project.id, issue_b.id)
        response_b_list = session_client.get(url_b)
        assert response_b_list.status_code == status.HTTP_200_OK
        start_after_issues = response_b_list.data.get("start_after", [])
        assert any(issue["id"] == str(issue_a.id) for issue in start_after_issues)

    @pytest.mark.django_db
    def test_bidirectional_finish_before_mapping(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.3: Bidirectional mapping of finish_before relation."""
        # Create finish_before from A to B
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response_a = session_client.post(
            url_a,
            {"relation_type": "finish_before", "issues": [str(issue_b.id)]},
            format="json",
        )
        assert response_a.status_code == status.HTTP_201_CREATED

        # Verify issue A shows finish_before
        response_a_list = session_client.get(url_a)
        assert response_a_list.status_code == status.HTTP_200_OK
        finish_before_issues = response_a_list.data.get("finish_before", [])
        assert any(issue["id"] == str(issue_b.id) for issue in finish_before_issues)

        # Verify issue B shows finish_after (reverse)
        url_b = self.get_list_url(workspace.slug, project.id, issue_b.id)
        response_b_list = session_client.get(url_b)
        assert response_b_list.status_code == status.HTTP_200_OK
        finish_after_issues = response_b_list.data.get("finish_after", [])
        assert any(issue["id"] == str(issue_a.id) for issue in finish_after_issues)

    @pytest.mark.django_db
    def test_bidirectional_implemented_by_mapping(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.3: Bidirectional mapping of implemented_by relation."""
        # Create implemented_by from A to B
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)
        response_a = session_client.post(
            url_a,
            {"relation_type": "implemented_by", "issues": [str(issue_b.id)]},
            format="json",
        )
        assert response_a.status_code == status.HTTP_201_CREATED

        # Verify issue A shows implemented_by
        response_a_list = session_client.get(url_a)
        assert response_a_list.status_code == status.HTTP_200_OK
        implemented_by_issues = response_a_list.data.get("implemented_by", [])
        assert any(issue["id"] == str(issue_b.id) for issue in implemented_by_issues)

        # Verify issue B shows implements (reverse)
        url_b = self.get_list_url(workspace.slug, project.id, issue_b.id)
        response_b_list = session_client.get(url_b)
        assert response_b_list.status_code == status.HTTP_200_OK
        implements_issues = response_b_list.data.get("implements", [])
        assert any(issue["id"] == str(issue_a.id) for issue in implements_issues)

    @pytest.mark.django_db
    def test_remove_relation_deletes_both_sides(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.6: Removing relation removes both forward and reverse."""
        # Create start_before from A to B
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)
        session_client.post(
            url_a,
            {"relation_type": "start_before", "issues": [str(issue_b.id)]},
            format="json",
        )

        # Verify the relation exists both ways
        assert IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="start_before",
        ).exists()

        # Remove the relation
        remove_url = self.get_remove_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            remove_url,
            {"related_issue": str(issue_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify the relation is gone
        assert not IssueRelation.objects.filter(
            issue_id=issue_a.id,
            related_issue_id=issue_b.id,
            relation_type="start_before",
        ).exists()

        # Verify reverse side is also gone (list should show empty)
        response_b_list = session_client.get(
            self.get_list_url(workspace.slug, project.id, issue_b.id)
        )
        assert response_b_list.status_code == status.HTTP_200_OK
        start_after_issues = response_b_list.data.get("start_after", [])
        assert not any(issue["id"] == str(issue_a.id) for issue in start_after_issues)

    @pytest.mark.django_db
    def test_remove_implemented_by_relation(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.6: Removing implemented_by relation removes both sides."""
        # Create implemented_by from A to B
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)
        session_client.post(
            url_a,
            {"relation_type": "implemented_by", "issues": [str(issue_b.id)]},
            format="json",
        )

        # Verify both sides exist
        response_a_list = session_client.get(url_a)
        implemented_by_issues = response_a_list.data.get("implemented_by", [])
        assert any(issue["id"] == str(issue_b.id) for issue in implemented_by_issues)

        url_b = self.get_list_url(workspace.slug, project.id, issue_b.id)
        response_b_list = session_client.get(url_b)
        implements_issues = response_b_list.data.get("implements", [])
        assert any(issue["id"] == str(issue_a.id) for issue in implements_issues)

        # Remove the relation
        remove_url = self.get_remove_url(workspace.slug, project.id, issue_a.id)
        response = session_client.post(
            remove_url,
            {"related_issue": str(issue_b.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify both sides are gone
        response_a_list = session_client.get(url_a)
        implemented_by_issues = response_a_list.data.get("implemented_by", [])
        assert not any(issue["id"] == str(issue_b.id) for issue in implemented_by_issues)

        response_b_list = session_client.get(url_b)
        implements_issues = response_b_list.data.get("implements", [])
        assert not any(issue["id"] == str(issue_a.id) for issue in implements_issues)

    @pytest.mark.django_db
    def test_all_relation_types_roundtrip(self, session_client, workspace, project, issue_a, issue_b, issue_c):
        """Test AC1.5: All 10 relation types round-trip correctly."""
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)

        # Create all relation types from issue_a
        relation_types = [
            "blocking",
            "blocked_by",
            "start_before",
            "start_after",
            "finish_before",
            "finish_after",
            "implemented_by",
            "implements",
            "relates_to",
            "duplicate",
        ]

        for i, rel_type in enumerate(relation_types):
            target_issue = issue_b if i % 2 == 0 else issue_c
            response = session_client.post(
                url_a,
                {"relation_type": rel_type, "issues": [str(target_issue.id)]},
                format="json",
            )
            assert response.status_code == status.HTTP_201_CREATED

        # Verify all relations appear in the list
        response = session_client.get(url_a)
        assert response.status_code == status.HTTP_200_OK

        # For each relation type, verify it appears in the response
        assert len(response.data.get("blocking", [])) > 0
        assert len(response.data.get("blocked_by", [])) > 0
        assert len(response.data.get("start_before", [])) > 0
        assert len(response.data.get("start_after", [])) > 0
        assert len(response.data.get("finish_before", [])) > 0
        assert len(response.data.get("finish_after", [])) > 0
        assert len(response.data.get("implemented_by", [])) > 0
        assert len(response.data.get("implements", [])) > 0
        assert len(response.data.get("relates_to", [])) > 0
        assert len(response.data.get("duplicate", [])) > 0

    @pytest.mark.django_db
    def test_blocking_relation_existing_behavior(self, session_client, workspace, project, issue_a, issue_b):
        """Test AC1.7: Blocking relations still work identically after expansion."""
        url_a = self.get_list_url(workspace.slug, project.id, issue_a.id)

        # Create blocking relation from A to B
        response = session_client.post(
            url_a,
            {"relation_type": "blocking", "issues": [str(issue_b.id)]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

        # Verify A shows blocking
        response_list = session_client.get(url_a)
        blocking_issues = response_list.data.get("blocking", [])
        assert any(issue["id"] == str(issue_b.id) for issue in blocking_issues)

        # Verify B shows blocked_by (reverse)
        url_b = self.get_list_url(workspace.slug, project.id, issue_b.id)
        response_list_b = session_client.get(url_b)
        blocked_by_issues = response_list_b.data.get("blocked_by", [])
        assert any(issue["id"] == str(issue_a.id) for issue in blocked_by_issues)
