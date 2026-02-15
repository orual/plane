# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for the cycle detection service.

Tests the DFS-based cycle detection algorithm for dependency relations.
Tests are divided by acceptance criteria to ensure full coverage.
"""

import pytest

from plane.hw.services.cycle_detection import detect_dependency_cycle
from plane.db.models import IssueRelation
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


@pytest.mark.unit
@pytest.mark.django_db
class TestCycleDetection:
    """Test suite for cycle detection service."""

    def test_direct_cycle_blocked_by(self, project_1):
        """
        Test AC2.1: Detect direct cycle A→B (blocked_by), then B→A.

        When A is blocked by B, and we try to create B is blocked by A,
        a cycle should be detected.
        """
        # Create two issues
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A is blocked by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B is blocked by A - should detect cycle
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_b.id), str(issue_a.id), str(issue_b.id)]

    def test_transitive_cycle_blocked_by(self, project_1):
        """
        Test AC2.2: Detect transitive cycle A→B→C (blocked_by), then C→A.

        Chain: A is blocked by B, B is blocked by C.
        Attempt: C is blocked by A - should detect cycle A→B→C→A.
        """
        # Create three issues
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create A is blocked by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Create B is blocked by C
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create C is blocked by A - should detect cycle
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_c.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is not None
        assert cycle_path == [
            str(issue_c.id),
            str(issue_b.id),
            str(issue_a.id),
            str(issue_c.id),
        ]

    def test_cross_project_cycle(self, project_1, project_2):
        """
        Test AC2.4: Detect cycle across project boundaries.

        A (project 1) → B (project 2) → A (project 1).
        """
        # Create issues in different projects
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_2)

        # Create A is blocked by B (cross-project)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B is blocked by A (cross-project cycle)
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_b.id), str(issue_a.id), str(issue_b.id)]

    def test_symmetric_type_no_cycle(self, project_1):
        """
        Test AC2.6: Symmetric types (relates_to, duplicate) don't participate in cycle detection.

        Create A→B as relates_to (not a dependency type), then check B→A
        with blocked_by. Should not detect a cycle (relates_to is ignored).
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A relates to B (symmetric, not dependency)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="relates_to",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Check B is blocked by A (with dependency type)
        # Should NOT detect a cycle because relates_to is not in dependency types
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is None

    def test_self_reference(self, project_1):
        """
        Test AC2.7: Self-referencing relation (A→A) is rejected as degenerate cycle.
        """
        issue_a = IssueFactory(project=project_1)

        # Try to create A is blocked by A
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_a.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_a.id), str(issue_a.id)]

    def test_no_cycle(self, project_1):
        """
        Test: When no cycle exists, detect_dependency_cycle returns None.

        Create A→B (blocked_by), then check A→C.
        Should not detect a cycle.
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create A is blocked by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Check A is blocked by C (no cycle)
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_a.id),
            target_issue_id=str(issue_c.id),
            relation_type="blocked_by",
        )

        assert cycle_path is None

    def test_start_before_cycle(self, project_1):
        """
        Test cycle detection for start_before relation type.
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A start_before B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="start_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B start_before A
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="start_before",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_b.id), str(issue_a.id), str(issue_b.id)]

    def test_finish_before_cycle(self, project_1):
        """
        Test cycle detection for finish_before relation type.
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A finish_before B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="finish_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B finish_before A
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="finish_before",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_b.id), str(issue_a.id), str(issue_b.id)]

    def test_implemented_by_cycle(self, project_1):
        """
        Test cycle detection for implemented_by relation type.
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A implemented_by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="implemented_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B implemented_by A
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="implemented_by",
        )

        assert cycle_path is not None
        assert cycle_path == [str(issue_b.id), str(issue_a.id), str(issue_b.id)]

    def test_duplicate_type_no_cycle(self, project_1):
        """
        Test AC2.6: Duplicate type (symmetric) doesn't participate in cycle detection.
        """
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create A is duplicate of B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="duplicate",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Try to create B is blocked by A
        # Should NOT detect a cycle because duplicate is not in dependency types
        cycle_path = detect_dependency_cycle(
            source_issue_id=str(issue_b.id),
            target_issue_id=str(issue_a.id),
            relation_type="blocked_by",
        )

        assert cycle_path is None
