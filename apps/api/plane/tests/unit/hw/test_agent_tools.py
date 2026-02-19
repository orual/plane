from uuid import UUID  # noqa: F401
from plane.hw.agent_tools.registry import ToolRegistry, ToolContext  # noqa: F401
from plane.hw.agent_tools.tools import issues, comments, projects, cycles, modules, users, labels, states  # noqa: F401
from plane.db.models import (
    User, Workspace, Project, Issue, IssueComment, Cycle,
    Module, WorkspaceMember, ProjectMember, Label, State
)
from plane.app.permissions.base import ROLE

import pytest


@pytest.mark.django_db
class TestMvpTools:
    """Test the MVP tool functionality."""

    def setup_method(self):
        """Set up test data."""
        # Create test user and workspace
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            display_name="Test User"
        )

        self.workspace = Workspace.objects.create(
            name="Test Workspace",
            slug="test-workspace"
        )

        # Add user as workspace member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.ADMIN,
            active=True
        )

        self.project = Project.objects.create(
            name="Test Project",
            workspace=self.workspace,
            identifier="TEST",
            description="Test project description"
        )

        # Add user as project member
        ProjectMember.objects.create(
            project=self.project,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        # Create test state
        self.state = State.objects.create(
            project=self.project,
            name="To Do",
            color="#3b82f6",
            group="backlog",
            workspace=self.workspace
        )

        # Create test label
        self.label = Label.objects.create(
            project=self.project,
            name="Bug",
            color="#ef4444",
            workspace=self.workspace
        )

        # Create test issue
        self.issue = Issue.objects.create(
            project=self.project,
            name="Test Issue",
            description_html="Test description",
            state=self.state,
            created_by=self.user,
            updated_by=self.user
        )

        # Add assignee to issue
        from plane.db.models.issue import IssueAssignee
        IssueAssignee.objects.create(
            issue=self.issue,
            user=self.user,
            created_by=self.user,
            updated_by=self.user
        )

        # Create test cycle
        self.cycle = Cycle.objects.create(
            project=self.project,
            name="Test Cycle",
            start_date="2026-01-01",
            end_date="2026-01-31",
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user
        )

        # Create test module
        self.module = Module.objects.create(
            project=self.project,
            name="Test Module",
            status="active",
            start_date="2026-01-01",
            target_date="2026-01-31",
            workspace=self.workspace,
            created_by=self.user,
            updated_by=self.user
        )

        # Create tool context
        self.context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None,
            project_id=self.project.id
        )

    def test_registry_has_mvp_tools(self):
        """Test that after importing all tool modules, ~18 tools are registered."""
        tools = ToolRegistry.list_tools()
        assert len(tools) == 18  # Exact count - see phase 02.md for exact 18 tools

        # Check that specific tools are registered
        tool_names = [tool.name for tool in tools]
        assert "issues.create" in tool_names
        assert "issues.list" in tool_names
        assert "comments.create" in tool_names
        assert "projects.list" in tool_names
        assert "cycles.add_issues" in tool_names
        assert "modules.add_issues" in tool_names
        assert "users.list" in tool_names
        assert "states.list" in tool_names

    def test_issues_create_success(self):
        """Test that issues.create creates an issue with correct fields."""
        # Create a test user as assignee
        assignee = User.objects.create_user(
            username="assignee",
            email="assignee@example.com",
            password="testpass123",
            display_name="Assignee User"
        )

        # Add assignee to workspace and project
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=assignee,
            role=ROLE.MEMBER,
            active=True
        )
        ProjectMember.objects.create(
            project=self.project,
            user=assignee,
            role=ROLE.MEMBER,
            active=True
        )

        result = issues.create({
            "project_id": str(self.project.id),
            "name": "New Test Issue",
            "description_html": "<p>New issue description</p>",
            "priority": "high",
            "assignee_ids": [str(assignee.id)],
            "label_ids": [str(self.label.id)]
        }, self.context)

        assert "result" in result
        issue_data = result["result"]

        # Verify issue was created
        issue = Issue.objects.get(id=UUID(issue_data["id"]))
        assert issue.name == "New Test Issue"
        assert issue.description_html == "<p>New issue description</p>"
        assert issue.priority == "high"

        # Verify assignee was added
        assert len(issue.assignees.all()) == 1
        assert issue.assignees.first().user == assignee

        # Verify label was added
        assert len(issue.labels.all()) == 1
        assert issue.labels.first().label == self.label

    def test_issues_list_filters(self):
        """Test that issues.list returns issues filtered by project."""
        # Create issue in different project
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            slug="other-workspace"
        )
        other_project = Project.objects.create(
            name="Other Project",
            workspace=other_workspace,
            identifier="OTHER"
        )
        Issue.objects.create(
            project=other_project,
            name="Other Issue",
            created_by=self.user,
            updated_by=self.user
        )

        # List issues for our project
        result = issues.list({"project_id": str(self.project.id)}, self.context)
        assert len(result) == 1
        assert result[0]["name"] == "Test Issue"
        assert result[0]["project_id"] == str(self.project.id)

    def test_issues_search(self):
        """Test that issues.search returns matching issues."""
        # Create matching issue
        Issue.objects.create(
            project=self.project,
            name="Bug in Login",
            created_by=self.user,
            updated_by=self.user
        )

        # Search for matching issues
        result = issues.search({"query": "Login"}, self.context)
        assert len(result) >= 1
        assert any(issue["name"] == "Bug in Login" for issue in result)

    def test_comments_create(self):
        """Test that comments.create creates a comment linked to the issue."""
        result = comments.create({
            "issue_id": str(self.issue.id),
            "comment_html": "<p>This is a test comment</p>"
        }, self.context)

        assert "result" in result
        comment_data = result["result"]

        # Verify comment was created
        comment = IssueComment.objects.get(id=UUID(comment_data["id"]))
        assert comment.comment_html == "<p>This is a test comment</p>"
        assert comment.issue == self.issue
        assert comment.actor == self.user

    def test_cycles_add_issues(self):
        """Test that cycles.add_issues creates CycleIssue records."""
        result = cycles.add_issues({
            "cycle_id": str(self.cycle.id),
            "project_id": str(self.project.id),
            "issue_ids": [str(self.issue.id)]
        }, self.context)

        assert result == [str(self.issue.id)]

        # Verify CycleIssue was created
        from plane.db.models.cycle import CycleIssue
        cycle_issue = CycleIssue.objects.get(
            cycle_id=self.cycle.id,
            issue_id=self.issue.id
        )
        assert cycle_issue.cycle == self.cycle
        assert cycle_issue.issue == self.issue

    def test_cycles_add_issues_duplicates(self):
        """Test that cycles.add_issues doesn't crash on duplicate calls."""
        # Add issue first time
        cycles.add_issues({
            "cycle_id": str(self.cycle.id),
            "project_id": str(self.project.id),
            "issue_ids": [str(self.issue.id)]
        }, self.context)

        # Add same issue again (should not crash)
        result = cycles.add_issues({
            "cycle_id": str(self.cycle.id),
            "project_id": str(self.project.id),
            "issue_ids": [str(self.issue.id)]
        }, self.context)

        # Should return empty list since it was already added
        assert result == []

    def test_modules_add_issues(self):
        """Test that modules.add_issues creates ModuleIssue records."""
        result = modules.add_issues({
            "module_id": str(self.module.id),
            "project_id": str(self.project.id),
            "issue_ids": [str(self.issue.id)]
        }, self.context)

        assert result == [str(self.issue.id)]

        # Verify ModuleIssue was created
        from plane.db.models.module import ModuleIssue
        module_issue = ModuleIssue.objects.get(
            module_id=self.module.id,
            issue_id=self.issue.id
        )
        assert module_issue.module == self.module
        assert module_issue.issue == self.issue

    def test_users_list_excludes_bots(self):
        """Test that users.list returns workspace members excluding bots."""
        # Create bot user
        bot_user = User.objects.create_user(
            username="bot",
            email="bot@example.com",
            password="testpass123",
            bot_type="agent"
        )

        # Add bot to workspace
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=bot_user,
            role=ROLE.MEMBER,
            active=True
        )

        # List users
        result = users.list({}, self.context)

        # Bot should not be in results
        user_emails = [user["email"] for user in result]
        assert "bot@example.com" not in user_emails
        assert self.user.email in user_emails

    def test_states_list_excludes_triage(self):
        """Test that states.list returns states for a project excluding triage."""
        # Create triage state
        _triage_state = State.objects.create(
            project=self.project,
            name="Triage",
            color="#6b7280",
            group="triage",
            workspace=self.workspace
        )

        # List states
        result = states.list({"project_id": str(self.project.id)}, self.context)

        # Triage state should not be in results
        state_names = [state["name"] for state in result]
        assert "Triage" not in state_names
        assert self.state.name in state_names


@pytest.mark.django_db
class TestToolPermissionOverride:
    """Test that workspace admin bypasses project checks."""

    def setup_method(self):
        """Set up test data."""
        # Create admin user and workspace
        self.admin_user = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="testpass123"
        )

        self.workspace = Workspace.objects.create(
            name="Admin Test Workspace",
            slug="admin-test-workspace"
        )

        # Add user as workspace admin
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.admin_user,
            role=ROLE.ADMIN,
            active=True
        )

        # Create project WITHOUT adding user as member
        self.project = Project.objects.create(
            name="Test Project",
            workspace=self.workspace,
            identifier="TEST"
        )

        self.context = ToolContext(
            user=self.admin_user,
            workspace=self.workspace,
            run=None
        )

    def test_admin_bypass_project_membership(self):
        """Test that workspace admin can create issues without being project member."""
        result = issues.create({
            "project_id": str(self.project.id),
            "name": "Admin Created Issue"
        }, self.context)

        assert "result" in result
        issue_data = result["result"]

        # Verify issue was created despite no project membership
        from plane.db.models import Issue
        issue = Issue.objects.get(id=UUID(issue_data["id"]))
        assert issue.name == "Admin Created Issue"
        assert issue.project == self.project