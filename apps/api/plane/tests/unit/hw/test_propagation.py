# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for the date propagation service.

Tests the propagate_dates function for cascading date updates through
dependency chains.
"""

import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

from plane.hw.services.propagation import propagate_dates
from plane.db.models import IssueRelation, Issue
from plane.tests.factories import IssueFactory, ProjectFactory, WorkspaceFactory


@pytest.fixture
def workspace(db):
    """Create a workspace for testing."""
    return WorkspaceFactory()


@pytest.fixture
def project_1(db, workspace):
    """Create a project in the workspace."""
    proj = ProjectFactory(workspace=workspace)
    return proj


@pytest.fixture
def project_2(db, workspace):
    """Create a second project in the same workspace."""
    proj = ProjectFactory(workspace=workspace)
    return proj


@pytest.fixture(autouse=True)
def mock_issue_activity():
    """Mock Celery task to avoid connection issues."""
    with patch("plane.hw.services.propagation.issue_activity") as mock_task:
        yield mock_task


@pytest.mark.unit
@pytest.mark.django_db
class TestPropagationService:
    """Test suite for propagate_dates service."""

    def test_no_dependents_returns_empty(self, project_1):
        """Test AC5.1-5.7: No dependents returns empty list."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 20),
        )

        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 20),
            new_start_date=date(2026, 1, 13),
            new_target_date=date(2026, 1, 23),
        )

        assert result == []

    def test_fs_propagation_target_date_moved(self, project_1):
        """Test AC5.1: Finish-to-Start propagation when predecessor target_date moves."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 10),
        )

        # Create: A blocked_by B (B → A)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # B's target_date moves from Jan 10 to Jan 13 (+3 days)
        # First, update the database to match what the view does (save first, then propagate)
        old_b_start = issue_b.start_date
        old_b_target = issue_b.target_date
        issue_b.target_date = date(2026, 1, 13)
        issue_b.save()

        result = propagate_dates(
            changed_issue_id=str(issue_b.id),
            old_start_date=old_b_start,
            old_target_date=old_b_target,
            new_start_date=issue_b.start_date,
            new_target_date=issue_b.target_date,
        )

        # A's start_date should shift from Jan 11 to Jan 14 (+3 days)
        assert len(result) == 1
        assert result[0]["id"] == str(issue_a.id)
        assert result[0]["start_date"] == date(2026, 1, 14)
        # Duration preserved (was 10 days from Jan 11-20, now Jan 14-23)
        assert result[0]["target_date"] == date(2026, 1, 23)

        # Verify database was updated
        issue_a.refresh_from_db()
        assert issue_a.start_date == date(2026, 1, 14)
        assert issue_a.target_date == date(2026, 1, 23)

    def test_ss_propagation_start_date_moved(self, project_1):
        """Test AC5.2: Start-to-Start propagation when predecessor start_date moves."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 15),
        )

        # Create: A start_before B (B → A)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="start_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        # B's start_date moves from Jan 5 to Jan 8 (+3 days)
        result = propagate_dates(
            changed_issue_id=str(issue_b.id),
            old_start_date=date(2026, 1, 5),
            old_target_date=date(2026, 1, 15),
            new_start_date=date(2026, 1, 8),
            new_target_date=date(2026, 1, 15),
        )

        # A's start_date should shift to Jan 8
        assert len(result) == 1
        assert result[0]["id"] == str(issue_a.id)
        assert result[0]["start_date"] == date(2026, 1, 8)
        # Duration preserved
        assert result[0]["target_date"] == date(2026, 1, 13)

    def test_ff_propagation_target_date_moved(self, project_1):
        """Test AC5.3: Finish-to-Finish propagation when predecessor target_date moves."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 15),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 15),
        )

        # Create: A finish_before B (B → A)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="finish_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        # B's target_date moves from Jan 15 to Jan 18 (+3 days)
        result = propagate_dates(
            changed_issue_id=str(issue_b.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 15),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 18),
        )

        # A's target_date should shift to Jan 18
        assert len(result) == 1
        assert result[0]["id"] == str(issue_a.id)
        assert result[0]["target_date"] == date(2026, 1, 18)
        assert result[0]["start_date"] == date(2026, 1, 10)

    def test_multi_hop_chain_abc(self, project_1):
        """Test AC5.4: Multi-hop propagation cascades through A→B→C chain."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )
        issue_c = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 21),
            target_date=date(2026, 1, 30),
        )

        # Create chain: A blocked_by B, B blocked_by C
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # C's target_date moves from Jan 10 to Jan 13 (+3 days)
        result = propagate_dates(
            changed_issue_id=str(issue_c.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 13),
        )

        # Both B and A should be updated
        assert len(result) == 2
        result_dict = {r["id"]: r for r in result}

        # B's start_date shifts from Jan 11 to Jan 14 (+3 days)
        assert result_dict[str(issue_b.id)]["start_date"] == date(2026, 1, 14)
        assert result_dict[str(issue_b.id)]["target_date"] == date(2026, 1, 23)

        # A's start_date shifts from Jan 21 to Jan 24 (+3 days)
        assert result_dict[str(issue_a.id)]["start_date"] == date(2026, 1, 24)
        assert result_dict[str(issue_a.id)]["target_date"] == date(2026, 2, 2)

    def test_multi_predecessor_fs_rules(self, project_1):
        """Test AC5.5: Multi-predecessor resolution with FS relations."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_c = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 12),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 13),
            target_date=date(2026, 1, 20),
        )

        # Create: B blocked_by A (A → B), B blocked_by C (C → B)
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Move A's target_date to Jan 10 (no change)
        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 10),
        )

        # B should not be updated since max(Jan 10 + 1, Jan 12 + 1) = Jan 13 (current)
        assert len(result) == 0

        # Now move C's target_date to Jan 15
        result = propagate_dates(
            changed_issue_id=str(issue_c.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 12),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 15),
        )

        # B's start_date should be max(Jan 10 + 1, Jan 15 + 1) = Jan 16
        assert len(result) == 1
        assert result[0]["id"] == str(issue_b.id)
        assert result[0]["start_date"] == date(2026, 1, 16)

    def test_issue_without_dates_skipped(self, project_1):
        """Test AC5.8: Issues without dates are skipped in propagation."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=None,  # No start date
            target_date=None,
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Move A's target_date
        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 13),
        )

        # B should not be updated since it has no dates
        assert len(result) == 0

    def test_cross_project_propagation(self, project_1, project_2):
        """Test AC5.9: Cross-project propagation works correctly."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_2,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )

        # Create: B (project 2) blocked_by A (project 1)
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Move A's target_date
        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 13),
        )

        # B should be updated even though it's in a different project
        assert len(result) == 1
        assert result[0]["id"] == str(issue_b.id)
        assert result[0]["start_date"] == date(2026, 1, 14)

    def test_return_value_format(self, project_1):
        """Test AC5.1-5.7: Return value has correct format."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 13),
        )

        # Check return value format
        assert len(result) == 1
        assert "id" in result[0]
        assert "start_date" in result[0]
        assert "target_date" in result[0]
        assert isinstance(result[0]["id"], str)
        assert isinstance(result[0]["start_date"], date)
        assert isinstance(result[0]["target_date"], date)

    def test_atomicity_transaction_rollback(self, project_1):
        """Test AC5.7: Propagation is atomic - rollback on failure."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Mock bulk_update to raise an exception
        with patch("plane.hw.services.propagation.Issue.objects.bulk_update") as mock_bulk:
            mock_bulk.side_effect = Exception("Database error")

            # Propagation should raise the exception
            with pytest.raises(Exception, match="Database error"):
                propagate_dates(
                    changed_issue_id=str(issue_a.id),
                    old_start_date=date(2026, 1, 10),
                    old_target_date=date(2026, 1, 10),
                    new_start_date=date(2026, 1, 10),
                    new_target_date=date(2026, 1, 13),
                )

            # B should not be updated in database due to transaction rollback
            issue_b.refresh_from_db()
            assert issue_b.start_date == date(2026, 1, 11)

    def test_no_date_change_no_propagation(self, project_1):
        """Test that no changes when dates don't actually change."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )

        # Create: B blocked_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # No actual date change (same old and new dates)
        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 10),
        )

        # No propagation should occur
        assert len(result) == 0

    def test_implemented_by_relation_type(self, project_1):
        """Test AC5.1-5.7: implemented_by relation type works in propagation."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 10),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 11),
            target_date=date(2026, 1, 20),
        )

        # Create: B implemented_by A
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="implemented_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Move A's target_date - implemented_by is FS
        result = propagate_dates(
            changed_issue_id=str(issue_a.id),
            old_start_date=date(2026, 1, 10),
            old_target_date=date(2026, 1, 10),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 13),
        )

        # B should be updated (FS constraint)
        assert len(result) == 1
        assert result[0]["id"] == str(issue_b.id)
        assert result[0]["start_date"] == date(2026, 1, 14)

    def test_duration_preservation_on_ss_propagation(self, project_1):
        """Test that duration is preserved when start_date shifts on SS relations."""
        issue_a = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 10),
        )
        issue_b = IssueFactory(
            project=project_1,
            start_date=date(2026, 1, 5),
            target_date=date(2026, 1, 20),
        )

        # Create: A start_before B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="start_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        # B's start_date moves +5 days
        result = propagate_dates(
            changed_issue_id=str(issue_b.id),
            old_start_date=date(2026, 1, 5),
            old_target_date=date(2026, 1, 20),
            new_start_date=date(2026, 1, 10),
            new_target_date=date(2026, 1, 20),
        )

        # A's start_date should shift +5 days and duration preserved
        assert len(result) == 1
        assert result[0]["start_date"] == date(2026, 1, 10)
        # Duration was 5 days (Jan 5 to Jan 10), so should be (Jan 10 to Jan 15)
        assert result[0]["target_date"] == date(2026, 1, 15)
