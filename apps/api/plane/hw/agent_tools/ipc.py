"""
IPC protocol implementation for sandbox communication.

This module handles the newline-delimited JSON protocol between the sandbox
(TypeScript runtime) and the host (Python executor).
"""

import json
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class ToolCallMessage:
    """Message from sandbox to host requesting tool execution."""
    type: str
    id: str
    name: str
    params: Dict[str, Any]


@dataclass
class OutputMessage:
    """Message from sandbox to host with output content."""
    type: str
    content: str


@dataclass
class ErrorMessage:
    """Message from sandbox to host with error information."""
    type: str
    message: str


@dataclass
class ToolResultMessage:
    """Message from host to sandbox with tool execution result."""
    type: str
    id: str
    result: Any


@dataclass
class ToolErrorMessage:
    """Message from host to sandbox with tool execution error."""
    type: str
    id: str
    error: str


def parse_sandbox_message(line: str) -> Dict[str, Any]:
    """
    Parse a JSON line from the sandbox.

    Args:
        line: A single line containing a JSON message

    Returns:
        The parsed message dictionary

    Raises:
        ValueError: If JSON is invalid or required fields are missing
    """
    try:
        data = json.loads(line.strip())
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in sandbox message: {e}") from e

    if "type" not in data:
        raise ValueError("Sandbox message missing required 'type' field")

    return data


def serialize_host_message(msg: Dict[str, Any]) -> str:
    """
    Serialize a host message to a JSON line.

    Args:
        msg: Message dictionary to serialize

    Returns:
        JSON string with newline terminator
    """
    return json.dumps(msg) + "\n"


def validate_tool_call(msg: Dict[str, Any]) -> bool:
    """
    Validate a tool_call message has required fields.

    Args:
        msg: Parsed message dictionary

    Returns:
        True if valid

    Raises:
        ValueError: If required fields are missing
    """
    if msg.get("type") != "tool_call":
        raise ValueError(f"Expected tool_call message, got {msg.get('type')}")

    if "id" not in msg:
        raise ValueError("Tool call message missing required 'id' field")

    if "name" not in msg:
        raise ValueError("Tool call message missing required 'name' field")

    if "params" not in msg:
        raise ValueError("Tool call message missing required 'params' field")

    return True