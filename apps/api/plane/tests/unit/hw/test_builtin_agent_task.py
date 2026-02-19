# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from plane.bgtasks.agent_lifecycle_task import detect_stale_agent_runs
from plane.bgtasks.builtin_agent_task import builtin_agent_execute_task
from plane.db.models import Issue, IssueComment, Project, ProjectMember, State, User, WorkspaceMember
from plane.hw.models import (
    AgentActivityType,
    AgentConversation,
    AgentConversationMessage,
    AgentConversationMessageRole,
    AgentProfile,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentType,
)
from plane.tests.factories import (
    AgentProfileFactory,
    AgentRunFactory,
    IssueFactory,
    ProjectFactory,
    UserFactory,
    WorkspaceFactory,
)


@pytest.fixture
def builtin_agent_profile(workspace, create_user):
    """Create a builtin agent profile for testing."""
    bot_user = User.objects.create(
        username="builtin_test_agent_bot",
        email="builtin_test_agent_bot@agent.internal",
        display_name="Test Builtin Agent",
        is_bot=True,
        bot_type="AGENT",
    )
    # Create WorkspaceMember for the bot user (required for permission checks)
    WorkspaceMember.objects.create(
        workspace=workspace,
        member=bot_user,
        role=20,  # Admin role
        is_active=True,
    )
    agent = AgentProfile.objects.create(
        user=bot_user,
        workspace=workspace,
        display_name="Test Builtin Agent",
        agent_type=AgentType.BUILTIN,
    )
    return agent


@pytest.fixture
def project_with_issue(workspace, create_user):
    """Create a test project and issue in the workspace."""
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
    state = State.objects.filter(project=proj).first()
    if not state:
        state = State.objects.create(
            name="Todo",
            project=proj,
            workspace=workspace,
            group="backlog",
        )
    issue = Issue.objects.create(
        name="Test Issue",
        project=proj,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )
    return proj, issue


@pytest.mark.unit
class TestBuiltinAgentTaskActivityCreation:
    """Test AC4.2: Activity creation order and types."""

    def test_activity_creation_with_reasoning_content(
        self, workspace, create_user, builtin_agent_profile, project_with_issue
    ):
        """AC4.2: Activities created in order: thought (reasoning) → action (code) → response."""
        proj, issue = project_with_issue

        # Create a run
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            project=proj,
            issue=issue,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        # Mock LLM response with reasoning content and code block
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = "I need to understand the issue first"
        mock_llm_response.content = """Here's a solution:

```typescript
console.log("Issue resolved");
output("The issue has been fixed");
```
"""

        # Mock SandboxExecutor to return success
        mock_sandbox_result = MagicMock()
        mock_sandbox_result.timed_out = False
        mock_sandbox_result.error = None
        mock_sandbox_result.output = "The issue has been fixed"

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            # Setup LLM config mock
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            # Setup LLM client mock
            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            # Setup sandbox executor mock
            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = mock_sandbox_result
            mock_sandbox_class.return_value = mock_sandbox

            # Execute the task
            builtin_agent_execute_task(run.id, "conversation", "Fix the issue")

        # Verify activities were created in order
        activities = AgentRunActivity.objects.filter(run=run).order_by("created_at")
        assert activities.count() == 3

        # Check activity types and content
        thought_activity = activities[0]
        assert thought_activity.activity_type == AgentActivityType.THOUGHT
        assert thought_activity.content == "I need to understand the issue first"

        action_activity = activities[1]
        assert action_activity.activity_type == AgentActivityType.ACTION
        assert "console.log" in action_activity.content

        response_activity = activities[2]
        assert response_activity.activity_type == AgentActivityType.RESPONSE
        assert response_activity.content == "The issue has been fixed"

    @pytest.mark.django_db
    def test_activity_creation_without_reasoning(
        self, workspace, create_user, builtin_agent_profile, project_with_issue
    ):
        """AC4.2: Without reasoning content, skip thought activity."""
        proj, issue = project_with_issue

        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            project=proj,
            issue=issue,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        # Mock LLM response without reasoning content
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = """```typescript
output("Done");
```"""

        mock_sandbox_result = MagicMock()
        mock_sandbox_result.timed_out = False
        mock_sandbox_result.error = None
        mock_sandbox_result.output = "Done"

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")
            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = mock_sandbox_result
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "conversation", "Do something")

        # Verify only action and response activities (no thought)
        activities = AgentRunActivity.objects.filter(run=run).order_by("created_at")
        assert activities.count() == 2
        assert activities[0].activity_type == AgentActivityType.ACTION
        assert activities[1].activity_type == AgentActivityType.RESPONSE


