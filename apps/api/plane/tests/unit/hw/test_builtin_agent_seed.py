# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
import uuid

from plane.bgtasks.workspace_seed_task import workspace_seed
from plane.hw.models import AgentProfile, AgentType
from plane.db.models import BotTypeEnum
from plane.tests.factories import WorkspaceFactory


@pytest.mark.unit
class TestBuiltinAgentSeed:
    """Test workspace seed logic for built-in agent."""

    @pytest.mark.django_db
    def test_workspace_seed_creates_builtin_agent(self):
        """Verify agent-ux.AC1.4: After workspace_seed runs, a built-in AgentProfile exists."""
        workspace = WorkspaceFactory()

        # Call workspace_seed directly (not via .delay() since mock_celery_tasks is autouse)
        workspace_seed(workspace.id)

        # Verify built-in agent profile exists
        builtin_agent = AgentProfile.objects.filter(
            workspace=workspace,
            agent_type=AgentType.BUILTIN,
        ).first()

        assert builtin_agent is not None
        assert builtin_agent.display_name == "Plane Agent"
        assert builtin_agent.is_active is True
        assert builtin_agent.description == "Built-in AI assistant for workspace collaboration"

        # Verify associated user exists
        builtin_user = builtin_agent.user
        assert builtin_user.is_bot is True
        assert builtin_user.bot_type == BotTypeEnum.AGENT
        assert builtin_user.username == f"builtin_agent_{workspace.id}"
        assert builtin_user.display_name == "Plane Agent"
        assert builtin_user.email == f"builtin_agent_{workspace.id}@plane.so"

        # Verify user is workspace member with admin role
        from plane.db.models import WorkspaceMember
        membership = WorkspaceMember.objects.get(
            workspace=workspace,
            member=builtin_user,
        )
        assert membership.role == 20  # Admin role
        assert membership.company_role == ""

    @pytest.mark.django_db
    def test_workspace_seed_idempotency(self):
        """Verify idempotency: Running seed twice does not create duplicates."""
        workspace = WorkspaceFactory()

        # Run seed first time
        workspace_seed(workspace.id)

        # Verify built-in agent was created
        builtin_agent = AgentProfile.objects.filter(
            workspace=workspace,
            agent_type=AgentType.BUILTIN,
        ).first()
        assert builtin_agent is not None

        # Run seed second time
        workspace_seed(workspace.id)

        # Verify still only one built-in agent exists
        builtin_agents = AgentProfile.objects.filter(
            workspace=workspace,
            agent_type=AgentType.BUILTIN,
        )
        assert builtin_agents.count() == 1

        # Verify agent details unchanged
        updated_agent = builtin_agents.first()
        assert updated_agent.id == builtin_agent.id

    @pytest.mark.django_db
    def test_workspace_seed_only_creates_builtin_agent(self):
        """Verify seed doesn't interfere with external agents."""
        workspace = WorkspaceFactory()

        # Create an external agent first
        from plane.tests.factories import UserFactory
        external_user = UserFactory()
        external_agent = AgentProfile.objects.create(
            user=external_user,
            workspace=workspace,
            display_name="External Agent",
            agent_type=AgentType.EXTERNAL,
            is_active=True,
        )

        # Run workspace seed
        workspace_seed(workspace.id)

        # Verify external agent still exists
        existing_external = AgentProfile.objects.filter(
            id=external_agent.id,
            agent_type=AgentType.EXTERNAL,
        ).first()
        assert existing_external is not None

        # Verify built-in agent also exists
        builtin_agent = AgentProfile.objects.filter(
            workspace=workspace,
            agent_type=AgentType.BUILTIN,
        ).first()
        assert builtin_agent is not None

        # Verify total agent count is 2
        total_agents = AgentProfile.objects.filter(workspace=workspace).count()
        assert total_agents == 2

    @pytest.mark.django_db
    def test_workspace_seed_concurrent_call_idempotency(self):
        """Verify idempotency even with concurrent calls (simulated)."""
        workspace = WorkspaceFactory()

        # Run seed multiple times in quick succession
        for _ in range(3):
            workspace_seed(workspace.id)

        # Verify only one built-in agent exists
        builtin_agents = AgentProfile.objects.filter(
            workspace=workspace,
            agent_type=AgentType.BUILTIN,
        )
        assert builtin_agents.count() == 1

        # Verify agent is properly configured
        builtin_agent = builtin_agents.first()
        assert builtin_agent.display_name == "Plane Agent"
        assert builtin_agent.is_active is True

    @pytest.mark.django_db
    def test_workspace_seed_different_workspaces(self):
        """Verify seed creates separate built-in agents for different workspaces."""
        workspace1 = WorkspaceFactory()
        workspace2 = WorkspaceFactory()

        # Seed both workspaces
        workspace_seed(workspace1.id)
        workspace_seed(workspace2.id)

        # Verify separate built-in agents exist
        builtin_agent1 = AgentProfile.objects.filter(
            workspace=workspace1,
            agent_type=AgentType.BUILTIN,
        ).first()
        builtin_agent2 = AgentProfile.objects.filter(
            workspace=workspace2,
            agent_type=AgentType.BUILTIN,
        ).first()

        assert builtin_agent1 is not None
        assert builtin_agent2 is not None
        assert builtin_agent1.workspace != builtin_agent2.workspace
        assert builtin_agent1.user.username != builtin_agent2.user.username

        # Verify each has unique user credentials
        assert builtin_agent1.user.username == f"builtin_agent_{workspace1.id}"
        assert builtin_agent2.user.username == f"builtin_agent_{workspace2.id}"
        assert builtin_agent1.user.email == f"builtin_agent_{workspace1.id}@plane.so"
        assert builtin_agent2.user.email == f"builtin_agent_{workspace2.id}@plane.so"