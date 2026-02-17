# Agent UX Implementation Plan — Phase 3: Sandbox Execution Engine

**Goal:** Subprocess management, IPC protocol, and safety constraints for sandboxed code execution.

**Architecture:** A `SandboxExecutor` spawns a Deno subprocess with restrictive permissions (no network, no env, no writes, read-only for runtime files). The LLM-generated code executes inside Deno and communicates with the host Python process via newline-delimited JSON over stdin/stdout. The host routes `tool_call` messages to the tool registry (Phase 2) and returns results. Safety constraints (code size, tool call count, output size, timeout, memory) are enforced at both the host and subprocess level.

**Tech Stack:** Python 3.12 (subprocess), Deno (TypeScript runtime), JSON lines IPC, pytest

**Scope:** 8 phases from original design (this is phase 3 of 8)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC4: Built-in agent runtime

- **agent-ux.AC4.1 Success:** LLM generates code that executes in a sandboxed subprocess. Tool calls within the code are intercepted via IPC and executed against the Django ORM.
- **agent-ux.AC4.5 Success:** Sandbox execution respects constraints: code size limit, tool call count limit, output size limit, wall-clock timeout, memory limit.
- **agent-ux.AC4.7 Failure:** Sandbox timeout kills the subprocess and marks the run as `failed` with an error activity.
- **agent-ux.AC4.8 Failure:** Invalid tool name in sandbox code returns a tool error (not a crash).

---

## Investigation findings

- **Base image:** `python:3.12.10-alpine` (Alpine Linux). Deno is not pre-installed. bubblewrap not in standard Alpine repos.
- **No existing subprocess patterns** in production code. Only `subprocess.run` in `run_tests.py` for test orchestration.
- **Celery worker** runs as a separate Docker service (`docker-entrypoint-worker.sh`). Sandbox execution runs here.
- **Celery config** uses JSON serialization only, RabbitMQ as broker. Existing scheduled tasks for stale detection and ephemeral cleanup already registered.
- **Deno permissions model:** Secure by default — no flags means no I/O, no network, no env. `--allow-read=<path>` for selective read. `--deny-net` explicit. `--v8-flags=--max-old-space-size=256` for memory limits.
- **Deno Docker install:** Multi-stage copy from `denoland/deno:bin-2.6.9` or install via shell. Single binary, ~80-100MB.
- **Deno stdin/stdout IPC:** `Deno.stdin.readable` → `TextDecoderStream` → `TextLineStream` for line-by-line JSON reading. `console.log(JSON.stringify(...))` for output.
- **Sandbox runtime choice:** Design defers to implementation. Deno is the simpler option on Alpine (single binary, built-in permission model). bubblewrap on musl/Alpine is more complex. Recommend Deno without bubblewrap initially — Deno's permission model provides sufficient isolation for MVP.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: IPC protocol types and message handling

**Verifies:** agent-ux.AC4.1 (partial — defines the communication protocol)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/ipc.py`

**Implementation:**

Define the IPC message types as dataclasses and implement serialisation/deserialisation.

**Sandbox → Host messages:**

- `ToolCallMessage`: `{"type": "tool_call", "id": "<call_id>", "name": "<tool_name>", "params": {...}}`
- `OutputMessage`: `{"type": "output", "content": "<text>"}`
- `ErrorMessage`: `{"type": "error", "message": "<text>"}`

**Host → Sandbox messages:**

- `ToolResultMessage`: `{"type": "tool_result", "id": "<call_id>", "result": {...}}`
- `ToolErrorMessage`: `{"type": "tool_error", "id": "<call_id>", "error": "<text>"}`

Implement:

1. `parse_sandbox_message(line: str) -> dict` — parse a JSON line from the sandbox. Returns the parsed dict with validated `type` field. Raises `ValueError` for invalid JSON or missing `type`.
2. `serialize_host_message(msg: dict) -> str` — serialize a host message to a JSON line (with newline terminator).
3. `validate_tool_call(msg: dict) -> bool` — validate a tool_call message has `id`, `name`, and `params` fields.

Keep this module simple — it's just JSON lines parsing and validation. No Django dependencies.

**Verification:**

Run: `python -c "from plane.hw.agent_tools.ipc import parse_sandbox_message, serialize_host_message; print('OK')"`
Expected: Imports succeed.

**Commit:** `feat(hw): add IPC protocol types for sandbox communication`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Sandbox constraints configuration

**Verifies:** agent-ux.AC4.5 (partial — defines the constraint values)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/constraints.py`

