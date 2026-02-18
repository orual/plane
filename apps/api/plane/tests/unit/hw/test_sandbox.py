"""
Tests for sandbox execution functionality.

This module tests the SandboxExecutor class and related IPC functionality.
"""

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from unittest.mock import MagicMock, Mock, patch

import pytest

from plane.hw.agent_tools.constraints import SandboxConstraints
from plane.hw.agent_tools.ipc import (
    ToolResultMessage,
    parse_sandbox_message,
    serialize_host_message,
    validate_tool_call,
)
from plane.hw.agent_tools.sandbox import SandboxExecutor, SandboxResult


@pytest.mark.unit
class TestIPCCore:
    """Test IPC protocol core functionality."""

    def test_parse_sandbox_message_valid(self):
        """Test parsing valid sandbox messages."""
        line = '{"type": "tool_call", "id": "call_1", "name": "test", "params": {"key": "value"}}'
        result = parse_sandbox_message(line)

        assert result["type"] == "tool_call"
        assert result["id"] == "call_1"
        assert result["name"] == "test"
        assert result["params"]["key"] == "value"

    def test_parse_sandbox_message_invalid_json(self):
        """Test parsing invalid JSON raises ValueError."""
        with pytest.raises(ValueError, match="Invalid JSON"):
            parse_sandbox_message('{"invalid": json}')

    def test_parse_sandbox_message_missing_type(self):
        """Test parsing message without type field raises ValueError."""
        with pytest.raises(ValueError, match="missing required 'type' field"):
            parse_sandbox_message('{"id": "call_1", "name": "test"}')

    def test_serialize_host_message(self):
        """Test serialization of host messages."""
        msg = ToolResultMessage(id="call_1", result="success")
        result = serialize_host_message(msg)

        assert result.endswith("\n")
        parsed = json.loads(result.rstrip("\n"))
        assert parsed["type"] == "tool_result"
        assert parsed["id"] == "call_1"
        assert parsed["result"] == "success"

    def test_serialize_host_message_rejects_non_host_message(self):
        """Test that serialize_host_message rejects non-HostMessage types."""
        with pytest.raises(TypeError, match="Expected HostMessage"):
            serialize_host_message({"type": "tool_result"})

    def test_validate_tool_call_valid(self):
        """Test validation of valid tool call."""
        msg = {"type": "tool_call", "id": "call_1", "name": "test", "params": {}}
        assert validate_tool_call(msg) is True

    def test_validate_tool_call_wrong_type(self):
        """Test validation of wrong message type."""
        with pytest.raises(ValueError, match="not 'tool_call'"):
            validate_tool_call({"type": "output", "content": "test"})

    def test_validate_tool_call_missing_id(self):
        """Test validation of message without id."""
        with pytest.raises(ValueError, match="missing or invalid 'id' field"):
            validate_tool_call({"type": "tool_call", "name": "test", "params": {}})

    def test_validate_tool_call_missing_name(self):
        """Test validation of message without name."""
        with pytest.raises(ValueError, match="missing or invalid 'name' field"):
            validate_tool_call({"type": "tool_call", "id": "call_1", "params": {}})

    def test_validate_tool_call_missing_params(self):
        """Test validation of message without params."""
        with pytest.raises(ValueError, match="missing or invalid 'params' field"):
            validate_tool_call({"type": "tool_call", "id": "call_1", "name": "test"})


@pytest.mark.unit
class TestSandboxConstraints:
    """Test sandbox constraint validation."""

    def setup_method(self):
        """Set up test constraints."""
        self.constraints = SandboxConstraints()

    def test_code_size_validation_valid(self):
        """Test valid code size passes validation."""
        code = "console.log('Hello, world!');"
        self.constraints.validate_code_size(code)  # Should not raise

    def test_code_size_validation_invalid(self):
        """Test oversized code raises ValueError."""
        large_code = "x" * 50001
        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            self.constraints.validate_code_size(large_code)

    def test_tool_call_count_valid(self):
        """Test valid tool call count passes."""
        self.constraints.check_tool_call_count(10)  # Should not raise

    def test_tool_call_count_invalid(self):
        """Test high tool call count raises ValueError."""
        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            self.constraints.check_tool_call_count(26)

    def test_output_size_valid(self):
        """Test valid output size passes."""
        self.constraints.check_output_size(1000)  # Should not raise

    def test_output_size_invalid(self):
        """Test large output size raises ValueError."""
        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            self.constraints.check_output_size(1048577)


