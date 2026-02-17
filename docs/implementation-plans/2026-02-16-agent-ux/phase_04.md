# Agent UX Implementation Plan — Phase 4: Built-in Agent Execution Task

**Goal:** Celery task that orchestrates the full LLM → sandbox → tools loop and creates activity records. Includes a proper LLM client that handles multi-turn conversation with thinking blocks and prompt caching.

**Architecture:** A Celery task receives a `run_id` and trigger context (comment text or conversation messages). It constructs a system prompt with tool documentation (cacheable), calls LiteLLM with thinking/reasoning support, passes generated code to the `SandboxExecutor`, creates `AgentRunActivity` records for each step, and manages run status transitions. A new `AgentLLMClient` wraps LiteLLM with proper multi-turn support: thinking blocks stored and resent, prompt caching via `cache_control`, configurable reasoning effort, and retry logic.

**Tech Stack:** Python 3.12, LiteLLM, Celery, Django ORM, pytest

**Scope:** 8 phases from original design (this is phase 4 of 8)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC3: Agent chat UI

- **agent-ux.AC3.2 Success:** Sending a message creates a conversation (or continues an existing one) and triggers the built-in agent.
- **agent-ux.AC3.4 Success:** Multi-turn conversation maintains context — the agent's second response accounts for the first exchange.
- **agent-ux.AC3.7 Failure:** Agent operations respect the user's permissions. An operation the user can't perform manually fails with a clear error in the chat.

### agent-ux.AC4: Built-in agent runtime

- **agent-ux.AC4.1 Success:** LLM generates code that executes in a sandboxed subprocess. Tool calls within the code are intercepted via IPC and executed against the Django ORM.
- **agent-ux.AC4.2 Success:** Each execution step creates the correct `AgentRunActivity` type: thoughts as `thought`, code/tool calls as `action`, final output as `response`, failures as `error`.
- **agent-ux.AC4.3 Success:** Response activities auto-create `IssueComment` records when the run is issue-scoped (mention-triggered).
- **agent-ux.AC4.7 Failure:** Sandbox timeout kills the subprocess and marks the run as `failed` with an error activity.
- **agent-ux.AC4.9 Success:** Stale detection (existing Celery beat task) correctly marks inactive built-in agent runs as `stale`.

### agent-ux.AC6: Cross-cutting behaviours

- **agent-ux.AC6.4:** The built-in agent is reachable via both the chat UI and @mentions — same runtime, different trigger paths.

---

## Investigation findings

- **get_llm_response()** at `apps/api/plane/app/views/external/base.py:107-152` — concatenates task+prompt into single user message, captures `reasoning_content` but discards it. Not suitable for multi-turn agent loops. Returns `(text, error, reasoning)` tuple.
- **get_llm_config()** at `apps/api/plane/app/views/external/base.py:62-104` — loads `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL` from `InstanceConfiguration` DB table (with env var fallback). Reusable.
- **PROVIDER_MODELS** at `apps/api/plane/app/views/external/base.py:27-57` — provider prefix mapping (e.g., `"anthropic/"` + model name). Reusable.
- **Celery task pattern** — `@shared_task(bind=True)` with try-except and `log_exception()`. Tasks registered in `CELERY_IMPORTS` in settings.
- **AgentRun transitions** — validated via `run.validate_transition(new_status)` then `run.save()`. Transitions: created→in_progress→completed/failed.
- **Activity creation** — `AgentRunActivity.objects.create(...)` + update `run.last_activity_at`. Response activities auto-create `IssueComment` when `run.issue_id` is set.
- **URL routing** — HW URLs in `apps/api/plane/hw/urls/agent.py`, included via `apps/api/plane/urls.py` as `path("api/", include("plane.hw.urls"))`.
- **Workspace scoping** — filter by `workspace__slug=self.kwargs.get("slug")` in `get_queryset()`.
- **LiteLLM multi-turn** — pass full message history list. Anthropic thinking_blocks must be stored and resent. `cache_control: {"type": "ephemeral"}` on system content for caching. `reasoning_effort` parameter controls thinking intensity.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: AgentLLMClient — multi-turn LLM wrapper with thinking and caching

