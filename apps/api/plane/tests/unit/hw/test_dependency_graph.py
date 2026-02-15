# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for the dependency graph utilities.

Tests the graph building and traversal functions used by cycle detection
and date propagation services.
"""

import pytest
from unittest.mock import patch

from plane.hw.services.dependency_graph import (
    build_dependency_graph,
    get_downstream_dependents,
    DEPENDENCY_RELATION_TYPES,
    MAX_PROPAGATION_DEPTH,
)
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
class TestBuildDependencyGraph:
    """Test suite for build_dependency_graph function."""

    def test_empty_graph(self, project_1):
        """Test AC5.4: Empty graph when no relations exist."""
        graph = build_dependency_graph()
        assert graph == {}

    def test_single_relation_blocked_by(self, project_1):
        """Test AC5.4: Build graph with single blocked_by relation."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create: issue_a is blocked_by issue_b
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        # Graph should map issue_b (predecessor) -> [(issue_a, "blocked_by")]
        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "blocked_by") in graph[str(issue_b.id)]

    def test_single_relation_start_before(self, project_1):
        """Test AC5.4: Build graph with start_before relation."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create: issue_a is start_before issue_b
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="start_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "start_before") in graph[str(issue_b.id)]

    def test_single_relation_finish_before(self, project_1):
        """Test AC5.4: Build graph with finish_before relation."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create: issue_a is finish_before issue_b
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="finish_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "finish_before") in graph[str(issue_b.id)]

    def test_single_relation_implemented_by(self, project_1):
        """Test AC5.4: Build graph with implemented_by relation."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create: issue_a is implemented_by issue_b
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="implemented_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "implemented_by") in graph[str(issue_b.id)]

    def test_multiple_relations_same_predecessor(self, project_1):
        """Test AC5.4: Multiple dependents from same predecessor."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create: A is blocked_by B, C is blocked_by B
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        # B should have both A and C as dependents
        assert str(issue_b.id) in graph
        assert len(graph[str(issue_b.id)]) == 2
        dependent_ids = [dep[0] for dep in graph[str(issue_b.id)]]
        assert str(issue_a.id) in dependent_ids
        assert str(issue_c.id) in dependent_ids

    def test_chain_abc(self, project_1):
        """Test AC5.4: Chain graph A→B→C."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create chain: A is blocked_by B, B is blocked_by C
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

        graph = build_dependency_graph()

        # C → B → A
        assert str(issue_c.id) in graph
        assert str(issue_b.id) in graph
        assert (str(issue_b.id), "blocked_by") in graph[str(issue_c.id)]
        assert (str(issue_a.id), "blocked_by") in graph[str(issue_b.id)]

    def test_cross_project_relations(self, project_1, project_2):
        """Test AC5.9: Cross-project relations are included in graph."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_2)

        # Create cross-project relation
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        # Cross-project relation should be in graph
        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "blocked_by") in graph[str(issue_b.id)]

    def test_deleted_relations_excluded(self, project_1):
        """Test that deleted relations are excluded from graph."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create relation and mark as deleted
        relation = IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        from django.utils import timezone

        relation.deleted_at = timezone.now()
        relation.save()

        graph = build_dependency_graph()

        # Deleted relation should not be in graph
        assert graph == {}

    def test_symmetric_relations_excluded(self, project_1):
        """Test that symmetric relations (relates_to, duplicate) are excluded."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create symmetric relations (use different pairs to avoid unique constraint)
        IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="relates_to",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="duplicate",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        # Symmetric relations should not be in graph
        assert graph == {}

    def test_issue_ids_filter(self, project_1):
        """Test AC5.4: issue_ids parameter filters the query."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create chain: A is blocked_by B, B is blocked_by C
        rel_ab = IssueRelation.objects.create(
            issue=issue_a,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        rel_bc = IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        # Filter to only relations where issue is A or B
        graph = build_dependency_graph(issue_ids=[str(issue_a.id), str(issue_b.id)])

        # Should only include rel_ab (where issue is A)
        # rel_bc has issue as B, but the filter is on the issue_id in the query
        assert str(issue_b.id) in graph
        assert (str(issue_a.id), "blocked_by") in graph[str(issue_b.id)]


@pytest.mark.unit
@pytest.mark.django_db
class TestGetDownstreamDependents:
    """Test suite for get_downstream_dependents function."""

    def test_no_dependents(self, project_1):
        """Test AC5.4: Return empty list when issue has no dependents."""
        issue_a = IssueFactory(project=project_1)
        graph = {}

        result = get_downstream_dependents(str(issue_a.id), graph)

        assert result == []

    def test_single_dependent(self, project_1):
        """Test AC5.4: Single downstream dependent."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        assert result == [str(issue_b.id)]

    def test_chain_abc_topological_order(self, project_1):
        """Test AC5.4: Multi-hop chain returns topological order."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Chain: A → B → C (in dependency direction)
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        # Result should be [B, C] (topological order)
        assert result == [str(issue_b.id), str(issue_c.id)]

    def test_multiple_branches(self, project_1):
        """Test AC5.4: Multiple branches from root issue."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)

        # Create branches: A → B and A → C
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        # Result should include both B and C
        assert len(result) == 2
        assert str(issue_b.id) in result
        assert str(issue_c.id) in result

    def test_diamond_graph(self, project_1):
        """Test AC5.4: Diamond-shaped dependency graph."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)
        issue_d = IssueFactory(project=project_1)

        # Diamond: A → B,C → D
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_d,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_d,
            related_issue=issue_c,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        # Result should include B, C, D (no duplicates)
        unique_result = set(result)
        assert len(unique_result) == 3
        assert str(issue_b.id) in result
        assert str(issue_c.id) in result
        assert str(issue_d.id) in result

    def test_depth_limit_warning(self, project_1, caplog):
        """Test AC5.10: Depth limit exceeded logs warning."""
        # Create a chain exceeding MAX_PROPAGATION_DEPTH
        issues = [IssueFactory(project=project_1) for _ in range(MAX_PROPAGATION_DEPTH + 5)]

        for i in range(len(issues) - 1):
            IssueRelation.objects.create(
                issue=issues[i + 1],
                related_issue=issues[i],
                relation_type="blocked_by",
                project=project_1,
                workspace=project_1.workspace,
            )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issues[0].id), graph)

        # Should stop at depth limit
        assert len(result) == MAX_PROPAGATION_DEPTH
        # Check that warning was logged
        assert "MAX_PROPAGATION_DEPTH" in caplog.text

    def test_cross_project_traversal(self, project_1, project_2):
        """Test AC5.9: Traversal works across project boundaries."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_2)
        issue_c = IssueFactory(project=project_1)

        # A → B → C (cross-project)
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_b,
            relation_type="blocked_by",
            project=project_2,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        # Should traverse across projects
        assert str(issue_b.id) in result
        assert str(issue_c.id) in result

    def test_start_issue_not_in_graph(self, project_1):
        """Test AC5.4: Start issue not in graph returns empty list."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)

        # Create relation but don't include issue_a as start
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()

        # Query for a different issue not in chain
        issue_c = IssueFactory(project=project_1)
        result = get_downstream_dependents(str(issue_c.id), graph)

        assert result == []

    def test_different_relation_types_included(self, project_1):
        """Test AC5.4: All dependency relation types are traversed."""
        issue_a = IssueFactory(project=project_1)
        issue_b = IssueFactory(project=project_1)
        issue_c = IssueFactory(project=project_1)
        issue_d = IssueFactory(project=project_1)

        # Create different relation types from same predecessor
        IssueRelation.objects.create(
            issue=issue_b,
            related_issue=issue_a,
            relation_type="blocked_by",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_c,
            related_issue=issue_a,
            relation_type="start_before",
            project=project_1,
            workspace=project_1.workspace,
        )
        IssueRelation.objects.create(
            issue=issue_d,
            related_issue=issue_a,
            relation_type="finish_before",
            project=project_1,
            workspace=project_1.workspace,
        )

        graph = build_dependency_graph()
        result = get_downstream_dependents(str(issue_a.id), graph)

        # All three should be included
        assert len(result) == 3
        assert str(issue_b.id) in result
        assert str(issue_c.id) in result
        assert str(issue_d.id) in result