@pytest.mark.unit
class TestBuiltinAgentTaskIssueCommentCreation:
    """Test AC4.3: IssueComment auto-creation for issue-scoped runs."""

    @pytest.mark.django_db
    def test_issue_comment_auto_created_for_issue_scoped_run(
        self, workspace, create_user, builtin_agent_profile, project_with_issue
    ):
        """AC4.3: Response activity auto-creates IssueComment when run.issue_id is set."""
        proj, issue = project_with_issue

        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            project=proj,
            issue=issue,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        response_text = "I fixed the bug by updating line 42"
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = response_text

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")
            mock_llm_client = MagicMock()
            mock_llm_response_obj = MagicMock()
            mock_llm_response_obj.reasoning_content = None
            mock_llm_response_obj.content = response_text
            mock_llm_client.call.return_value = mock_llm_response_obj
            mock_llm_client_class.return_value = mock_llm_client

            builtin_agent_execute_task(run.id, "mention", response_text)

        # Verify IssueComment was created
        comments = IssueComment.objects.filter(issue=issue)
        assert comments.count() == 1

        comment = comments.first()
        assert comment.external_source == "agent"
        assert builtin_agent_profile.user.id == comment.actor.id
        assert response_text in comment.comment_html

    @pytest.mark.django_db
    def test_no_issue_comment_for_conversation_scoped_run(self, workspace, create_user, builtin_agent_profile):
        """AC4.3: No IssueComment created when run.issue_id is None."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
            issue=None,  # No issue scoping
        )

        response_text = "Here's a summary of the workspace"
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = response_text

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")
            mock_llm_client = MagicMock()
            mock_llm_response_obj = MagicMock()
            mock_llm_response_obj.reasoning_content = None
            mock_llm_response_obj.content = response_text
            mock_llm_client.call.return_value = mock_llm_response_obj
            mock_llm_client_class.return_value = mock_llm_client

            builtin_agent_execute_task(run.id, "conversation", response_text)

        # Verify no IssueComment was created
        assert IssueComment.objects.count() == 0


@pytest.mark.unit
class TestBuiltinAgentTaskSandboxTimeout:
    """Test AC4.7: Sandbox timeout handling."""

    @pytest.mark.django_db
    def test_sandbox_timeout_marks_run_failed_and_creates_error_activity(
        self, workspace, create_user, builtin_agent_profile
    ):
        """AC4.7: Sandbox timeout transitions run to failed and creates error activity."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = """```typescript
// This will timeout
while(true) { }
```"""

        # Mock SandboxExecutor to report timeout
        mock_sandbox_result = MagicMock()
        mock_sandbox_result.timed_out = True
        mock_sandbox_result.error = None
        mock_sandbox_result.output = ""

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_response_obj = MagicMock()
            mock_llm_response_obj.reasoning_content = None
            mock_llm_response_obj.content = mock_llm_response.content
            mock_llm_client.call.return_value = mock_llm_response_obj
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = mock_sandbox_result
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "conversation", "Run some code")

        # Verify run is marked failed
        run.refresh_from_db()
        assert run.status == AgentRunStatus.FAILED
        assert run.completed_at is not None

        # Verify error activity was created
        error_activities = AgentRunActivity.objects.filter(run=run, activity_type=AgentActivityType.ERROR)
        assert error_activities.count() == 1
        assert "timed out" in error_activities.first().content.lower()


@pytest.mark.unit
class TestBuiltinAgentTaskSandboxError:
    """Test sandbox error handling and retry behaviour."""

    @pytest.mark.django_db
    def test_sandbox_error_retries_and_eventually_fails(
        self, workspace, create_user, builtin_agent_profile
    ):
        """Sandbox errors trigger retries; after MAX_SANDBOX_ATTEMPTS the run fails."""
        from plane.bgtasks.builtin_agent_task import MAX_SANDBOX_ATTEMPTS

        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = """```typescript
throw new Error("Invalid API call");
```"""

        mock_sandbox_result = MagicMock()
        mock_sandbox_result.timed_out = False
        mock_sandbox_result.error = "RuntimeError: undefined function"
        mock_sandbox_result.output = ""

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = mock_sandbox_result
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "conversation", "Run some code")

        run.refresh_from_db()
        assert run.status == AgentRunStatus.FAILED
        assert run.completed_at is not None

        # One ERROR activity per attempt
        error_activities = AgentRunActivity.objects.filter(
            run=run, activity_type=AgentActivityType.ERROR
        )
        assert error_activities.count() == MAX_SANDBOX_ATTEMPTS

        # LLM was called once per attempt
        assert mock_llm_client.call.call_count == MAX_SANDBOX_ATTEMPTS

    @pytest.mark.django_db
    def test_sandbox_error_retry_succeeds_on_second_attempt(
        self, workspace, create_user, builtin_agent_profile
    ):
        """When sandbox fails on first attempt but succeeds on retry, run completes."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        code_response = MagicMock()
        code_response.reasoning_content = None
        code_response.content = '```typescript\noutput("hello");\n```'

        error_result = MagicMock()
        error_result.timed_out = False
        error_result.error = "SyntaxError: unexpected token"
        error_result.output = ""

        success_result = MagicMock()
        success_result.timed_out = False
        success_result.error = None
        success_result.output = "hello"

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = code_response
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.side_effect = [error_result, success_result]
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "conversation", "Do something")

        run.refresh_from_db()
        assert run.status == AgentRunStatus.COMPLETED

        # 2 LLM calls (original + 1 retry)
        assert mock_llm_client.call.call_count == 2

        # 1 ERROR from first attempt, then success
        error_activities = AgentRunActivity.objects.filter(
            run=run, activity_type=AgentActivityType.ERROR
        )
        assert error_activities.count() == 1

        # 2 ACTION activities (one per attempt) + 1 RESPONSE
        action_activities = AgentRunActivity.objects.filter(
            run=run, activity_type=AgentActivityType.ACTION
        )
        assert action_activities.count() == 2

        response_activities = AgentRunActivity.objects.filter(
            run=run, activity_type=AgentActivityType.RESPONSE
        )
        assert response_activities.count() == 1
        assert response_activities.first().content == "hello"

    @pytest.mark.django_db
    def test_sandbox_error_retry_falls_back_to_plain_text(
        self, workspace, create_user, builtin_agent_profile
    ):
        """When sandbox fails and LLM responds with plain text on retry, run completes."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        code_response = MagicMock()
        code_response.reasoning_content = None
        code_response.content = '```typescript\noutput("hello");\n```'

        text_response = MagicMock()
        text_response.reasoning_content = None
        text_response.content = "Sorry, I was unable to execute the code. Here is my answer instead."

        error_result = MagicMock()
        error_result.timed_out = False
        error_result.error = "SyntaxError: unexpected token"
        error_result.output = ""

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.side_effect = [code_response, text_response]
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = error_result
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "conversation", "Do something")

        run.refresh_from_db()
        assert run.status == AgentRunStatus.COMPLETED

        # LLM called twice: code response, then plain text
        assert mock_llm_client.call.call_count == 2
        # Sandbox only called once (second LLM response had no code block)
        assert mock_sandbox.execute.call_count == 1

        response_activities = AgentRunActivity.objects.filter(
            run=run, activity_type=AgentActivityType.RESPONSE
        )
        assert response_activities.count() == 1
        assert "unable to execute" in response_activities.first().content


@pytest.mark.unit
class TestBuiltinAgentTaskStaleDetection:
    """Test AC4.9: Stale detection for built-in agent runs."""

    @pytest.mark.django_db
    def test_stale_detection_with_conversation_fk(self, workspace, create_user, builtin_agent_profile):
        """AC4.9: Stale detection correctly marks built-in agent runs even with conversation FK."""
        # Create a conversation for the run
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=create_user,
        )

        # Create a run in_progress with conversation scoping
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            conversation=conversation,
            status=AgentRunStatus.IN_PROGRESS,
            stale_timeout=300,  # 5 minutes
            created_by=create_user,
        )

        # Set last_activity_at to 6 minutes ago
        run.last_activity_at = timezone.now() - timedelta(minutes=6)
        run.save()

        # Call the stale detection task
        detect_stale_agent_runs()

        # Verify the run is now marked stale
        run.refresh_from_db()
        assert run.status == AgentRunStatus.STALE

    @pytest.mark.django_db
    def test_stale_detection_without_conversation_fk(self, workspace, create_user, builtin_agent_profile):
        """Stale detection works for runs without conversation FK."""
        # Create a run without conversation
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.IN_PROGRESS,
            stale_timeout=300,
            created_by=create_user,
        )

        run.last_activity_at = timezone.now() - timedelta(minutes=6)
        run.save()

        detect_stale_agent_runs()

        run.refresh_from_db()
        assert run.status == AgentRunStatus.STALE


@pytest.mark.unit
class TestBuiltinAgentTaskIntegration:
    """Test AC4.1: Full integration loop."""

    @pytest.mark.django_db
    def test_full_execution_loop_with_code_and_sandbox(
        self, workspace, create_user, builtin_agent_profile, project_with_issue
    ):
        """AC4.1: LLM response → sandbox execution → activity creation → run completion."""
        proj, issue = project_with_issue

        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            project=proj,
            issue=issue,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        # Build a realistic flow
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = "Let me analyze the issue"
        mock_llm_response.content = """Based on my analysis, here's the fix:

