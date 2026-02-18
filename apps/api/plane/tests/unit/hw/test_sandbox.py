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



