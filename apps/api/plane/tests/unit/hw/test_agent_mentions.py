# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Tests for agent mention detection and routing."""

import pytest
from unittest.mock import patch, MagicMock

from plane.hw.models import AgentType
from plane.app.views.issue.comment import _detect_agent_mentions
from plane.tests.factories import (
    WorkspaceFactory,
    ProjectFactory,
    IssueFactory,
    AgentProfileFactory,
)


pytestmark = pytest.mark.unit


@pytest.mark.django_db
class TestDetectAgentMentions:
    """Test agent mention detection and routing."""

    def setup_method(self):
        """Set up test workspace, project, issue, and agents."""
        self.workspace = WorkspaceFactory()
        self.project = ProjectFactory(workspace=self.workspace)
        self.issue = IssueFactory(project=self.project)

        # Create builtin and external agents
        self.builtin_agent = AgentProfileFactory(
            workspace=self.workspace,
            display_name="builtin-agent",
            agent_type=AgentType.BUILTIN,
            is_active=True,
        )
        self.external_agent = AgentProfileFactory(
            workspace=self.workspace,
            display_name="external-agent",
            agent_type=AgentType.EXTERNAL,
            is_active=True,
        )
        self.inactive_agent = AgentProfileFactory(
            workspace=self.workspace,
            display_name="inactive-agent",
            agent_type=AgentType.BUILTIN,
            is_active=False,
        )

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    def test_builtin_agent_mention_dispatches_builtin_task(self, mock_builtin_task):
        """Test that mentioning a builtin agent dispatches builtin execution task."""
        comment_text = "Hey @builtin-agent, can you help?"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify builtin task was dispatched
        assert mock_builtin_task.delay.called
        call_kwargs = mock_builtin_task.delay.call_args[1]
        assert "run_id" in call_kwargs
        assert call_kwargs["trigger_type"] == "mention"
        assert call_kwargs["user_message"] == comment_text

    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_external_agent_mention_dispatches_webhook_task(self, mock_webhook_task):
        """Test that mentioning an external agent dispatches webhook task."""
        comment_text = "Hey @external-agent, check this out"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify webhook task was dispatched
        assert mock_webhook_task.delay.called
        call_kwargs = mock_webhook_task.delay.call_args[1]
        assert "run_id" in call_kwargs
        assert "agent_profile_id" in call_kwargs
        assert call_kwargs["event_type"] == "issue_comment.mention"
        assert call_kwargs["event_data"]["comment_text"] == comment_text
        assert call_kwargs["event_data"]["mentioned_agent"] == "external-agent"

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_both_agents_mentioned_both_tasks_dispatched(
        self, mock_webhook_task, mock_builtin_task
    ):
        """Test that mentioning both agents dispatches both tasks."""
        comment_text = "Hey @builtin-agent and @external-agent"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify both tasks were dispatched
        assert mock_builtin_task.delay.called
        assert mock_webhook_task.delay.called

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_inactive_agent_mention_no_task_dispatched(
        self, mock_webhook_task, mock_builtin_task
    ):
        """Test that mentioning an inactive agent does not dispatch any tasks."""
        comment_text = "Hey @inactive-agent"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify no tasks were dispatched
        assert not mock_builtin_task.delay.called
        assert not mock_webhook_task.delay.called

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_no_agent_mentions_no_tasks_dispatched(
        self, mock_webhook_task, mock_builtin_task
    ):
        """Test that a comment with no agent mentions does not dispatch any tasks."""
        comment_text = "Just a regular comment with no mentions"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify no tasks were dispatched
        assert not mock_builtin_task.delay.called
        assert not mock_webhook_task.delay.called

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_nonexistent_agent_mention_no_task_dispatched(
        self, mock_webhook_task, mock_builtin_task
    ):
        """Test that mentioning a nonexistent agent does not dispatch any tasks."""
        comment_text = "Hey @nonexistent-agent"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify no tasks were dispatched
        assert not mock_builtin_task.delay.called
        assert not mock_webhook_task.delay.called

    @patch("plane.app.views.issue.comment.builtin_agent_execute_task")
    def test_builtin_agent_run_created_with_correct_metadata(self, mock_builtin_task):
        """Test that AgentRun is created with correct trigger metadata."""
        from plane.hw.models import AgentRun, AgentRunStatus

        comment_text = "Hey @builtin-agent"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify AgentRun was created
        run = AgentRun.objects.get(agent=self.builtin_agent)
        assert run.workspace == self.workspace
        assert run.project_id == self.project.id
        assert run.issue_id == self.issue.id
        assert run.status == AgentRunStatus.CREATED
        assert run.trigger_metadata["trigger"] == "mention"
        assert run.trigger_metadata["comment_text"] == comment_text

    @patch("plane.app.views.issue.comment.agent_webhook_send_task")
    def test_external_agent_run_created_with_correct_metadata(self, mock_webhook_task):
        """Test that AgentRun is created correctly for external agent."""
        from plane.hw.models import AgentRun, AgentRunStatus

        comment_text = "Hey @external-agent"

        _detect_agent_mentions(
            comment_text=comment_text,
            workspace_slug=self.workspace.slug,
            project_id=str(self.project.id),
            issue_id=str(self.issue.id),
            current_site="example.com",
        )

        # Verify AgentRun was created
        run = AgentRun.objects.get(agent=self.external_agent)
        assert run.workspace == self.workspace
        assert run.project_id == self.project.id
        assert run.issue_id == self.issue.id
        assert run.status == AgentRunStatus.CREATED
        assert run.trigger_metadata["trigger"] == "mention"
        assert run.trigger_metadata["comment_text"] == comment_text