```typescript
const result = await callTool("update_issue", {
  issue_id: "issue-123",
  status: "completed"
});
output(result.message);
```
"""

        mock_sandbox_result = MagicMock()
        mock_sandbox_result.timed_out = False
        mock_sandbox_result.error = None
        mock_sandbox_result.output = "Issue updated successfully"

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.SandboxExecutor") as mock_sandbox_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            mock_sandbox = MagicMock()
            mock_sandbox.execute.return_value = mock_sandbox_result
            mock_sandbox_class.return_value = mock_sandbox

            builtin_agent_execute_task(run.id, "mention", "Please fix this issue")

        # Verify run is completed
        run.refresh_from_db()
        assert run.status == AgentRunStatus.COMPLETED
        assert run.completed_at is not None

        # Verify activities were created
        activities = list(AgentRunActivity.objects.filter(run=run).order_by("created_at"))
        assert len(activities) == 3
        assert activities[0].activity_type == AgentActivityType.THOUGHT
        assert activities[1].activity_type == AgentActivityType.ACTION
        assert activities[2].activity_type == AgentActivityType.RESPONSE

        # Verify IssueComment was created
        assert IssueComment.objects.filter(issue=issue).count() == 1

    @pytest.mark.django_db
    def test_direct_text_response_without_code_block(self, workspace, create_user, builtin_agent_profile):
        """When LLM returns text without code block, create response activity directly."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        response_text = "I don't have enough information to execute this request. Can you provide more details?"
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = response_text

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):
            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            builtin_agent_execute_task(run.id, "conversation", "Can you do X?")

        # Verify run is completed
        run.refresh_from_db()
        assert run.status == AgentRunStatus.COMPLETED

        # Verify only response activity (no action since no code block)
        activities = list(AgentRunActivity.objects.filter(run=run).order_by("created_at"))
        assert len(activities) == 1
        assert activities[0].activity_type == AgentActivityType.RESPONSE
        assert activities[0].content == response_text

    @pytest.mark.django_db
    def test_missing_llm_config_creates_error(self, workspace, create_user, builtin_agent_profile):
        """When LLM config is missing, create error activity and fail run."""
        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        with patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config:
            # Return empty config
            mock_get_config.return_value = (None, None, None, "")

            builtin_agent_execute_task(run.id, "conversation", "Do something")

        # Verify run is marked failed
        run.refresh_from_db()
        assert run.status == AgentRunStatus.FAILED

        # Verify error activity
        error_activities = AgentRunActivity.objects.filter(run=run, activity_type=AgentActivityType.ERROR)
        assert error_activities.count() == 1
        assert "configuration missing" in error_activities.first().content.lower()

    @pytest.mark.django_db
    def test_multi_turn_conversation_message_creation(self, workspace, create_user, builtin_agent_profile):
        """When run is conversation-scoped, assistant response creates conversation message."""
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=create_user,
        )

        run = AgentRun.objects.create(
            agent=builtin_agent_profile,
            workspace=workspace,
            conversation=conversation,
            status=AgentRunStatus.CREATED,
            created_by=create_user,
        )

        response_text = "I've analyzed your question and here's my response"
        mock_llm_response = MagicMock()
        mock_llm_response.reasoning_content = None
        mock_llm_response.content = response_text

        with (
            patch("plane.bgtasks.builtin_agent_task.AgentLLMClient") as mock_llm_client_class,
            patch("plane.bgtasks.builtin_agent_task.get_llm_config") as mock_get_config,
        ):

            mock_get_config.return_value = ("test-key", "test-model", "anthropic", "")

            mock_llm_client = MagicMock()
            mock_llm_client.call.return_value = mock_llm_response
            mock_llm_client_class.return_value = mock_llm_client

            builtin_agent_execute_task(run.id, "conversation", "What is Plane?")

        # Verify assistant conversation message was created
        assistant_messages = AgentConversationMessage.objects.filter(
            conversation=conversation,
            role=AgentConversationMessageRole.ASSISTANT,
        )
        assert assistant_messages.count() == 1
        assert assistant_messages.first().content == response_text