**Verifies:** agent-ux.AC3.4 (partial — maintains context across turns), agent-ux.AC4.1 (partial — generates code)

**Files:**

- Create: `apps/api/plane/utils/llm_config.py` (extract from views)
- Modify: `apps/api/plane/app/views/external/base.py` (import from new utility)
- Create: `apps/api/plane/hw/agent_tools/llm_client.py`

**Implementation:**

Create `AgentLLMClient` that wraps LiteLLM with proper multi-turn support:

```python
@dataclass
class LLMResponse:
    content: str
    reasoning_content: str | None
    thinking_blocks: list[dict] | None
    finish_reason: str
    usage: dict  # prompt_tokens, completion_tokens, total_tokens, cache metrics
```

`AgentLLMClient`:

- `__init__(self, api_key, provider, model, base_url="")` — stores config, computes litellm model string using `PROVIDER_MODELS` prefix.
- `_build_system_message(self, system_text: str) -> dict` — returns system message with `cache_control: {"type": "ephemeral"}` on the content block. Uses the content-block format (`[{"type": "text", "text": ..., "cache_control": ...}]`) required for Anthropic caching.
- `_build_history_message(self, role: str, content: str, thinking_blocks: list[dict] | None = None) -> dict` — returns a message dict. If `thinking_blocks` is provided (for assistant messages), includes them so they're resent in subsequent calls.
- `call(self, system_prompt: str, messages: list[dict], max_tokens: int = 4096, reasoning_effort: str = "medium", thinking_budget: int | None = None) -> LLMResponse` — calls `litellm.completion()` with:
  - System message with cache control
  - Full message history (user/assistant messages with thinking blocks preserved)
  - `reasoning_effort` parameter
  - `thinking` parameter if `thinking_budget` is set: `{"type": "enabled", "budget_tokens": thinking_budget}`
  - `timeout=60`
  - Returns `LLMResponse` with all fields populated
  - Retries on `RateLimitError` and `Timeout` with exponential backoff (3 retries, 2^attempt seconds)

Extract `get_llm_config()` and `PROVIDER_MODELS` from `apps/api/plane/app/views/external/base.py` into a new utility module at `apps/api/plane/utils/llm_config.py`. This avoids importing from the views layer into a Celery task (circular dependency risk). The views module should then import from this utility. The new module contains the `get_llm_config()` function and `PROVIDER_MODELS` dict — no other changes needed.

The client does NOT manage conversation state — it takes messages as input and returns a response. The caller (the Celery task) manages the message history.

**Verification:**

Run: `python -c "from plane.hw.agent_tools.llm_client import AgentLLMClient, LLMResponse; print('OK')"`
Expected: Imports succeed.

**Commit:** `feat(hw): add AgentLLMClient with thinking blocks and prompt caching`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: System prompt templates

