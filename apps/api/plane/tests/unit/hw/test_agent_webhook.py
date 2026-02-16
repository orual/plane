# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac
import json
from unittest.mock import patch, MagicMock

import pytest
import requests
from django.core.serializers.json import DjangoJSONEncoder

from plane.app.views.issue.comment import _detect_agent_mentions
from plane.bgtasks.agent_webhook_task import agent_webhook_send_task
from plane.hw.models import AgentProfile, AgentRun, AgentRunStatus
from plane.tests.factories import (
    AgentProfileFactory,
    ProjectFactory,
    IssueFactory,
    WorkspaceFactory,
)


@pytest.mark.unit
class TestAgentWebhookTask:
    """Test agent webhook delivery task (hw-ai-infra.AC10.2, AC10.3, AC10.4, AC10.5)."""

    @pytest.mark.django_db
    def test_agent_webhook_task_sends_hmac_signature(self):
        """Verify hw-ai-infra.AC10.2: webhook includes X-Plane-Signature header with HMAC-SHA256."""
        agent = AgentProfileFactory(
            webhook_url="https://example.com/webhook",
            webhook_secret="test-secret-key",
            is_active=True,
        )
        run_id = "test-run-id"
        event_type = "issue_comment.mention"
        event_data = {"test": "data"}

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id=run_id,
                event_type=event_type,
                event_data=event_data,
                current_site="https://example.com",
            )

            assert mock_post.called
            call_kwargs = mock_post.call_args[1]

            assert "X-Plane-Signature" in call_kwargs["headers"]

            payload = {
                "event": event_type,
                "action": "created",
                "agent_id": str(agent.id),
                "workspace_id": str(agent.workspace_id),
                "run_id": run_id,
                "data": event_data,
            }
            expected_signature = hmac.new(
                agent.webhook_secret.encode("utf-8"),
                json.dumps(payload, cls=DjangoJSONEncoder).encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()

            assert call_kwargs["headers"]["X-Plane-Signature"] == expected_signature

    @pytest.mark.django_db
    def test_agent_webhook_task_includes_run_id(self):
        """Verify hw-ai-infra.AC10.3: webhook payload contains the pre-created AgentRun ID."""
        agent = AgentProfileFactory(
            webhook_url="https://example.com/webhook",
            is_active=True,
        )
        run_id = "test-run-12345"

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id=run_id,
                event_type="issue_comment.mention",
                event_data={"test": "data"},
                current_site="https://example.com",
            )

            assert mock_post.called
            call_kwargs = mock_post.call_args[1]

            payload = call_kwargs["json"]
            assert payload["run_id"] == run_id

    def test_agent_webhook_task_decorator_has_retry_config(self):
        """Verify hw-ai-infra.AC10.4: task is decorated with retry config (600s backoff, 5 max retries)."""
        assert agent_webhook_send_task.autoretry_for == (requests.RequestException,)
        assert agent_webhook_send_task.retry_backoff == 600
        assert agent_webhook_send_task.max_retries == 5
        assert agent_webhook_send_task.retry_jitter is True

    @pytest.mark.django_db
    def test_agent_webhook_task_deactivates_agent_on_max_retries(self):
        """Verify hw-ai-infra.AC10.5: agent is deactivated after max retries exceeded."""
        agent = AgentProfileFactory(
            webhook_url="https://example.com/webhook",
            is_active=True,
        )

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.side_effect = requests.RequestException("Connection failed")

            # Use apply() with retries kwarg to simulate max retries reached.
            # apply() executes the task inline and lets us set request context.
            result = agent_webhook_send_task.apply(
                kwargs={
                    "agent_profile_id": str(agent.id),
                    "run_id": "test-run-id",
                    "event_type": "issue_comment.mention",
                    "event_data": {"test": "data"},
                    "current_site": "https://example.com",
                },
                retries=5,
            )
            # apply() runs synchronously; any exception is stored in result
            # The task catches RequestException at max retries and deactivates,
            # so it should succeed (return None) rather than re-raise.
            refreshed_agent = AgentProfile.objects.get(id=agent.id)
            assert refreshed_agent.is_active is False

    @pytest.mark.django_db
    def test_agent_webhook_task_skips_inactive_agent(self):
        """Verify inactive agents are not contacted."""
        agent = AgentProfileFactory(
            webhook_url="https://example.com/webhook",
            is_active=False,
        )

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id="test-run-id",
                event_type="issue_comment.mention",
                event_data={"test": "data"},
                current_site="https://example.com",
            )

            assert not mock_post.called

    @pytest.mark.django_db
    def test_agent_webhook_task_includes_required_headers(self):
        """Verify webhook request includes all required headers."""
        agent = AgentProfileFactory(is_active=True)

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id="test-run-id",
                event_type="issue_comment.mention",
                event_data={"test": "data"},
                current_site="https://example.com",
            )

            call_kwargs = mock_post.call_args[1]
            headers = call_kwargs["headers"]

            assert headers["Content-Type"] == "application/json"
            assert headers["User-Agent"] == "Autopilot"
            assert "X-Plane-Delivery" in headers
            assert headers["X-Plane-Event"] == "issue_comment.mention"

    @pytest.mark.django_db
    def test_agent_webhook_task_uses_30_second_timeout(self):
        """Verify webhook request uses 30-second timeout."""
        agent = AgentProfileFactory(is_active=True)

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id="test-run-id",
                event_type="issue_comment.mention",
                event_data={"test": "data"},
                current_site="https://example.com",
            )

            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["timeout"] == 30

    @pytest.mark.django_db
    def test_agent_webhook_task_payload_structure(self):
        """Verify webhook payload has correct structure."""
        agent = AgentProfileFactory(is_active=True)
        event_type = "issue_comment.mention"
        event_data = {"workspace_slug": "test", "issue_id": "123"}

        with patch("plane.bgtasks.agent_webhook_task.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            agent_webhook_send_task(
                agent_profile_id=str(agent.id),
                run_id="test-run-id",
                event_type=event_type,
                event_data=event_data,
                current_site="https://example.com",
            )

            call_kwargs = mock_post.call_args[1]
            payload = call_kwargs["json"]

            assert payload["event"] == event_type
            assert payload["action"] == "created"
            assert payload["agent_id"] == str(agent.id)
            assert payload["workspace_id"] == str(agent.workspace_id)
            assert payload["run_id"] == "test-run-id"
            assert payload["data"] == event_data


