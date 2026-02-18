from uuid import uuid4
from plane.hw.agent_tools.registry import (
    ToolRegistry, ToolParam, ToolDefinition, ToolContext, ToolError
)
from plane.hw.agent_tools.permissions import check_workspace_member, check_project_member
from plane.db.models import User, Workspace, Project
from plane.db.models.workspace import WorkspaceMember
from plane.db.models.project import ProjectMember

from plane.app.permissions.base import ROLE

import pytest


class TestToolRegistry:
    """Test the ToolRegistry class."""

    def test_tool_registration(self):
        """Test registering a tool via the decorator."""
        # Create isolated registry for testing
        registry = ToolRegistry()

        @registry.tool(
            name="test.tool",
            description="A test tool",
            params=[
                ToolParam(name="param1", type="string", description="Test parameter")
            ],
            return_type="Success message"
        )
        def test_handler(params, context):
            return f"Processed {params.get('param1')}"

        # Verify tool is registered
        tool = registry.get_tool("test.tool")
        assert tool is not None
        assert tool.name == "test.tool"
        assert tool.description == "A test tool"
        assert len(tool.params) == 1
        assert tool.params[0].name == "param1"
        assert tool.return_type == "Success message"
        assert tool.requires_project is False

    def test_list_tools(self):
        """Test listing all registered tools."""
        registry = ToolRegistry()

        @registry.tool("test.tool1", "Tool 1", [], "void")
        def handler1(params, context): pass

        @registry.tool("test.tool2", "Tool 2", [], "void")
        def handler2(params, context): pass

        tools = registry.list_tools()
        assert len(tools) == 2
        tool_names = [t.name for t in tools]
        assert "test.tool1" in tool_names
        assert "test.tool2" in tool_names

    def test_execute_success(self):
        """Test successful tool execution."""
        registry = ToolRegistry()

        @registry.tool("test.tool", "Test tool", [], "success")
        def test_handler(params, context):
            return {"message": "success"}

        context = ToolContext(
            user=None,
            workspace=None,
            run=None
        )

        result = registry.execute("test.tool", {}, context)
        assert "result" in result
        assert result["result"]["message"] == "success"

    def test_execute_unknown_tool(self):
        """Test executing an unknown tool returns error."""
        registry = ToolRegistry()
        context = ToolContext(None, None, None)

        result = registry.execute("unknown.tool", {}, context)
        assert "error" in result
        assert result["error"] == "Unknown tool: unknown.tool"

    def test_execute_permission_error(self):
        """Test that PermissionError is caught and returned as error dict."""
        registry = ToolRegistry()

        @registry.tool("test.tool", "Test tool", [], "void")
        def test_handler(params, context):
            raise ToolError("Permission denied")

        context = ToolContext(None, None, None)

        result = registry.execute("test.tool", {}, context)
        assert "error" in result
        assert result["error"] == "Permission denied: Permission denied"

    def test_execute_general_error(self):
        """Test that general exceptions are caught and returned as error dict."""
        registry = ToolRegistry()

        @registry.tool("test.tool", "Test tool", [], "void")
        def test_handler(params, context):
            raise ValueError("Something went wrong")

        context = ToolContext(None, None, None)

        result = registry.execute("test.tool", {}, context)
        assert "error" in result
        assert result["error"] == "Tool execution failed: Something went wrong"

    def test_generate_docs(self):
        """Test markdown documentation generation."""
        registry = ToolRegistry()

        @registry.tool("issues.create", "Create an issue", [
            ToolParam(name="name", type="string", description="Issue name", required=True),
            ToolParam(name="description", type="string", description="Issue description", required=False)
        ], "Issue object")
        def create_issue(params, context): pass

        @registry.tool("projects.list", "List projects", [
            ToolParam(name="workspace_id", type="string", description="Workspace ID", required=True)
        ], "List of projects")
        def list_projects(params, context): pass

        docs = registry.generate_docs()

        assert "Agent Tools Reference" in docs
        assert "## issues.create" in docs
        assert "Create an issue" in docs
        assert "| Name | Type | Required | Description |" in docs
        assert "| name | string | Yes | Issue name |" in docs
        assert "| description | string | No | Issue description |" in docs
        assert "Issue object" in docs

    def test_generate_types(self):
        """Test TypeScript declarations generation."""
        registry = ToolRegistry()

        @registry.tool("issues.create", "Create an issue", [
            ToolParam(name="name", type="string", description="Issue name", required=True),
            ToolParam(name="priority", type="integer", description="Priority", required=False),
            ToolParam(name="tags", type="array", description="Tags", required=False, items_type="string")
        ], "Issue object")
        def create_issue(params, context): pass

        types = registry.generate_types()

        # Handle variable whitespace by checking specific parts
        assert "declare function issues.create" in types
        assert "name: string" in types
        assert "priority?: number" in types
        assert "tags?: Array<string>" in types
        assert "Promise<any>" in types

    def test_default_registry_singleton(self):
        """Test that default_registry is a singleton."""
        from plane.hw.agent_tools.registry import default_registry

        @default_registry.tool("test.singleton", "Test tool", [], "void")
        def test_handler(params, context): pass

        # Should be accessible from the module-level registry
        tool = default_registry.get_tool("test.singleton")
        assert tool is not None


