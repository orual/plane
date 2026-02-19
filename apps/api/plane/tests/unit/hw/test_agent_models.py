# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.hw.models import (
    AgentProfile,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
    AgentType,
    AgentConversation,
    AgentConversationMessage,
    AgentConversationMessageRole,
)
from plane.tests.factories import (
    UserFactory,
    WorkspaceFactory,
    ProjectFactory,
    IssueFactory,
    AgentProfileFactory,
    AgentRunFactory,
)


@pytest.mark.unit
class TestAgentProfile:
    """Test AgentProfile model creation and field storage."""

    @pytest.mark.django_db
    def test_agent_profile_creation(self):
        """Verify AgentProfile can be created with required fields."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="Test Agent",
            webhook_url="https://example.com/webhook",
            webhook_secret="secret-key-123",
            event_triggers={"issues": ["created", "updated"]},
        )
        assert agent.id is not None
        assert agent.user == user
        assert agent.workspace == workspace

    @pytest.mark.django_db
    def test_agent_profile_field_storage(self):
        """Verify hw-ai-infra.AC7.3: webhook_url, webhook_secret, and event_triggers persist and are retrievable."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        webhook_url = "https://webhook.example.com/api/v1/hook"
        webhook_secret = "supersecret123"
        event_triggers = {"issues": ["created", "updated"], "workspace": ["member_added"]}

        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="Webhook Agent",
            webhook_url=webhook_url,
            webhook_secret=webhook_secret,
            event_triggers=event_triggers,
        )

        # Retrieve and verify all fields persist
        retrieved = AgentProfile.objects.get(id=agent.id)
        assert retrieved.webhook_url == webhook_url
        assert retrieved.webhook_secret == webhook_secret
        assert retrieved.event_triggers == event_triggers

    @pytest.mark.django_db
    def test_agent_profile_default_values(self):
        """Verify AgentProfile defaults are set correctly."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="Agent Defaults",
        )
        assert agent.is_active is True
        assert agent.webhook_url == ""
        assert agent.webhook_secret == ""
        assert agent.event_triggers == {}
        assert agent.description == ""

    @pytest.mark.django_db
    def test_agent_profile_workspace_scoping(self):
        """Verify agents are properly scoped to workspaces."""
        user1 = UserFactory()
        user2 = UserFactory()
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()

        agent1 = AgentProfile.objects.create(
            user=user1,
            workspace=workspace1,
            display_name="Agent 1",
        )
        agent2 = AgentProfile.objects.create(
            user=user2,
            workspace=workspace2,
            display_name="Agent 2",
        )

        assert AgentProfile.objects.filter(workspace=workspace1).count() == 1
        assert AgentProfile.objects.filter(workspace=workspace2).count() == 1
        assert agent1.workspace != agent2.workspace


@pytest.mark.unit
class TestAgentRun:
    """Test AgentRun model creation and status transitions."""

    @pytest.mark.django_db
    def test_agent_run_creation(self):
        """Verify AgentRun can be created with required fields."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.CREATED,
        )
        assert run.id is not None
        assert run.agent == agent
        assert run.status == AgentRunStatus.CREATED

    @pytest.mark.django_db
    def test_agent_run_default_status(self):
        """Verify AgentRun defaults to CREATED status."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
        )
        assert run.status == AgentRunStatus.CREATED

    @pytest.mark.django_db
    def test_valid_transition_created_to_in_progress(self):
        """Verify hw-ai-infra.AC8.1: created -> in_progress transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.CREATED,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.IN_PROGRESS)

    @pytest.mark.django_db
    def test_valid_transition_in_progress_to_completed(self):
        """Verify hw-ai-infra.AC8.1: in_progress -> completed transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.IN_PROGRESS,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.COMPLETED)

    @pytest.mark.django_db
    def test_valid_transition_created_to_failed(self):
        """Verify hw-ai-infra.AC8.2: created -> failed transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.CREATED,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.FAILED)

    @pytest.mark.django_db
    def test_valid_transition_in_progress_to_failed(self):
        """Verify hw-ai-infra.AC8.2: in_progress -> failed transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.IN_PROGRESS,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.FAILED)

    @pytest.mark.django_db
    def test_valid_transition_created_to_stopped(self):
        """Verify hw-ai-infra.AC8.2: created -> stopped transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.CREATED,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.STOPPED)

    @pytest.mark.django_db
    def test_valid_transition_in_progress_to_stopped(self):
        """Verify hw-ai-infra.AC8.2: in_progress -> stopped transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.IN_PROGRESS,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.STOPPED)

    @pytest.mark.django_db
    def test_valid_transition_in_progress_to_stale(self):
        """Verify in_progress -> stale transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.IN_PROGRESS,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.STALE)

    @pytest.mark.django_db
    def test_valid_transition_stale_to_in_progress(self):
        """Verify stale -> in_progress transition succeeds."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.STALE,
        )
        # Should not raise
        run.validate_transition(AgentRunStatus.IN_PROGRESS)

    @pytest.mark.django_db
    def test_invalid_transition_completed_to_in_progress(self):
        """Verify hw-ai-infra.AC8.5: completed -> in_progress transition raises ValueError."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.COMPLETED,
        )
        with pytest.raises(ValueError):
            run.validate_transition(AgentRunStatus.IN_PROGRESS)

    @pytest.mark.django_db
    def test_invalid_transition_completed_to_any(self):
        """Verify completed status has no valid transitions."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.COMPLETED,
        )
        for status in AgentRunStatus.values:
            if status != AgentRunStatus.COMPLETED:
                with pytest.raises(ValueError):
                    run.validate_transition(status)

    @pytest.mark.django_db
    def test_invalid_transition_failed_to_any(self):
        """Verify failed status has no valid transitions."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.FAILED,
        )
        for status in AgentRunStatus.values:
            if status != AgentRunStatus.FAILED:
                with pytest.raises(ValueError):
                    run.validate_transition(status)

    @pytest.mark.django_db
    def test_invalid_transition_stopped_to_any(self):
        """Verify stopped status has no valid transitions."""
        agent = AgentProfileFactory()
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            status=AgentRunStatus.STOPPED,
        )
        for status in AgentRunStatus.values:
            if status != AgentRunStatus.STOPPED:
                with pytest.raises(ValueError):
                    run.validate_transition(status)

    @pytest.mark.django_db
    def test_agent_run_with_project_and_issue(self):
        """Verify AgentRun can be created with optional project and issue."""
        agent = AgentProfileFactory()
        project = ProjectFactory(workspace=agent.workspace)
        issue = IssueFactory(project=project)
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            project=project,
            issue=issue,
        )
        assert run.project == project
        assert run.issue == issue