@pytest.mark.unit
class TestSandboxExecutorUnit:
    """Unit tests for SandboxExecutor (mock tests)."""

    def setup_method(self):
        """Set up test fixtures."""
        self.tool_registry = Mock()
        self.tool_registry.execute.return_value = {"result": "data"}
        self.context = {"workspace_id": 1, "project_id": 1}

        self.constraints = SandboxConstraints(
            max_code_size=1000,
            max_tool_calls=5,
            max_output_size=10000,
            timeout_seconds=1,  # Short timeout for testing
            max_memory_mb=256
        )

    def test_result_dataclass(self):
        """Test SandboxResult dataclass."""
        result = SandboxResult(
            output="test output",
            tool_calls=[{"name": "test", "result": "success"}],
            error="test error",
            timed_out=True
        )

        assert result.output == "test output"
        assert len(result.tool_calls) == 1
        assert result.error == "test error"
        assert result.timed_out is True

    def test_executor_initialization(self):
        """Test SandboxExecutor initialization."""
        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)

        assert executor.tool_registry == self.tool_registry
        assert executor.context == self.context
        assert executor.constraints == self.constraints

    def test_executor_initialization_with_defaults(self):
        """Test SandboxExecutor initialization with default constraints."""
        executor = SandboxExecutor(self.tool_registry, self.context)

        assert executor.tool_registry == self.tool_registry
        assert executor.context == self.context
        assert isinstance(executor.constraints, SandboxConstraints)

    def test_code_size_error_handling(self):
        """Test handling of code size errors."""
        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)
        large_code = "x" * 1001

        result = executor.execute(large_code)

        assert result.error is not None
        assert "exceeds maximum allowed" in result.error
        assert result.output == ""
        assert len(result.tool_calls) == 0

    @patch('plane.hw.agent_tools.sandbox.subprocess.Popen')
    def test_process_spawn_failure(self, mock_popen):
        """Test handling of process spawn failure."""
        mock_popen.side_effect = Exception("Failed to spawn process")

        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)

        result = executor.execute("console.log('test')")

        assert result.error is not None
        assert "Failed to spawn process" in result.error
        assert result.output == ""

    @patch('subprocess.Popen')
    def test_ipc_loop_basic(self, mock_popen):
        """Test basic IPC loop with mock process."""
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.stdout.readline.side_effect = [
            '{"type": "output", "content": "test"}\n',
            '',  # EOF — terminates the IPC loop
        ]
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)

        result = executor.execute("console.log('test')")

        assert result.output == "test"
        assert result.error is None
        assert result.timed_out is False

    @patch('subprocess.Popen')
    def test_ipc_loop_tool_call(self, mock_popen):
        """Test IPC loop handling tool calls."""
        mock_process = MagicMock()

        # Simulate output message
        mock_process.poll.return_value = None
        mock_process.stdout.readline.side_effect = [
            '{"type": "tool_call", "id": "call_1", "name": "test", "params": {}}\n',
            ''
        ]
        mock_process.stdin.write = MagicMock()
        mock_process.stdin.flush = MagicMock()
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)

        with patch.object(executor.tool_registry, 'execute') as mock_execute:
            mock_execute.return_value = {"result": "success"}

            result = executor.execute("callTool('test', {})")

            assert result.output == ""
            assert len(result.tool_calls) == 1
            assert result.tool_calls[0]["name"] == "test"
            assert result.tool_calls[0]["result"] == {"result": "success"}

    @patch('subprocess.Popen')
    def test_ipc_loop_error_handling(self, mock_popen):
        """Test IPC loop error handling."""
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.stdout.readline.side_effect = [
            '{"type": "error", "message": "Test error"}\n',
            '',  # EOF — terminates the IPC loop
        ]
        mock_process.wait.return_value = 1
        mock_popen.return_value = mock_process

        executor = SandboxExecutor(self.tool_registry, self.context, self.constraints)

        result = executor.execute("error('Test error')")

        assert result.error == "Test error"
        assert result.output == ""
        assert result.timed_out is False


