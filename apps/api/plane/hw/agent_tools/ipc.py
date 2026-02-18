"""
IPC protocol types and message handling for sandbox communication.

This module defines the JSON Lines protocol for communication between
the sandbox (TypeScript runtime) and the host (Python executor).
"""

import dataclasses
import json
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class SandboxMessage:
    """Base class for all messages from sandbox to host."""
    type: str


@dataclass
class ToolCallMessage(SandboxMessage):
    """Message from sandbox requesting execution of a tool."""
    type: str = "tool_call"
    id: str = ""
    name: str = ""
    params: Dict[str, Any] = None


@dataclass
class OutputMessage(SandboxMessage):
    """Message from sandbox with output content."""
    type: str = "output"
    content: str = ""


@dataclass
class ErrorMessage(SandboxMessage):
    """Message from sandbox with an error."""
    type: str = "error"
    message: str = ""


@dataclass
class HostMessage:
    """Base class for all messages from host to sandbox."""
    type: str


@dataclass
class ToolResultMessage(HostMessage):
    """Message from host with tool execution result."""
    type: str = "tool_result"
    id: str = ""
    result: Any = None


@dataclass
class ToolErrorMessage(HostMessage):
    """Message from host with tool execution error."""
    type: str = "tool_error"
    id: str = ""
    error: str = ""


def parse_sandbox_message(line: str) -> Dict[str, Any]:
    """
    Parse a JSON line from the sandbox. Returns the parsed dict with validated `type` field. Raises `ValueError` for invalid JSON or missing `type`.

    Args:
        line: Raw JSON string from sandbox (may include newline)

    Returns:
        Parsed dictionary with validated 'type' field

    Raises:
        ValueError: If JSON is invalid or missing 'type' field
    """
    line = line.strip()
    if not line:
        raise ValueError("Empty message")

    try:
        data = json.loads(line)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    if not isinstance(data, dict):
        raise ValueError("Message must be a JSON object")

    if "type" not in data:
        raise ValueError("Message missing required 'type' field")

    return data


def serialize_host_message(msg: HostMessage) -> str:
    """Serialize a host message to a JSON line (with newline terminator).

    Args:
        msg: A HostMessage dataclass (ToolResultMessage or ToolErrorMessage).

    Returns:
        JSON string with newline terminator.
    """
    if not isinstance(msg, HostMessage):
        raise TypeError(f"Expected HostMessage, got {type(msg).__name__}")

    return json.dumps(dataclasses.asdict(msg)) + "\n"


def validate_tool_call(msg: Dict[str, Any]) -> bool:
    """
    Validate a tool_call message has `id`, `name`, and `params` fields.

    Args:
        msg: Parsed message dictionary

    Returns:
        True if valid

    Raises:
        ValueError: If message is invalid
    """
    if msg.get("type") != "tool_call":
        raise ValueError("Message type is not 'tool_call'")

    if "id" not in msg or not isinstance(msg["id"], str):
        raise ValueError("Tool call message missing or invalid 'id' field")

    if "name" not in msg or not isinstance(msg["name"], str):
        raise ValueError("Tool call message missing or invalid 'name' field")

    if "params" not in msg or not isinstance(msg["params"], dict):
        raise ValueError("Tool call message missing or invalid 'params' field")

    return True