**Verifies:** agent-ux.AC4.1 (partial — prompt instructs LLM to generate code)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/prompts.py`

**Implementation:**

Create functions that construct the system prompt for the built-in agent:

1. `build_system_prompt(tool_docs: str, workspace_context: dict) -> str` — assembles the full system prompt from:
   - Agent identity and role description
   - Code generation instructions: the LLM must respond with a TypeScript code block that uses the provided tool functions. The code runs in a Deno sandbox with `callTool()`, `output()`, and `error()` available.
   - Tool documentation (from `ToolRegistry.generate_docs()`)
   - Workspace context (workspace name, available projects — summary for orientation)
   - Constraints: code size limit, tool call limit, timeout
   - Output format instructions: after executing tools, use `output()` to provide the final response to the user

2. `build_workspace_context(workspace) -> dict` — queries workspace name and lists project names/identifiers (lightweight, cached-friendly).

The system prompt is designed to be stable across turns within a conversation, making it effective for prompt caching. Dynamic content (conversation history) is in the messages, not the system prompt.

**Verification:**

Run: `python -c "from plane.hw.agent_tools.prompts import build_system_prompt; print('OK')"`
Expected: Imports succeed.

**Commit:** `feat(hw): add system prompt templates for built-in agent`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Built-in agent execution Celery task

**Verifies:** agent-ux.AC4.1, agent-ux.AC4.2, agent-ux.AC4.3, agent-ux.AC4.7, agent-ux.AC6.4

**Files:**

- Create: `apps/api/plane/bgtasks/builtin_agent_task.py`
- Modify: `apps/api/plane/settings/common.py` (add to CELERY_IMPORTS)

**Implementation:**

`builtin_agent_execute_task` — a `@shared_task(bind=True)` Celery task that accepts:

- `run_id: str` — the AgentRun UUID
- `trigger_type: str` — `"mention"` or `"conversation"`
- `user_message: str` — the text from the user (comment body or chat message)
- `conversation_messages: list[dict] | None` — previous conversation turns (for multi-turn context)

Task flow:

1. **Load context:** Fetch `AgentRun` with select_related (agent, workspace, project, issue). Fetch triggering user from `run.created_by`.
2. **Transition status:** `run.status = AgentRunStatus.IN_PROGRESS`, `run.save()`.
3. **Build prompt:** Call `build_system_prompt()` with tool docs from `ToolRegistry.generate_docs()` and workspace context. Build messages list from `conversation_messages` (if multi-turn) plus current `user_message`.
4. **Call LLM:** Instantiate `AgentLLMClient` with config from `get_llm_config()`. Call `client.call()` with system prompt, messages, and thinking budget.
5. **Create thought activity:** If `reasoning_content` is present, create `AgentRunActivity(activity_type="thought", content=reasoning_content)`.
6. **Extract code block:** Parse the LLM response content for a code block (fenced with triple backticks, language `typescript` or `ts`). If no code block found, treat the entire response as a direct text response — create a `response` activity and complete.
7. **Create action activity:** Create `AgentRunActivity(activity_type="action", content=code_block)` for the code.
8. **Execute sandbox:** Instantiate `SandboxExecutor` with `ToolRegistry`, `ToolContext(user, workspace, run)`, and constraints. Call `executor.execute(code_block)`.
9. **Handle sandbox result:**
   - If `timed_out`: create `error` activity ("Execution timed out"), transition to `failed`.
   - If `error`: create `error` activity with error message, transition to `failed`.
   - If success: create `response` activity with the sandbox output.
10. **Create assistant conversation message:** If the run has a `conversation_id` and the final activity is a `response`, create an `AgentConversationMessage` with `role="assistant"`, `content=response_output`, and `run=run`. This is the only place assistant messages are created — never at request time.
11. **Auto-create IssueComment:** If the run is issue-scoped (`run.issue_id` is set) and the final activity is a `response`, create an `IssueComment` following the existing pattern in `AgentRunActivityViewSet.create()` — HTML-escaped content, `external_source="agent"`, `external_id="{run_id}:{activity_id}"`, actor is the agent's bot user.
12. **Transition to completed:** `run.status = AgentRunStatus.COMPLETED`, `run.completed_at = timezone.now()`, `run.save()`.
13. **Error handling:** Wrap the entire flow in try-except. On any unhandled exception, create an `error` activity, transition to `failed`, and log via `log_exception()`.

Update `CELERY_IMPORTS` in `apps/api/plane/settings/common.py` to include `"plane.bgtasks.builtin_agent_task"`.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add built-in agent execution Celery task`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Conversation API endpoints

**Verifies:** agent-ux.AC3.2, agent-ux.AC3.7