@pytest.mark.unit
@pytest.mark.parametrize("test_input,expected", [
    ("console.log('test')", True),
    ("", True),
    ("callTool('test', {})", True),
    ("x" * 1000, True),  # Valid size
    ("x" * 1001, False),  # Invalid size
])
def test_code_validation(test_input, expected):
    """Parametrized test for code validation."""
    constraints = SandboxConstraints(max_code_size=1000)

    if expected:
        constraints.validate_code_size(test_input)  # Should not raise
    else:
        with pytest.raises(ValueError):
            constraints.validate_code_size(test_input)


@pytest.mark.django_db
@pytest.mark.unit
class TestSandboxIntegration:
    """Integration tests for SandboxExecutor with real tool registry and ORM.

    These tests mock subprocess.Popen (no real Deno) but use the real
    ToolRegistry, real tool handlers, and real database via Django ORM to
    verify the full IPC loop → registry → ORM pipeline.
    """

    def setup_method(self):
        """Set up test fixtures with real database models."""
        from uuid import uuid4

        from plane.app.permissions.base import ROLE
        from plane.db.models import (
            Project, ProjectMember, State, User, Workspace, WorkspaceMember,
        )
        from plane.hw.agent_tools.registry import ToolContext, ToolDefinition, ToolParam, ToolRegistry
        from plane.hw.agent_tools.tools.issues import list_issues
        from plane.hw.models.agent import AgentProfile, AgentRun, AgentType

        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            display_name="Test User",
        )

        self.workspace = Workspace.objects.create(
            name="Test Workspace",
            slug=f"test-ws-{uuid4().hex[:8]}",
            owner=self.user,
        )

        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.user,
            role=ROLE.ADMIN,
        )

        self.project = Project.objects.create(
            name="Test Project",
            identifier="TEST",
            workspace=self.workspace,
            created_by=self.user,
        )

        ProjectMember.objects.create(
            project=self.project,
            member=self.user,
            role=ROLE.MEMBER,
        )

        self.state = State.objects.create(
            project=self.project,
            name="To Do",
            color="#3b82f6",
            group="backlog",
            workspace=self.workspace,
        )

        self.agent_profile = AgentProfile.objects.create(
            agent_type=AgentType.BUILTIN,
            workspace=self.workspace,
        )

        self.agent_run = AgentRun.objects.create(
            agent=self.agent_profile,
            workspace=self.workspace,
            project=self.project,
        )

        self.context = ToolContext(
            user=self.user,
            workspace=self.workspace,
            run=self.agent_run,
            project_id=self.project.id,
        )

        self.registry = ToolRegistry()
        self.registry._tools["issues.list"] = ToolDefinition(
            name="issues.list",
            description="List issues in a project",
            params=[
                ToolParam(name="project_id", type="string", description="Project ID", required=True),
            ],
            return_type="List of issue objects",
            handler=list_issues,
            requires_project=True,
        )

        self.constraints = SandboxConstraints(
            max_code_size=10000,
            max_tool_calls=10,
            max_output_size=100000,
            timeout_seconds=5,
            max_memory_mb=512,
        )

    def _make_mock_process(self, stdout_lines):
        """Create a mock subprocess with the given stdout lines.

        Args:
            stdout_lines: List of strings the mock readline() will yield,
                          should end with '' (EOF).

        Returns:
            (mock_popen_cls, mock_process, written_messages) tuple.
            written_messages is a list that captures stdin.write() calls.
        """
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.stdout.readline.side_effect = stdout_lines
        mock_process.wait.return_value = 0

        written = []
        mock_process.stdin.write = lambda msg: written.append(msg)
        mock_process.stdin.flush = MagicMock()

        return mock_process, written

    def test_tool_call_executes_against_real_orm(self):
        """Full pipeline: sandbox emits tool_call → registry dispatches → ORM query → result sent back."""
        from plane.db.models import Issue

        Issue.objects.create(
            project=self.project,
            name="Integration Test Issue",
            state=self.state,
            created_by=self.user,
            updated_by=self.user,
        )

        executor = SandboxExecutor(self.registry, self.context, self.constraints)

        project_id_str = str(self.project.id)
        tool_call_json = (
            f'{{"type": "tool_call", "id": "call_1", '
            f'"name": "issues.list", "params": {{"project_id": "{project_id_str}"}}}}\n'
        )
        mock_process, written = self._make_mock_process([tool_call_json, ''])

        with patch('subprocess.Popen', return_value=mock_process):
            result = executor.execute("callTool('issues.list', {})")

        assert result.error is None
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "issues.list"

        tool_result = result.tool_calls[0]["result"]
        assert "result" in tool_result
        issue_names = [item["name"] for item in tool_result["result"]]
        assert "Integration Test Issue" in issue_names

    def test_tool_result_serialized_back_to_sandbox(self):
        """Verify the JSON line written to stdin is a valid tool_result."""
        from plane.db.models import Issue

        Issue.objects.create(
            project=self.project,
            name="Serialization Test",
            state=self.state,
            created_by=self.user,
            updated_by=self.user,
        )

        executor = SandboxExecutor(self.registry, self.context, self.constraints)

        project_id_str = str(self.project.id)
        tool_call_json = (
            f'{{"type": "tool_call", "id": "call_abc", '
            f'"name": "issues.list", "params": {{"project_id": "{project_id_str}"}}}}\n'
        )
        mock_process, written = self._make_mock_process([tool_call_json, ''])

        with patch('subprocess.Popen', return_value=mock_process):
            executor.execute("callTool('issues.list', {})")

        assert len(written) == 1
        response = json.loads(written[0].strip())
        assert response["type"] == "tool_result"
        assert response["id"] == "call_abc"
        assert "result" in response

    def test_unknown_tool_returns_result_with_error_key(self):
        """Unknown tool names go through the success path but with an error in the result dict.

        The registry returns {"error": "Unknown tool: ..."} as a result (not an exception),
        so the sandbox receives a tool_result message whose result contains the error.
        """
        executor = SandboxExecutor(self.registry, self.context, self.constraints)

        tool_call_json = (
            '{"type": "tool_call", "id": "call_err", '
            '"name": "nonexistent.tool", "params": {}}\n'
        )
        mock_process, written = self._make_mock_process([tool_call_json, ''])

        with patch('subprocess.Popen', return_value=mock_process):
            result = executor.execute("callTool('nonexistent.tool', {})")

        assert result.error is None
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "nonexistent.tool"

        # Registry returns {"error": ...} as a normal result, not an exception
        assert len(written) == 1
        response = json.loads(written[0].strip())
        assert response["type"] == "tool_result"
        assert response["id"] == "call_err"
        assert "error" in response["result"]

    def test_tool_call_limit_kills_process(self):
        """Exceeding max_tool_calls kills the process and returns an error."""
        low_constraints = SandboxConstraints(
            max_code_size=10000,
            max_tool_calls=1,
            max_output_size=100000,
            timeout_seconds=5,
            max_memory_mb=512,
        )
        executor = SandboxExecutor(self.registry, self.context, low_constraints)

        project_id_str = str(self.project.id)
        call_1 = (
            f'{{"type": "tool_call", "id": "call_1", '
            f'"name": "issues.list", "params": {{"project_id": "{project_id_str}"}}}}\n'
        )
        call_2 = (
            f'{{"type": "tool_call", "id": "call_2", '
            f'"name": "issues.list", "params": {{"project_id": "{project_id_str}"}}}}\n'
        )

        mock_process, written = self._make_mock_process([call_1, call_2, ''])
        mock_process.kill = MagicMock()

        with patch('subprocess.Popen', return_value=mock_process):
            result = executor.execute("callTool multiple times")

        assert result.error == "Too many tool calls"
        # First call succeeds, second triggers the limit
        assert len(result.tool_calls) == 1