@pytest.mark.django_db
@pytest.mark.django_db
class TestPermissionHelpers:
    """Test permission enforcement helpers."""

    def setup_method(self):
        """Set up test data."""
        # Create test user and workspace
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )

        self.workspace = Workspace.objects.create(
            name="Test Workspace",
            slug="test-workspace"
        )

        self.project = Project.objects.create(
            name="Test Project",
            workspace=self.workspace,
            identifier="TEST"
        )

    def test_check_workspace_member_success(self):
        """Test successful workspace member check."""
        # Add user as workspace member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should not raise exception
        check_workspace_member(context)

    def test_check_workspace_member_insufficient_role(self):
        """Test workspace member check with insufficient role."""
        # Add user as guest (below default min_role=15 for create operations)
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.GUEST,
            active=True
        )

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should raise ToolError
        with pytest.raises(ToolError, match="User role 5 is below minimum required 15"):
            check_workspace_member(context, min_role=ROLE.MEMBER)

    def test_check_workspace_member_not_member(self):
        """Test workspace member check when user is not a member."""
        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should raise ToolError
        with pytest.raises(ToolError, match="User is not a member of workspace Test Workspace"):
            check_workspace_member(context)

    def test_check_project_member_success(self):
        """Test successful project member check."""
        # Add user as workspace member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        # Add user as project member
        ProjectMember.objects.create(
            project=self.project,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should not raise exception
        check_project_member(context, self.project.id, min_role=ROLE.MEMBER)

    def test_check_project_member_insufficient_role(self):
        """Test project member check with insufficient role."""
        # Add user as workspace member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        # Add user as guest in project
        ProjectMember.objects.create(
            project=self.project,
            user=self.user,
            role=ROLE.GUEST,
            active=True
        )

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should raise ToolError
        with pytest.raises(ToolError, match="User role 5 is below minimum required 15"):
            check_project_member(context, self.project.id, min_role=ROLE.MEMBER)

    def test_check_project_member_not_member(self):
        """Test project member check when user is not a member."""
        # Add user as workspace member but not project member
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.MEMBER,
            active=True
        )

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should raise ToolError
        with pytest.raises(ToolError, match="User is not a member of project"):
            check_project_member(context, self.project.id)

    def test_check_project_member_admin_bypass(self):
        """Test that workspace admin bypasses project membership check."""
        # Add user as workspace admin
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            user=self.user,
            role=ROLE.ADMIN,
            active=True
        )

        # Do NOT add user to project

        context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=None
        )

        # Should not raise exception (admin bypasses check)
        check_project_member(context, self.project.id, min_role=ROLE.MEMBER)