@pytest.mark.unit
class TestAgentMentionDetection:
    """Test agent mention detection in comments (hw-ai-infra.AC10.1, AC10.3, AC10.6)."""

    @pytest.mark.django_db
    def test_detect_agent_mentions_dispatches_webhook_for_matching_agent(self):
        """Verify hw-ai-infra.AC10.1: comment with @agent-name triggers webhook for active agent."""
        workspace = WorkspaceFactory()
        _agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="Hey @myagent, can you help?",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert mock_delay.called

    @pytest.mark.django_db
    def test_detect_agent_mentions_creates_agent_run(self):
        """Verify hw-ai-infra.AC10.3: mention creates pre-created AgentRun."""
        workspace = WorkspaceFactory()
        agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay"):
            _detect_agent_mentions(
                comment_text="Hey @myagent, can you help?",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            run = AgentRun.objects.get(agent=agent)
            assert run.status == AgentRunStatus.CREATED
            assert run.issue_id == issue.id
            assert run.project_id == project.id
            assert run.trigger_metadata["trigger"] == "mention"

    @pytest.mark.django_db
    def test_detect_agent_mentions_with_deactivated_agent_does_not_dispatch(self):
        """Verify hw-ai-infra.AC10.6: deactivated agents are excluded from mention detection."""
        workspace = WorkspaceFactory()
        agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=False,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="Hey @myagent, can you help?",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert not mock_delay.called
            assert not AgentRun.objects.filter(agent=agent).exists()

    @pytest.mark.django_db
    def test_detect_agent_mentions_with_no_mentions(self):
        """Verify mention detection handles comments with no mentions."""
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="Just a regular comment with no mentions.",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert not mock_delay.called

    @pytest.mark.django_db
    def test_detect_agent_mentions_multiple_agents(self):
        """Verify mention detection handles multiple agent mentions."""
        workspace = WorkspaceFactory()
        _agent1 = AgentProfileFactory(
            workspace=workspace,
            display_name="agent1",
            is_active=True,
        )
        _agent2 = AgentProfileFactory(
            workspace=workspace,
            display_name="agent2",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="@agent1 and @agent2 please help",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert mock_delay.call_count == 2

    @pytest.mark.django_db
    def test_detect_agent_mentions_ignores_non_agent_mentions(self):
        """Verify mention detection ignores @mentions that don't match agent names."""
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="@john and @alice can you help?",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert not mock_delay.called

    @pytest.mark.django_db
    def test_detect_agent_mentions_mixed_agent_and_non_agent(self):
        """Verify mention detection matches only agents and ignores non-matching mentions."""
        workspace = WorkspaceFactory()
        _agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="@john and @myagent and @alice can help",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert mock_delay.call_count == 1

    @pytest.mark.django_db
    def test_detect_agent_mentions_workspace_scoped(self):
        """Verify mention detection is scoped to the workspace."""
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()
        _agent1 = AgentProfileFactory(
            workspace=workspace1,
            display_name="myagent",
            is_active=True,
        )
        _agent2 = AgentProfileFactory(
            workspace=workspace2,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace1)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="@myagent help please",
                workspace_slug=workspace1.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert mock_delay.call_count == 1

    @pytest.mark.django_db
    def test_detect_agent_mentions_with_hyphens(self):
        """Verify mention detection handles agent names with hyphens."""
        workspace = WorkspaceFactory()
        _agent = AgentProfileFactory(
            workspace=workspace,
            display_name="my-agent-bot",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            _detect_agent_mentions(
                comment_text="@my-agent-bot please help",
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            assert mock_delay.called

    @pytest.mark.django_db
    def test_detect_agent_mentions_payload_structure(self):
        """Verify webhook dispatch includes correct event_data structure."""
        workspace = WorkspaceFactory()
        agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay") as mock_delay:
            comment_text = "Hey @myagent, can you help?"
            _detect_agent_mentions(
                comment_text=comment_text,
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            call_args = mock_delay.call_args
            assert call_args[1]["event_type"] == "issue_comment.mention"
            assert call_args[1]["event_data"]["workspace_slug"] == workspace.slug
            assert call_args[1]["event_data"]["project_id"] == str(project.id)
            assert call_args[1]["event_data"]["issue_id"] == str(issue.id)
            assert call_args[1]["event_data"]["comment_text"] == comment_text
            assert call_args[1]["event_data"]["mentioned_agent"] == agent.display_name

    @pytest.mark.django_db
    def test_detect_agent_mentions_run_trigger_metadata(self):
        """Verify created AgentRun includes trigger metadata."""
        workspace = WorkspaceFactory()
        agent = AgentProfileFactory(
            workspace=workspace,
            display_name="myagent",
            is_active=True,
        )
        project = ProjectFactory(workspace=workspace)
        issue = IssueFactory(project=project)
        comment_text = "Hey @myagent, please investigate this issue."

        with patch("plane.app.views.issue.comment.agent_webhook_send_task.delay"):
            _detect_agent_mentions(
                comment_text=comment_text,
                workspace_slug=workspace.slug,
                project_id=project.id,
                issue_id=issue.id,
                current_site="https://example.com",
            )

            run = AgentRun.objects.get(agent=agent)
            assert run.trigger_metadata["trigger"] == "mention"
            assert run.trigger_metadata["comment_text"] == comment_text
