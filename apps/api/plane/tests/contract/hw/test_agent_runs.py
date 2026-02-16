# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import APIToken, IssueComment, Issue, Project, ProjectMember, State, User, WorkspaceMember
from plane.hw.models import AgentProfile, AgentRun, AgentRunStatus, AgentActivityType


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
def issue(db, workspace, project, create_user):
    """Create a test issue."""
    state = State.objects.filter(project=project).first()
    if not state:
        state = State.objects.create(
            name="Todo",
            project=project,
            workspace=workspace,
            group="backlog",
        )
    return Issue.objects.create(
        name="Test Issue",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )


@pytest.fixture
def agent_profile(db, workspace, create_user):
    """Create an agent profile for testing."""
    bot_user = User.objects.create(
        username="test_agent_bot",
        email="test_agent_bot@agent.internal",
        display_name="Test Agent",
        is_bot=True,
        bot_type="agent",
    )
    agent = AgentProfile.objects.create(
        user=bot_user,
        workspace=workspace,
        display_name="Test Agent",
    )
    return agent


@pytest.fixture
def agent_token(db, agent_profile):
    """Create an API token for the agent."""
    return APIToken.objects.create(
        label="agent-test",
        user=agent_profile.user,
        workspace=agent_profile.workspace,
        user_type=1,
        is_service=True,
    )


@pytest.fixture
def agent_client(api_client, agent_token):
    """Return an authenticated API client using agent token."""
    api_client.credentials(HTTP_X_API_KEY=agent_token.token)
    return api_client


