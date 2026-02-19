"""
Sandbox executor for running LLM-generated code in a restricted Deno environment.

This module provides the SandboxExecutor class that manages the full lifecycle
of sandboxed code execution, including constraint enforcement and IPC communication.
"""

import logging
import os
import shutil
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
    ToolResultMessage,
    ToolErrorMessage,
    validate_tool_call,
)

logger = logging.getLogger("plane.worker")

_DENO_COMMON_PATHS = [
    "/usr/local/bin/deno",
    "/usr/bin/deno",
    os.path.expanduser("~/.deno/bin/deno"),
]


def _find_deno() -> str:
    """Resolve the absolute path to the deno binary.

    Checks known container paths first, then falls back to PATH resolution.

    Returns:
        Absolute path to deno binary.

    Raises:
        FileNotFoundError: If deno cannot be found.
    """
    for candidate in _DENO_COMMON_PATHS:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate

    path = shutil.which("deno")
    if path:
        return path

    raise FileNotFoundError(
        "deno binary not found in common locations or on PATH "
        f"(checked: {', '.join(_DENO_COMMON_PATHS)})"
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

                # Combine runtime and user code, wrapped so the process exits
                # when done. Without this, readToolResults() keeps the Deno
                # event loop alive indefinitely waiting on stdin.
                combined_code = (
                    f"{runtime_code}\n\n"
                    f"// User code (wrapped for clean exit):\n"
                    f"try {{\n{code}\n}} catch (e: any) {{\n"
                    f"  error(`Execution error: ${{e?.message ?? e}}`);\n"
                    f"}}\n"
                    f"Deno.exit(0);\n"
                )

                # Write to temp file
                temp_file = os.path.join(temp_dir, "user_code.ts")
                with open(temp_file, "w") as f:
                    f.write(combined_code)

                # Resolve deno binary path
                deno_path = _find_deno()

                # Build Deno command with restrictive permissions
                cmd = [
                    deno_path,
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

                except Exception:
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
        """Run the IPC loop to communicate with the sandbox.

        Reads stdout line-by-line until EOF (pipe closed), handling tool call
        requests, output messages, and error messages. After the read loop
        finishes, drains stderr and checks the exit code for failures.

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

        # Read stdout line-by-line until EOF. We use readline() rather than
        # iterating the file object because Python's file iterator uses an
        # internal read buffer that won't yield lines until the buffer fills,
        # which deadlocks the IPC protocol.
        while True:
            line = process.stdout.readline()
            if not line:
                break

            try:
                message = parse_sandbox_message(line)

                if message["type"] == "tool_call":
                    validate_tool_call(message)

                    if tool_call_count >= self.constraints.max_tool_calls:
                        self._kill_process(process)
                        return SandboxResult(
                            output=output,
                            tool_calls=tool_calls,
                            error="Too many tool calls",
                            timed_out=True,
                        )

                    try:
                        registry_result = self.tool_registry.execute(
                            message["name"],
                            message["params"],
                            self.context,
                        )

                        if "error" in registry_result:
                            err_msg = ToolErrorMessage(
                                id=message["id"],
                                error=registry_result["error"],
                            )
                            process.stdin.write(serialize_host_message(err_msg))
                            process.stdin.flush()
                        else:
                            result_msg = ToolResultMessage(
                                id=message["id"],
                                result=registry_result["result"],
                            )
                            process.stdin.write(serialize_host_message(result_msg))
                            process.stdin.flush()

                        tool_calls.append({
                            "id": message["id"],
                            "name": message["name"],
                            "params": message["params"],
                            "result": registry_result,
                            "timestamp": time.time(),
                        })
                        tool_call_count += 1

                    except Exception as e:
                        err_msg = ToolErrorMessage(
                            id=message["id"],
                            error=str(e),
                        )
                        process.stdin.write(serialize_host_message(err_msg))
                        process.stdin.flush()

                elif message["type"] == "output":
                    output += message["content"]
                    output_size = len(output.encode("utf-8"))
                    self.constraints.check_output_size(output_size)

                elif message["type"] == "error":
                    error = message["message"]

            except Exception as e:
                error = f"IPC error: {str(e)}"
                break

        # Wait for the process to finish
        try:
            process.wait(timeout=5)
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
            self._kill_process(process)

        # Check stderr and exit code for failures not reported via IPC
        if not error and not timed_out:
            stderr_output = process.stderr.read().strip() if process.stderr else ""
            return_code = process.returncode
            if return_code is not None and return_code < 0:
                # Negative exit code means killed by signal (e.g. -9 = SIGKILL
                # from the timeout timer)
                import signal
                sig = -return_code
                if sig == signal.SIGKILL:
                    timed_out = True
                    error = None
                else:
                    error = f"Process killed by signal {sig}"
            elif return_code and return_code != 0:
                error = stderr_output or f"Process exited with code {return_code}"

        return SandboxResult(
            output=output,
            tool_calls=tool_calls,
            error=error,
            timed_out=timed_out,
        )