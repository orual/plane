"""
Sandbox executor for running LLM-generated code in a restricted Deno environment.

This module provides the SandboxExecutor class that manages the full lifecycle
of sandboxed code execution, including constraint enforcement and IPC communication.
"""

import json
import os
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from plane.hw.agent_tools.constraints import SandboxConstraints
from plane.hw.agent_tools.ipc import (
    parse_sandbox_message,
    serialize_host_message,
    ToolCallMessage,
    OutputMessage,
    ErrorMessage,
    ToolResultMessage,
    ToolErrorMessage,
    validate_tool_call,
)


@dataclass
class SandboxResult:
    """Result of sandbox execution."""
    output: str
    tool_calls: List[Dict[str, Any]]   # log of all tool calls and results
    error: Optional[str] = None
    timed_out: bool = False


class SandboxExecutor:
    """
    Executor for sandboxed code with IPC communication and constraint enforcement.
    """

    def __init__(
        self,
        tool_registry,
        context,
        constraints: Optional[SandboxConstraints] = None
    ):
        """
        Initialize the sandbox executor.

        Args:
            tool_registry: Tool registry for executing tool calls
            context: Tool execution context
            constraints: Sandbox constraints (defaults if None)
        """
        self.tool_registry = tool_registry
        self.context = context
        self.constraints = constraints or SandboxConstraints()

    def execute(self, code: str) -> SandboxResult:
        """
        Execute code in a sandboxed environment.

        Args:
            code: Code to execute

        Returns:
            SandboxResult with execution output and any errors
        """
        # Validate code size constraint
        try:
            self.constraints.validate_code_size(code)
        except ValueError as e:
            return SandboxResult(
                output="",
                tool_calls=[],
                error=str(e)
            )

        # Create temporary file for the combined runtime and code
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                # Read the runtime template
                runtime_path = os.path.join(
                    os.path.dirname(__file__),
                    "sandbox_runtime",
                    "runtime.ts"
                )
                with open(runtime_path, "r") as f:
                    runtime_code = f.read()

                # Combine runtime and user code
                combined_code = f"{runtime_code}\n\n// User code:\n{code}"

                # Write to temp file
                temp_file = os.path.join(temp_dir, "user_code.ts")
                with open(temp_file, "w") as f:
                    f.write(combined_code)

                # Build Deno command with restrictive permissions
                cmd = [
                    "deno",
                    "run",
                    "--no-prompt",
                    "--deny-net",
                    "--deny-env",
                    "--deny-write",
                    "--deny-run",
                    "--deny-ffi",
                    "--deny-sys",
                    f"--allow-read={temp_dir}",
                    f"--v8-flags=--max-old-space-size={self.constraints.max_memory_mb}",
                    temp_file
                ]

                # Start the subprocess
                process = subprocess.Popen(
                    cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )

                # Set up timeout handler
                timeout_timer = None
                if self.constraints.timeout_seconds > 0:
                    timeout_timer = threading.Timer(
                        self.constraints.timeout_seconds,
                        self._kill_process,
                        args=[process]
                    )
                    timeout_timer.start()

                try:
                    result = self._ipc_loop(process)

                    if timeout_timer and timeout_timer.is_alive():
                        timeout_timer.cancel()

                    return result

                except Exception as e:
                    if timeout_timer and timeout_timer.is_alive():
                        timeout_timer.cancel()

                    self._kill_process(process)
                    raise

        except Exception as e:
            return SandboxResult(
                output="",
                tool_calls=[],
                error=f"Executor error: {str(e)}"
            )

    def _kill_process(self, process: subprocess.Popen) -> None:
        """Kill the subprocess and wait for it to terminate."""
        try:
            process.kill()
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # Force kill if it doesn't terminate
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    def _ipc_loop(self, process: subprocess.Popen) -> SandboxResult:
        """
        Run the IPC loop to communicate with the sandbox.

        Args:
            process: Subprocess to communicate with

        Returns:
            SandboxResult with execution results
        """
        output = ""
        tool_calls = []
        tool_call_count = 0
        error = None
        timed_out = False

        # Read stdout line by line
        while True:
            # Check if process has exited
            return_code = process.poll()
            if return_code is not None:
                # Process has exited
                break

            # Read next line
            line = process.stdout.readline()
            if not line:
                # EOF
                break

            try:
                # Parse the message
                message = parse_sandbox_message(line)

                # Handle different message types
                if message["type"] == "tool_call":
                    # Validate and check tool call count
                    validate_tool_call(message)

                    if tool_call_count >= self.constraints.max_tool_calls:
                        # Too many tool calls - kill process
                        self._kill_process(process)
                        return SandboxResult(
                            output=output,
                            tool_calls=tool_calls,
                            error="Too many tool calls",
                            timed_out=True
                        )

                    # Execute the tool
                    try:
                        result = self.tool_registry.execute(
                            message["name"],
                            message["params"],
                            self.context
                        )

                        # Send result back
                        result_msg = ToolResultMessage(
                            id=message["id"],
                            result=result
                        )
                        process.stdin.write(serialize_host_message(result_msg))
                        process.stdin.flush()

                        # Log the tool call
                        tool_calls.append({
                            "id": message["id"],
                            "name": message["name"],
                            "params": message["params"],
                            "result": result,
                            "timestamp": time.time()
                        })
                        tool_call_count += 1

                    except Exception as e:
                        # Send error back
                        error_msg = ToolErrorMessage(
                            id=message["id"],
                            error=str(e)
                        )
                        process.stdin.write(serialize_host_message(error_msg))
                        process.stdin.flush()

                elif message["type"] == "output":
                    # Accumulate output
                    output += message["content"]

                    # Check output size
                    output_size = len(output.encode('utf-8'))
                    self.constraints.check_output_size(output_size)

                elif message["type"] == "error":
                    # Record error
                    error = message["message"]

            except Exception as e:
                error = f"IPC error: {str(e)}"
                break

        # Wait for process to finish
        try:
            process.wait(timeout=5)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            self._kill_process(process)

        return SandboxResult(
            output=output,
            tool_calls=tool_calls,
            error=error,
            timed_out=timed_out
        )