@pytest.mark.contract
class TestAgentRunLifecycle:
    """Contract tests for agent run lifecycle."""

    def get_runs_url(self, workspace_slug):
        """Get the agent runs list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/"

    def get_run_detail_url(self, workspace_slug, run_id):
        """Get the agent run detail endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/{run_id}/"

    def get_activities_url(self, workspace_slug, run_id):
        """Get the agent run activities list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/{run_id}/activities/"

    @pytest.mark.django_db
    def test_ac8_1_run_lifecycle_created_to_completed(self, agent_client, workspace, agent_profile):
        """AC8.1: Run can be created and transitioned: created → in_progress → completed."""
        url = self.get_runs_url(workspace.slug)

        # Create run
        data = {
            "agent_id": str(agent_profile.id),
        }
        response = agent_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == AgentRunStatus.CREATED
        run_id = response.data["id"]

        # Transition to in_progress
        detail_url = self.get_run_detail_url(workspace.slug, run_id)
        update_response = agent_client.patch(
            detail_url, {"status": AgentRunStatus.IN_PROGRESS}, format="json"
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["status"] == AgentRunStatus.IN_PROGRESS

        # Transition to completed
        complete_response = agent_client.patch(
            detail_url, {"status": AgentRunStatus.COMPLETED}, format="json"
        )
        assert complete_response.status_code == status.HTTP_200_OK
        assert complete_response.data["status"] == AgentRunStatus.COMPLETED
        assert complete_response.data["completed_at"] is not None

    @pytest.mark.django_db
    def test_ac8_2_run_can_fail_or_stop(self, agent_client, workspace, agent_profile):
        """AC8.2: Run can transition to failed or stopped."""
        url = self.get_runs_url(workspace.slug)

        # Create run
        data = {
            "agent_id": str(agent_profile.id),
        }
        response = agent_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        run_id = response.data["id"]

        # Transition to failed
        detail_url = self.get_run_detail_url(workspace.slug, run_id)
        fail_response = agent_client.patch(
            detail_url, {"status": AgentRunStatus.FAILED}, format="json"
        )
        assert fail_response.status_code == status.HTTP_200_OK
        assert fail_response.data["status"] == AgentRunStatus.FAILED

        # Create another run to test stopped
        response2 = agent_client.post(url, data, format="json")
        assert response2.status_code == status.HTTP_201_CREATED
        run_id2 = response2.data["id"]

        detail_url2 = self.get_run_detail_url(workspace.slug, run_id2)
        stop_response = agent_client.patch(
            detail_url2, {"status": AgentRunStatus.STOPPED}, format="json"
        )
        assert stop_response.status_code == status.HTTP_200_OK
        assert stop_response.data["status"] == AgentRunStatus.STOPPED

    @pytest.mark.django_db
    def test_ac8_5_invalid_transition_rejected(self, agent_client, workspace, agent_profile):
        """AC8.5: Invalid status transitions are rejected (e.g., completed → in_progress)."""
        url = self.get_runs_url(workspace.slug)

        # Create run and transition to completed
        data = {
            "agent_id": str(agent_profile.id),
        }
        response = agent_client.post(url, data, format="json")
        run_id = response.data["id"]

        detail_url = self.get_run_detail_url(workspace.slug, run_id)

        # First transition to completed
        agent_client.patch(detail_url, {"status": AgentRunStatus.COMPLETED}, format="json")

        # Try invalid transition: completed → in_progress
        invalid_response = agent_client.patch(
            detail_url, {"status": AgentRunStatus.IN_PROGRESS}, format="json"
        )
        assert invalid_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in invalid_response.data or "Cannot transition" in str(invalid_response.data)


@pytest.mark.contract
class TestAgentRunActivities:
    """Contract tests for agent run activities."""

    def get_runs_url(self, workspace_slug):
        """Get the agent runs list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/"

    def get_activities_url(self, workspace_slug, run_id):
        """Get the agent run activities list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/{run_id}/activities/"

    @pytest.mark.django_db
    def test_ac9_1_thought_activity_is_ephemeral(self, agent_client, workspace, agent_profile):
        """AC9.1: Thought activities are stored with is_ephemeral=True."""
        # Create run
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {"agent_id": str(agent_profile.id)}
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post thought activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.THOUGHT,
            "content": "This is a thought",
        }
        response = agent_client.post(activities_url, activity_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_ephemeral"] is True
        assert response.data["activity_type"] == AgentActivityType.THOUGHT

    @pytest.mark.django_db
    def test_ac9_2_response_activity_creates_issue_comment(
        self, agent_client, workspace, agent_profile, project, issue
    ):
        """AC9.2: Response activities auto-create IssueComments with bot user as actor."""
        # Create run linked to issue
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {
            "agent_id": str(agent_profile.id),
            "project_id": str(project.id),
            "issue_id": str(issue.id),
        }
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post response activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.RESPONSE,
            "content": "This is a response to the issue",
        }
        response = agent_client.post(activities_url, activity_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        # Verify IssueComment was created
        comment = IssueComment.objects.filter(issue=issue).first()
        assert comment is not None
        assert comment.comment_stripped == "This is a response to the issue"
        assert comment.actor == agent_profile.user
        assert comment.external_source == "agent"

    @pytest.mark.django_db
    def test_ac9_3_elicitation_activity_stores_metadata(self, agent_client, workspace, agent_profile):
        """AC9.3: Elicitation activities store question and input type in metadata."""
        # Create run
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {"agent_id": str(agent_profile.id)}
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post elicitation activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.ELICITATION,
            "content": "What priority should this issue have?",
            "metadata": {
                "question": "What priority should this issue have?",
                "input_type": "select",
                "options": ["High", "Medium", "Low"],
            },
        }
        response = agent_client.post(activities_url, activity_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["metadata"]["question"] == "What priority should this issue have?"
        assert response.data["metadata"]["input_type"] == "select"
        assert response.data["metadata"]["options"] == ["High", "Medium", "Low"]

    @pytest.mark.django_db
    def test_ac9_4_error_activity_is_stored(self, agent_client, workspace, agent_profile):
        """AC9.4: Error activities are stored and retrievable."""
        # Create run
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {"agent_id": str(agent_profile.id)}
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post error activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.ERROR,
            "content": "An error occurred while processing",
        }
        response = agent_client.post(activities_url, activity_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        # Retrieve activities and verify error is present
        list_response = agent_client.get(activities_url)
        assert list_response.status_code == status.HTTP_200_OK
        error_activities = [a for a in list_response.data if a["activity_type"] == AgentActivityType.ERROR]
        assert len(error_activities) > 0
        assert error_activities[0]["content"] == "An error occurred while processing"

    @pytest.mark.django_db
    def test_ac9_6_response_activity_issue_comment_has_external_ids(
        self, agent_client, workspace, agent_profile, project, issue
    ):
        """AC9.6: IssueComments from response activities have external_source and external_id."""
        # Create run linked to issue
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {
            "agent_id": str(agent_profile.id),
            "project_id": str(project.id),
            "issue_id": str(issue.id),
        }
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post response activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.RESPONSE,
            "content": "Response with tracking",
        }
        activity_response = agent_client.post(activities_url, activity_data, format="json")
        activity_id = activity_response.data["id"]

        # Query IssueComments and verify external IDs
        comments = IssueComment.objects.filter(issue=issue, external_source="agent")
        assert comments.exists()
        comment = comments.first()
        expected_external_id = f"{run_id}:{activity_id}"
        assert comment.external_id == expected_external_id

    @pytest.mark.django_db
    def test_activity_auto_transitions_run_from_created_to_in_progress(
        self, agent_client, workspace, agent_profile
    ):
        """Activities posted to created runs auto-transition them to in_progress."""
        # Create run
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {"agent_id": str(agent_profile.id)}
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]
        assert run_response.data["status"] == AgentRunStatus.CREATED

        # Post activity to created run
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.THOUGHT,
            "content": "Thinking...",
        }
        activity_response = agent_client.post(activities_url, activity_data, format="json")
        assert activity_response.status_code == status.HTTP_201_CREATED

        # Verify run auto-transitioned to in_progress
        run = AgentRun.objects.get(id=run_id)
        assert run.status == AgentRunStatus.IN_PROGRESS

    @pytest.mark.django_db
    def test_action_activity_is_ephemeral(self, agent_client, workspace, agent_profile):
        """Action activities should also be ephemeral (like thoughts)."""
        # Create run
        runs_url = self.get_runs_url(workspace.slug)
        run_data = {"agent_id": str(agent_profile.id)}
        run_response = agent_client.post(runs_url, run_data, format="json")
        run_id = run_response.data["id"]

        # Post action activity
        activities_url = self.get_activities_url(workspace.slug, run_id)
        activity_data = {
            "activity_type": AgentActivityType.ACTION,
            "content": "Performing an action",
        }
        response = agent_client.post(activities_url, activity_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["is_ephemeral"] is True
        assert response.data["activity_type"] == AgentActivityType.ACTION