**Files:**

- Create: `apps/api/plane/hw/views/agent_conversation.py`
- Modify: `apps/api/plane/hw/urls/agent.py` (add conversation routes)

**Implementation:**

Create `AgentConversationViewSet(BaseViewSet)`:

- `model = AgentConversation`
- `authentication_classes = [BaseSessionAuthentication]`
- `get_queryset()` — filter by `workspace__slug` and `user=request.user` (users only see their own conversations).

Endpoints:

1. **list** — `GET /api/workspaces/{slug}/agent-conversations/` — list user's conversations. Permission: workspace member.
2. **retrieve** — `GET /api/workspaces/{slug}/agent-conversations/{id}/` — get conversation with messages. Permission: workspace member, own conversations only.
3. **create** — `POST /api/workspaces/{slug}/agent-conversations/` — create a new conversation. Body: `{"title": "optional"}`. Permission: workspace member. Returns the created conversation.

Create `AgentConversationMessageViewSet(BaseViewSet)`:

- `model = AgentConversationMessage`

Endpoints:

1. **list** — `GET /api/workspaces/{slug}/agent-conversations/{conversation_id}/messages/` — list messages in a conversation. Permission: workspace member, own conversation.
2. **create** — `POST /api/workspaces/{slug}/agent-conversations/{conversation_id}/messages/` — send a message. Body: `{"content": "user message text"}`. This endpoint:
   - Creates an `AgentConversationMessage` with `role="user"`.
   - Finds the workspace's built-in agent profile (`agent_type="builtin"`).
   - Creates an `AgentRun` linked to the conversation, agent, and workspace.
   - Dispatches `builtin_agent_execute_task.delay()` with the run ID, trigger type `"conversation"`, user message, and previous conversation messages for context.
   - Returns the created user message and run ID.

   **Note:** Do NOT create an assistant `AgentConversationMessage` at request time. The Celery task creates the assistant message when the run completes (with actual content from the response activity). This avoids permanently empty assistant messages. Multi-turn context reconstruction reads from `AgentConversationMessage` records (user messages + completed assistant messages).

Add URL routes to `apps/api/plane/hw/urls/agent.py`:

```
workspaces/<str:slug>/agent-conversations/
workspaces/<str:slug>/agent-conversations/<uuid:pk>/
workspaces/<str:slug>/agent-conversations/<uuid:conversation_id>/messages/
```

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add conversation API endpoints with agent task dispatch`

<!-- END_TASK_4 -->

<!-- START_TASK_4B -->

### Task 4B: Update mention routing for built-in agents

**Verifies:** agent-ux.AC6.4

**Files:**

- Modify: `apps/api/plane/app/views/issue/comment.py` (the `_detect_agent_mentions()` function)

**Implementation:**

In the existing `_detect_agent_mentions()` function (called when a comment is created with an @mention), update the routing logic to handle both agent types:

After the function resolves matching `AgentProfile` objects from mention text, check each agent's `agent_type`:

- If `agent.agent_type == "external"`: dispatch `agent_webhook_send_task.delay()` (existing behaviour, unchanged).
- If `agent.agent_type == "builtin"`: dispatch `builtin_agent_execute_task.delay()` with the run ID, trigger type `"mention"`, and the comment body as `user_message`. Do NOT send a webhook.

This ensures @mentioning the built-in agent in a comment triggers the same execution path as the conversation API, satisfying AC6.4 ("reachable via both the chat UI and @mentions — same runtime, different trigger paths").

Import `builtin_agent_execute_task` from `plane.bgtasks.builtin_agent_task`.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): route @mention triggers to built-in agent task based on agent_type`

<!-- END_TASK_4B -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-7) -->

<!-- START_TASK_5 -->

### Task 5: Tests for execution task