@pytest.mark.unit
class TestAgentRunActivity:
    """Test AgentRunActivity model and ephemeral auto-setting."""

    @pytest.mark.django_db
    def test_agent_run_activity_creation(self):
        """Verify AgentRunActivity can be created with required fields."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            content="Test response",
        )
        assert activity.id is not None
        assert activity.run == run
        assert activity.activity_type == AgentActivityType.RESPONSE

    @pytest.mark.django_db
    def test_activity_type_thought_sets_ephemeral(self):
        """Verify hw-ai-infra.AC9.1: thought activity type automatically sets is_ephemeral=True."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.THOUGHT,
            content="Thinking...",
        )
        # Retrieve to verify save hook applied
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is True

    @pytest.mark.django_db
    def test_activity_type_action_sets_ephemeral(self):
        """Verify hw-ai-infra.AC9.1: action activity type automatically sets is_ephemeral=True."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.ACTION,
            content="Performing action...",
        )
        # Retrieve to verify save hook applied
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is True

    @pytest.mark.django_db
    def test_activity_type_response_not_ephemeral(self):
        """Verify response activity type does not automatically set is_ephemeral."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            content="Response content",
            is_ephemeral=False,
        )
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is False

    @pytest.mark.django_db
    def test_activity_type_error_not_ephemeral(self):
        """Verify error activity type does not automatically set is_ephemeral."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.ERROR,
            content="Error occurred",
            is_ephemeral=False,
        )
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is False

    @pytest.mark.django_db
    def test_activity_type_elicitation_not_ephemeral(self):
        """Verify elicitation activity type does not automatically set is_ephemeral."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.ELICITATION,
            content="Additional info needed",
            is_ephemeral=False,
        )
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is False

    @pytest.mark.django_db
    def test_activity_preserves_explicit_ephemeral_false(self):
        """Verify explicitly setting is_ephemeral=False on thought/action is overridden by save hook."""
        run = AgentRunFactory()
        # Try to save thought with is_ephemeral=False, should be overridden
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.THOUGHT,
            content="Thought",
            is_ephemeral=False,
        )
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.is_ephemeral is True

    @pytest.mark.django_db
    def test_activity_with_metadata(self):
        """Verify AgentRunActivity can store metadata."""
        run = AgentRunFactory()
        metadata = {"token_count": 150, "model": "gpt-4"}
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            content="Response",
            metadata=metadata,
        )
        retrieved = AgentRunActivity.objects.get(id=activity.id)
        assert retrieved.metadata == metadata

    @pytest.mark.django_db
    def test_activity_default_metadata(self):
        """Verify AgentRunActivity defaults metadata to empty dict."""
        run = AgentRunFactory()
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            content="Response",
        )
        assert activity.metadata == {}


