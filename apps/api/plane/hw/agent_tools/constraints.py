"""
Sandbox execution constraints configuration.

This module defines the limits and constraints for sandboxed code execution.
"""

from dataclasses import dataclass
from typing import NoReturn


@dataclass
class SandboxConstraints:
    """Configuration for sandbox execution limits."""
    max_code_size: int = 50_000        # 50K characters
    max_tool_calls: int = 25           # 25 tool calls per execution
    max_output_size: int = 1_048_576   # 1MB output
    timeout_seconds: int = 60          # 60-second wall-clock timeout
    max_memory_mb: int = 256           # 256MB V8 heap

    def validate_code_size(self, code: str) -> None:
        """
        Validate code size against constraints.

        Args:
            code: Code string to validate

        Raises:
            ValueError: If code exceeds max_code_size
        """
        if len(code) > self.max_code_size:
            raise ValueError(
                f"Code size ({len(code)} characters) exceeds maximum allowed "
                f"({self.max_code_size} characters)"
            )

    def check_tool_call_count(self, count: int) -> None:
        """
        Check tool call count against constraints.

        Args:
            count: Number of tool calls made

        Raises:
            ValueError: If count exceeds max_tool_calls
        """
        if count > self.max_tool_calls:
            raise ValueError(
                f"Tool call count ({count}) exceeds maximum allowed "
                f"({self.max_tool_calls})"
            )

    def check_output_size(self, size: int) -> None:
        """
        Check output size against constraints.

        Args:
            size: Output size in bytes

        Raises:
            ValueError: If size exceeds max_output_size
        """
        if size > self.max_output_size:
            raise ValueError(
                f"Output size ({size} bytes) exceeds maximum allowed "
                f"({self.max_output_size} bytes)"
            )