**Verifies:** agent-ux.AC4.1, agent-ux.AC4.2, agent-ux.AC4.3, agent-ux.AC4.7, agent-ux.AC4.9

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_builtin_agent_task.py`

**Testing:**

Tests must verify:

- **agent-ux.AC4.2:** A successful execution creates activities in order: `thought` (if reasoning present), `action` (code block), `response` (output). Verify each activity has the correct `activity_type` and non-empty content.
- **agent-ux.AC4.3:** When the run has an `issue_id`, a `response` activity auto-creates an `IssueComment` with `external_source="agent"`, `actor` is the agent's bot user, and `comment_html` contains the response content.
- **agent-ux.AC4.7:** When the sandbox times out, the run transitions to `failed` and an `error` activity is created with a timeout message.
- **agent-ux.AC4.9 (stale detection):** A built-in agent run that has been `in_progress` with `last_activity_at` older than the stale timeout is correctly marked as `stale` by the existing `detect_stale_agent_runs` task. Import and call `detect_stale_agent_runs` directly. Verify it handles runs with a `conversation` FK correctly (no accidental exclusion).
- **agent-ux.AC4.1 (integration):** The full loop works: LLM returns code → sandbox executes → tool calls route through registry → response activity created → run completes.

**Mocking strategy:** Mock `litellm.completion()` to return controlled responses (code blocks, reasoning content). Mock the `SandboxExecutor` for unit-level tests (or use real executor with Deno for integration tests marked with `@pytest.mark.skipif`). Use real database via `@pytest.mark.django_db`.

Create test fixtures for: agent profile (builtin), agent run, workspace with project and issue. Follow the fixture pattern from `tests/contract/hw/test_agent_runs.py`.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass.

**Commit:** `test(hw): add tests for built-in agent execution task`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Tests for conversation endpoints and LLM client

**Verifies:** agent-ux.AC3.2, agent-ux.AC3.4, agent-ux.AC3.7

**Files:**

- Create: `apps/api/plane/tests/contract/hw/test_agent_conversations.py`
- Create: `apps/api/plane/tests/unit/hw/test_llm_client.py`

**Testing:**

**Contract tests (test_agent_conversations.py):**

- **agent-ux.AC3.2:** `POST` to `/api/workspaces/{slug}/agent-conversations/{id}/messages/` with `{"content": "..."}` creates a user message, creates an agent run, and dispatches the Celery task (mocked — verify `.delay()` was called with correct args).
- **agent-ux.AC3.7:** Sending a message as a user who is not a workspace member returns 403.
- **Conversation CRUD:** Creating a conversation returns 201. Listing conversations shows only the requesting user's conversations. Retrieving another user's conversation returns 404.
- **agent-ux.AC6.4 (mention routing):** When a comment @mentions the built-in agent, `_detect_agent_mentions()` dispatches `builtin_agent_execute_task` (not `agent_webhook_send_task`). When it @mentions an external agent, `agent_webhook_send_task` is dispatched (unchanged). Mock both tasks and verify `.delay()` was called for the correct one.

**Unit tests (test_llm_client.py):**

- **agent-ux.AC3.4 (context preservation):** `AgentLLMClient._build_history_message()` with `thinking_blocks` includes them in the output dict. Verify the message format is correct for Anthropic's API.
- **System message caching:** `_build_system_message()` produces content blocks with `cache_control: {"type": "ephemeral"}`.
- **LLMResponse:** `call()` with a mocked `litellm.completion()` returns an `LLMResponse` with correct fields. Thinking blocks from the mock response are captured.
- **Retry logic:** Mock `litellm.completion()` to raise `RateLimitError` on first call, succeed on second. Verify retry happens.

Use `@pytest.mark.django_db` for contract tests, `@pytest.mark.unit` for LLM client tests.

**Verification:**

Run: `python apps/api/run_tests.py -u && python apps/api/run_tests.py -c`
Expected: All tests pass.

**Commit:** `test(hw): add tests for conversation endpoints and LLM client`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