@pytest.mark.unit
class TestAgentType:
    """Test AgentType enum and agent_type field."""

    @pytest.mark.django_db
    def test_agent_type_default_to_external(self):
        """Verify agent-ux.AC6.2: Creating an AgentProfile without specifying agent_type defaults to 'external'."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="Test Agent",
        )
        assert agent.agent_type == AgentType.EXTERNAL

    @pytest.mark.django_db
    def test_agent_type_explicit_external(self):
        """Verify AgentProfile can be created with agent_type='external'."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="External Agent",
            agent_type=AgentType.EXTERNAL,
        )
        assert agent.agent_type == AgentType.EXTERNAL

    @pytest.mark.django_db
    def test_agent_type_builtin(self):
        """Verify agent-ux.AC1.4: A built-in agent profile can be created with agent_type='builtin'."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        agent = AgentProfile.objects.create(
            user=user,
            workspace=workspace,
            display_name="Built-in Agent",
            agent_type=AgentType.BUILTIN,
            is_active=True,
        )
        assert agent.agent_type == AgentType.BUILTIN
        assert agent.is_active is True


@pytest.mark.unit
class TestAgentConversation:
    """Test AgentConversation model."""

    @pytest.mark.django_db
    def test_agent_conversation_creation(self):
        """Verify AgentConversation can be created with workspace and user FKs."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
            title="Test Conversation",
        )
        assert conversation.id is not None
        assert conversation.workspace == workspace
        assert conversation.user == user
        assert conversation.title == "Test Conversation"
        assert conversation.is_active is True

    @pytest.mark.django_db
    def test_agent_conversation_defaults(self):
        """Verify AgentConversation defaults are set correctly."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )
        assert conversation.title == ""
        assert conversation.is_active is True

    @pytest.mark.django_db
    def test_agent_conversation_ordering(self):
        """Verify conversations are ordered by created_at descending."""
        user = UserFactory()
        workspace = WorkspaceFactory()

        # Create conversations in reverse order
        conv1 = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
            title="First",
        )
        conv2 = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
            title="Second",
        )

        # Query all conversations - should be ordered by created_at descending
        conversations = AgentConversation.objects.all()
        assert conversations[0] == conv2  # Most recent first
        assert conversations[1] == conv1

    @pytest.mark.django_db
    def test_agent_conversation_workspace_scoping(self):
        """Verify conversations are properly scoped to workspaces."""
        user1 = UserFactory()
        user2 = UserFactory()
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()

        conv1 = AgentConversation.objects.create(
            workspace=workspace1,
            user=user1,
            title="Conv 1",
        )
        conv2 = AgentConversation.objects.create(
            workspace=workspace2,
            user=user2,
            title="Conv 2",
        )

        assert AgentConversation.objects.filter(workspace=workspace1).count() == 1
        assert AgentConversation.objects.filter(workspace=workspace2).count() == 1
        assert conv1.workspace != conv2.workspace


@pytest.mark.unit
class TestAgentConversationMessage:
    """Test AgentConversationMessage model."""

    @pytest.mark.django_db
    def test_agent_conversation_message_creation(self):
        """Verify AgentConversationMessage can be created with conversation FK, role, and content."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )

        message = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.USER,
            content="Hello, how can you help me?",
        )
        assert message.id is not None
        assert message.conversation == conversation
        assert message.role == AgentConversationMessageRole.USER
        assert message.content == "Hello, how can you help me?"
        assert message.run is None

    @pytest.mark.django_db
    def test_agent_conversation_message_with_run(self):
        """Verify AgentConversationMessage can be created with a nullable run FK."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )
        agent = AgentProfileFactory(workspace=workspace)
        run = AgentRunFactory(agent=agent)

        message = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.ASSISTANT,
            content="I can help you with that!",
            run=run,
        )
        assert message.run == run

    @pytest.mark.django_db
    def test_agent_conversation_message_roles(self):
        """Verify both user and assistant roles work."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )

        user_message = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.USER,
            content="User message",
        )

        assistant_message = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.ASSISTANT,
            content="Assistant response",
        )

        assert user_message.role == AgentConversationMessageRole.USER
        assert assistant_message.role == AgentConversationMessageRole.ASSISTANT

    @pytest.mark.django_db
    def test_agent_conversation_message_ordering(self):
        """Verify conversation messages are ordered by created_at ascending."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )

        # Create messages in reverse order
        msg1 = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.USER,
            content="First message",
        )
        msg2 = AgentConversationMessage.objects.create(
            conversation=conversation,
            role=AgentConversationMessageRole.ASSISTANT,
            content="Second message",
        )

        # Query all messages - should be ordered by created_at ascending
        messages = AgentConversationMessage.objects.filter(conversation=conversation)
        assert messages[0] == msg1  # Oldest first
        assert messages[1] == msg2


@pytest.mark.unit
class TestAgentRunWithConversation:
    """Test AgentRun model with conversation field."""

    @pytest.mark.django_db
    def test_agent_run_with_conversation(self):
        """Verify AgentRun can be created with a nullable conversation FK."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )
        agent = AgentProfileFactory(workspace=workspace)

        run = AgentRun.objects.create(
            agent=agent,
            workspace=workspace,
            conversation=conversation,
        )
        assert run.conversation == conversation

    @pytest.mark.django_db
    def test_agent_run_without_conversation(self):
        """Verify AgentRun can be created without a conversation FK."""
        workspace = WorkspaceFactory()
        agent = AgentProfileFactory(workspace=workspace)

        run = AgentRun.objects.create(
            agent=agent,
            workspace=workspace,
        )
        assert run.conversation is None

    @pytest.mark.django_db
    def test_agent_run_status_transition_with_conversation(self):
        """Verify status transitions still work correctly with the conversation field present."""
        user = UserFactory()
        workspace = WorkspaceFactory()
        conversation = AgentConversation.objects.create(
            workspace=workspace,
            user=user,
        )
        agent = AgentProfileFactory(workspace=workspace)

        run = AgentRun.objects.create(
            agent=agent,
            workspace=workspace,
            conversation=conversation,
            status=AgentRunStatus.CREATED,
        )

        # Test transition to in_progress
        run.validate_transition(AgentRunStatus.IN_PROGRESS)
        run.status = AgentRunStatus.IN_PROGRESS
        run.save()

        # Test transition to completed
        run.validate_transition(AgentRunStatus.COMPLETED)

        # Test invalid transition
        with pytest.raises(ValueError):
            run.validate_transition(AgentRunStatus.CREATED)
