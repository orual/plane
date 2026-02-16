# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import APIToken, User, WorkspaceMember
from plane.hw.models import AgentProfile


@pytest.fixture
def member_user(db):
    """Create a member user."""
    user = User.objects.create(
        email="member@plane.so",
        username="member_user",
        first_name="Member",
        last_name="User",
    )
    user.set_password("member@123")
    user.save()
    return user


@pytest.fixture
def member_client(api_client, member_user, workspace):
    """Return an authenticated client for a member-level workspace member."""
    WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)
    api_client.force_authenticate(user=member_user)
    return api_client


@pytest.mark.contract
class TestAgentRegistration:
    """Contract tests for agent registration and authentication."""

    def get_agents_url(self, workspace_slug):
        """Get the agents list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agents/"

    def get_agent_detail_url(self, workspace_slug, agent_id):
        """Get the agent detail endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agents/{agent_id}/"

    def get_agent_runs_url(self, workspace_slug):
        """Get the agent runs list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/"

    @pytest.mark.django_db
    def test_ac7_1_register_agent_creates_bot_user_profile_and_token(self, session_client, workspace):
        """AC7.1: Registering an agent creates bot User + AgentProfile + APIToken."""
        url = self.get_agents_url(workspace.slug)
        data = {
            "display_name": "Test Agent",
            "description": "A test agent",
            "webhook_url": "https://example.com/webhook",
            "webhook_secret": "secret123",
            "event_triggers": {"issue_created": True, "issue_updated": True},
        }

        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert "api_token" in response.data
        assert response.data["display_name"] == "Test Agent"
        assert response.data["webhook_url"] == "https://example.com/webhook"

        # Verify bot user was created
        agent_profile = AgentProfile.objects.get(id=response.data["id"])
        assert agent_profile.user.is_bot is True
        assert agent_profile.user.bot_type == "AGENT"
        assert agent_profile.user.username.startswith("agent_")
        assert agent_profile.user.email.endswith("@agent.internal")

        # Verify webhook_secret was stored in database
        assert agent_profile.webhook_secret == "secret123"

        # Verify API token was created
        api_token = APIToken.objects.get(token=response.data["api_token"])
        assert api_token.user == agent_profile.user
        assert api_token.is_service is True

    @pytest.mark.django_db
    def test_ac7_2_agent_token_authenticates_against_runs_endpoint(self, api_client, workspace):
        """AC7.2: Agent token can authenticate against runtime endpoints."""
        # Register an agent
        admin_user = User.objects.create(
            email="admin@plane.so",
            username="admin_user",
            first_name="Admin",
            last_name="User",
        )
        admin_user.set_password("admin@123")
        admin_user.save()
        WorkspaceMember.objects.create(workspace=workspace, member=admin_user, role=20)

        session_client = api_client
        session_client.force_authenticate(user=admin_user)

        register_url = self.get_agents_url(workspace.slug)
        register_data = {
            "display_name": "Auth Test Agent",
            "description": "For auth testing",
        }
        register_response = session_client.post(register_url, register_data, format="json")
        assert register_response.status_code == status.HTTP_201_CREATED
        token = register_response.data["api_token"]

        # Use token to authenticate against runs endpoint
        api_client.credentials(HTTP_X_API_KEY=token)
        agent_id = register_response.data["id"]

        runs_url = self.get_agent_runs_url(workspace.slug)
        runs_data = {
            "agent_id": agent_id,
        }
        runs_response = api_client.post(runs_url, runs_data, format="json")

        # Should succeed (agent is active)
        assert runs_response.status_code in [status.HTTP_201_CREATED, status.HTTP_200_OK]

    @pytest.mark.django_db
    def test_ac7_3_agent_profile_stores_webhook_config_and_triggers(self, session_client, workspace):
        """AC7.3: Agent profile stores webhook_url, webhook_secret, and event_triggers."""
        url = self.get_agents_url(workspace.slug)
        data = {
            "display_name": "Webhook Agent",
            "webhook_url": "https://webhook.example.com/agent",
            "webhook_secret": "super-secret-key",
            "event_triggers": {
                "issue_created": True,
                "issue_updated": False,
                "issue_commented": True,
            },
        }

        response = session_client.post(url, data, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        # Retrieve the agent to verify stored data from database
        agent_id = response.data["id"]
        agent_profile = AgentProfile.objects.get(id=agent_id)

        assert agent_profile.webhook_url == "https://webhook.example.com/agent"
        assert agent_profile.webhook_secret == "super-secret-key"
        assert agent_profile.event_triggers == {
            "issue_created": True,
            "issue_updated": False,
            "issue_commented": True,
        }

    @pytest.mark.django_db
    def test_ac7_4_non_admin_cannot_register_agent(self, member_client, workspace, member_user):
        """AC7.4: Non-admin users cannot register agents (403)."""
        url = self.get_agents_url(workspace.slug)
        data = {
            "display_name": "Unauthorized Agent",
        }

        response = member_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_ac7_5_deactivated_agent_token_rejected(self, session_client, api_client, workspace):
        """AC7.5: Deactivated agent's token is rejected (403)."""
        # Register an agent
        register_url = self.get_agents_url(workspace.slug)
        register_data = {
            "display_name": "Deactivable Agent",
        }
        register_response = session_client.post(register_url, register_data, format="json")
        assert register_response.status_code == status.HTTP_201_CREATED
        agent_id = register_response.data["id"]
        token = register_response.data["api_token"]

        # Deactivate the agent
        deactivate_url = self.get_agent_detail_url(workspace.slug, agent_id)
        deactivate_response = session_client.patch(deactivate_url, {"is_active": False}, format="json")
        assert deactivate_response.status_code == status.HTTP_200_OK

        # Try to use token to create a run — should be rejected
        api_client.credentials(HTTP_X_API_KEY=token)
        runs_url = self.get_agent_runs_url(workspace.slug)
        runs_data = {
            "agent_id": agent_id,
        }
        runs_response = api_client.post(runs_url, runs_data, format="json")

        # Should be rejected with 403
        assert runs_response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestAgentUnauthenticatedAccess:
    """Contract tests for unauthenticated access to agent endpoints (AC12.1)."""

    def get_agents_url(self, workspace_slug):
        """Get the agents list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agents/"

    def get_agent_runs_url(self, workspace_slug):
        """Get the agent runs list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/"

    def get_agent_run_activities_url(self, workspace_slug, run_id):
        """Get the agent run activities list/create endpoint URL."""
        return f"/api/workspaces/{workspace_slug}/agent-runs/{run_id}/activities/"

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agents_list_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated GET to agents list returns 401 or 403."""
        url = self.get_agents_url(workspace.slug)
        response = api_client.get(url)

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agents_create_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated POST to agents create returns 401 or 403."""
        url = self.get_agents_url(workspace.slug)
        data = {
            "display_name": "Unauthorized Agent",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agent_runs_list_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated GET to agent runs list returns 401 or 403."""
        url = self.get_agent_runs_url(workspace.slug)
        response = api_client.get(url)

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agent_runs_create_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated POST to agent runs create returns 401 or 403."""
        url = self.get_agent_runs_url(workspace.slug)
        data = {
            "agent_id": "00000000-0000-0000-0000-000000000000",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agent_run_activities_list_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated GET to agent run activities list returns 401 or 403."""
        # Use a fake UUID for the run_id since auth should be checked before lookup
        fake_run_id = "00000000-0000-0000-0000-000000000000"
        url = self.get_agent_run_activities_url(workspace.slug, fake_run_id)
        response = api_client.get(url)

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    @pytest.mark.django_db
    def test_ac12_1_unauthenticated_agent_run_activities_create_rejected(self, api_client, workspace):
        """AC12.1: Unauthenticated POST to agent run activities create returns 401 or 403."""
        # Use a fake UUID for the run_id since auth should be checked before lookup
        fake_run_id = "00000000-0000-0000-0000-000000000000"
        url = self.get_agent_run_activities_url(workspace.slug, fake_run_id)
        data = {
            "activity_type": "thought",
            "content": "Thinking about this...",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