**Implementation:**

Define sandbox constraints as a dataclass with sensible defaults matching the design:

```python
@dataclass
class SandboxConstraints:
    max_code_size: int = 50_000        # 50K characters
    max_tool_calls: int = 25           # 25 tool calls per execution
    max_output_size: int = 1_048_576   # 1MB output
    timeout_seconds: int = 60          # 60-second wall-clock timeout
    max_memory_mb: int = 256           # 256MB V8 heap
```

Add validation methods:

- `validate_code_size(code: str) -> None` — raises `ValueError` if code exceeds `max_code_size`.
- `check_tool_call_count(count: int) -> None` — raises `ValueError` if count exceeds `max_tool_calls`.
- `check_output_size(size: int) -> None` — raises `ValueError` if size exceeds `max_output_size`.

**Verification:**

Run: `python -c "from plane.hw.agent_tools.constraints import SandboxConstraints; print(SandboxConstraints())"`
Expected: Prints defaults.

**Commit:** `feat(hw): add sandbox constraint definitions`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->

### Task 3: Deno sandbox runtime TypeScript files

**Verifies:** agent-ux.AC4.1 (partial — the sandbox-side code)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/sandbox_runtime/runtime.ts`
- Create: `apps/api/plane/hw/agent_tools/sandbox_runtime/types.ts`

**Implementation:**

`types.ts` — TypeScript type definitions for the IPC protocol:

```typescript
export interface ToolCallRequest {
  type: "tool_call";
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface OutputMessage {
  type: "output";
  content: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface ToolResult {
  type: "tool_result";
  id: string;
  result: unknown;
}

export interface ToolError {
  type: "tool_error";
  id: string;
  error: string;
}
```

`runtime.ts` — the sandbox runtime that provides a `callTool()` function for LLM-generated code:

The runtime:

1. Reads tool result lines from stdin (host → sandbox responses).
2. Provides `callTool(name: string, params: Record<string, unknown>): Promise<unknown>` — sends a `tool_call` message to stdout, waits for the matching `tool_result` or `tool_error` on stdin, returns the result or throws.
3. Provides `output(content: string): void` — sends an `output` message to stdout.
4. Provides `error(message: string): void` — sends an `error` message and exits.

The runtime uses a pending-calls map (`Map<string, {resolve, reject}>`) to match tool results to their requests by ID. It generates sequential IDs (`call_1`, `call_2`, ...).

Stdin reading uses Deno's built-in `ReadableStream` APIs — manually split on newlines using a `TransformStream` instead of importing `TextLineStream` from `@std/streams`. This avoids any external module imports, which is essential because the sandbox runs with `--deny-net` and cannot download modules at runtime. The line-splitting logic is straightforward: buffer incoming text, split on `\n`, yield complete lines.

The LLM-generated code will be appended to this runtime at execution time (concatenated by the host).

**Verification:**

Run: `deno check apps/api/plane/hw/agent_tools/sandbox_runtime/runtime.ts` (if Deno is available locally)
Expected: Type checks pass. If Deno is not available, verify TypeScript syntax manually.

**Commit:** `feat(hw): add Deno sandbox runtime for IPC`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: SandboxExecutor class

**Verifies:** agent-ux.AC4.1, agent-ux.AC4.5, agent-ux.AC4.7, agent-ux.AC4.8

**Files:**

- Create: `apps/api/plane/hw/agent_tools/sandbox.py`

**Implementation:**

`SandboxExecutor` class that manages the full lifecycle of a sandboxed code execution:

```python
@dataclass
class SandboxResult:
    output: str
    tool_calls: list[dict]   # log of all tool calls and results
    error: str | None = None
    timed_out: bool = False
```

`SandboxExecutor.__init__(self, tool_registry: ToolRegistry, context: ToolContext, constraints: SandboxConstraints | None = None)`:

- Stores the registry, context, and constraints (defaults if None).

`SandboxExecutor.execute(self, code: str) -> SandboxResult`:

1. Validate code size against constraints.
2. Construct the full script: read `runtime.ts` content, append a separator comment, append the LLM-generated code.
3. Write the combined script to a temp file (in `/tmp`).
4. Build the Deno command: `["deno", "run", "--no-prompt", "--deny-net", "--deny-env", "--deny-write", "--deny-run", "--deny-ffi", "--deny-sys", f"--allow-read={temp_dir}", f"--v8-flags=--max-old-space-size={constraints.max_memory_mb}", temp_file]`.
5. Spawn the subprocess via `subprocess.Popen(cmd, stdin=PIPE, stdout=PIPE, stderr=PIPE, text=True)`.
6. Start an IPC loop:
   - Read lines from subprocess stdout.
   - For `tool_call` messages: validate via `ipc.validate_tool_call()`, check tool call count against constraints, call `tool_registry.execute(name, params, context)`, write the result or error back to subprocess stdin.
   - For `output` messages: append to accumulated output, check against output size constraint.
   - For `error` messages: record the error.
7. On constraint violation (too many tool calls, output too large): kill the subprocess, return result with error.
8. On timeout: the subprocess is killed, result has `timed_out=True` and an error message.
9. On subprocess exit: return the accumulated result.

Use `threading.Timer` or `signal.alarm` for timeout enforcement. The timer kills the subprocess if it hasn't exited within `constraints.timeout_seconds`.

The IPC loop must handle the case where the subprocess exits normally (stdout closes) — this is the happy path.

The `execute()` method must never raise — all errors are captured in the `SandboxResult`.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add SandboxExecutor with IPC loop and constraint enforcement`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Tests for sandbox execution

**Verifies:** agent-ux.AC4.1, agent-ux.AC4.5, agent-ux.AC4.7, agent-ux.AC4.8

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_sandbox.py`

**Testing:**

Tests must verify:

- **agent-ux.AC4.1:** Simple code that calls `callTool("issues.list", {...})` produces a `tool_call` IPC message, receives a `tool_result`, and returns output. Test by mocking the tool registry to return a fixed result and verifying the executor routes the call correctly.
- **agent-ux.AC4.5 (code size):** Code exceeding `max_code_size` is rejected before subprocess is spawned. `SandboxResult` has error set.
- **agent-ux.AC4.5 (tool call count):** Code that makes more than `max_tool_calls` tool calls is killed after the limit, with appropriate error in result.
- **agent-ux.AC4.5 (output size):** Code producing more than `max_output_size` output is killed.
- **agent-ux.AC4.7 (timeout):** Code with an infinite loop is killed after `timeout_seconds`. `SandboxResult.timed_out` is `True`. No exception raised.
- **agent-ux.AC4.8 (invalid tool):** Code calling a tool name that doesn't exist in the registry receives a `tool_error` response. The sandbox can handle this gracefully (doesn't crash the executor).
- **IPC protocol tests:** `parse_sandbox_message` correctly parses valid JSON lines. Invalid JSON raises `ValueError`. Missing `type` field raises `ValueError`. `serialize_host_message` produces valid JSON with newline.
- **Constraints tests:** `validate_code_size` raises for oversized code. `check_tool_call_count` raises at limit.

**Note on Deno availability:** If Deno is not installed in the test environment, the subprocess-level tests should be marked with `@pytest.mark.skipif(not shutil.which("deno"), reason="Deno not installed")`. The IPC and constraints tests don't need Deno.

Use `@pytest.mark.django_db` for tests that use the tool registry with real ORM operations. Use unit tests (no db) for IPC and constraints.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass (Deno-dependent tests skip if Deno not available).

**Commit:** `test(hw): add tests for sandbox executor and IPC protocol`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_6 -->

### Task 6: Update Dockerfile to include Deno binary

**Verifies:** None (infrastructure)

**Files:**

- Modify: `apps/api/Dockerfile.api` (production)
- Modify: `apps/api/Dockerfile.dev` (development)

**Implementation:**

Add a multi-stage copy of the Deno binary from the official image:

```dockerfile
# At the top, add a stage to extract Deno binary
FROM denoland/deno:bin-2.6.9 AS deno-bin

# In the main stage, copy the binary
COPY --from=deno-bin /deno /usr/local/bin/deno
```

Choose a specific Deno version tag (not `latest`) for reproducibility. Use the `bin` variant which is just the binary — no extra OS layers.

Apply to both `Dockerfile.api` and `Dockerfile.dev`.

**Verification:**

Run: `docker build -f apps/api/Dockerfile.dev -t plane-api-dev-test apps/api/`
Expected: Build succeeds.

Run: `docker run --rm plane-api-dev-test deno --version`
Expected: Prints Deno version.

**Commit:** `chore: add Deno binary to API Docker images`

<!-- END_TASK_6 -->
