# Test Requirements: HW AI Infrastructure

This document maps every acceptance criterion (AC1 through AC12, all sub-criteria) to either
an automated test or a human verification step. Test file paths reference the locations specified
in the implementation plans (phases 1 through 8).

---

## Automated Test Coverage

### hw-ai-infra.AC1: LLM backend dispatches correctly to each provider

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC1.1 | Anthropic models dispatch with `anthropic/` prefix via LiteLLM | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.2 | OpenAI models dispatch with bare model names (no prefix) | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.3 | Gemini models dispatch with `gemini/` prefix via LiteLLM | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.4 | Ollama endpoint works when `LLM_BASE_URL` is set, passed as `api_base` kwarg | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.5 | Anthropic extended thinking models return `reasoning_content` in the response | unit + contract | `apps/api/plane/tests/unit/hw/test_llm_backend.py`, `apps/api/plane/tests/contract/hw/test_llm_endpoint.py` | 1 |
| AC1.6 | Invalid API key returns a clear error message, not a raw stack trace | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.7 | Unreachable provider returns a user-friendly error after retries | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC1.8 | Unknown model name returns an error identifying the invalid model | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |

**Test details:**
- All AC1 unit tests mock `litellm.completion` to avoid real API calls.
- AC1.1-AC1.3: Assert the `model` kwarg passed to `litellm.completion()` has the correct prefix.
- AC1.4: Assert `api_base` kwarg is present when `base_url` is non-empty.
- AC1.5: Unit test verifies the third return value of `get_llm_response()` is populated when mock response has `reasoning_content`. Contract test verifies the JSON response from the endpoint includes `reasoning_content` when present.
- AC1.6: Mock raises `AuthenticationError`; assert return tuple contains a clear error string.
- AC1.7: Mock raises `APIError`; assert return tuple contains a user-friendly error string.
- AC1.8: Pass a model not in `PROVIDER_MODELS[provider]["models"]`; assert error identifies the invalid model name.

---

### hw-ai-infra.AC2: Model lists are current

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC2.1 | Anthropic model list includes claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001 | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC2.2 | OpenAI model list includes gpt-5.2, gpt-5.2-pro, gpt-4.1, o4-mini | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC2.3 | Gemini model list includes gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |
| AC2.4 | Anthropic is the default/primary provider | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |

**Test details:**
- AC2.1-AC2.3: Direct assertions against `PROVIDER_MODELS["anthropic"]["models"]`, `PROVIDER_MODELS["openai"]["models"]`, and `PROVIDER_MODELS["gemini"]["models"]`.
- AC2.4: Assert `DEFAULT_PROVIDER == "anthropic"`.

---

### hw-ai-infra.AC3: /rephrase-grammar/ endpoint works

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC3.1 | POST to `/rephrase-grammar/` with text returns grammar-corrected version | contract | `apps/api/plane/tests/contract/hw/test_grammar_endpoint.py` | 2 |
| AC3.2 | Frontend `performEditorTask()` calls succeed (no longer 404) | human | N/A (see Human Verification) | 2 |
| AC3.3 | Empty text input returns validation error | contract | `apps/api/plane/tests/contract/hw/test_grammar_endpoint.py` | 2 |

**Test details:**
- AC3.1: POST with valid `text_input` via `session_client`; mock `litellm.completion`; assert 200 with `{"response": "..."}`.
- AC3.3: POST with empty `text_input`; assert 400 with validation error message.

---

### hw-ai-infra.AC4: AI is rebranded and rate limit removed

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC4.1 | No "Pi" or "Ask Pi" strings appear in the frontend | automated grep | N/A (shell grep verification during Phase 2, Task 3 and Task 5) | 2 |
| AC4.2 | AI name is stored as a single constant, easily swappable | automated grep | N/A (shell grep verification during Phase 2, Task 3) | 2 |
| AC4.3 | Users can make unlimited AI requests (no 50/month cap) | automated grep | N/A (shell grep verification during Phase 2, Task 4) | 2 |

**Test details:**
- AC4.1: `grep -rn '"Pi "\|"Ask Pi"\|AskPi\|ask-pi' apps/web/` returns zero matches after changes.
- AC4.2: `grep -rn 'AI_ASSISTANT_NAME' apps/web/core/constants/ai.ts` confirms the constant exists and is the single source.
- AC4.3: `grep -rn '50 requests\|per month per user' apps/web/` returns zero matches after changes.

These are verification-by-grep steps that run during implementation. They can be converted to CI lint rules or snapshot tests if desired, but are currently shell-level checks.

---

### hw-ai-infra.AC5: Instance admin settings for LLM configuration

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC5.1 | Admin settings page displays provider, model, API key, and base URL fields | human | N/A (see Human Verification) | 2 |
| AC5.2 | Changing provider/model in settings takes effect on next AI request | contract | `apps/api/plane/tests/contract/hw/test_llm_admin_settings.py` | 2 |
| AC5.3 | API key is stored encrypted (existing pattern via `LLM_API_KEY`) | human | N/A (see Human Verification) | 2 |
| AC5.4 | Base URL field is optional -- blank means use provider default | unit | `apps/api/plane/tests/unit/hw/test_llm_backend.py` | 1 |

**Test details:**
- AC5.2: Contract test creates `InstanceConfiguration` entries for `LLM_PROVIDER` and `LLM_BASE_URL`, calls `get_llm_config()`, asserts returned values match, then updates values and re-asserts.
- AC5.4: Unit test verifies `get_llm_response()` does not pass `api_base` to `litellm.completion()` when `base_url` is empty.

---

### hw-ai-infra.AC6: MCP server runs as a sidecar container

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC6.1 | `docker compose up` starts the MCP server alongside other services | human | N/A (see Human Verification) | 3 |
| AC6.2 | MCP server connects to the API on the internal network (`api:8000`) | human | N/A (see Human Verification) | 3 |
| AC6.3 | External MCP clients can connect to `localhost:8001` and list/execute tools | human | N/A (see Human Verification) | 3 |
| AC6.4 | MCP server without a valid `MCP_API_KEY` fails with a clear error, doesn't crash-loop | human | N/A (see Human Verification) | 3 |
| AC6.5 | Both `docker-compose-local.yml` and `docker-compose.yml` include the MCP service | automated grep | N/A (shell verification: `docker compose -f <file> config --quiet`) | 3 |

**Test details:**
- AC6.5: `docker compose -f docker-compose-local.yml config --quiet` and `docker compose config --quiet` both exit 0, confirming the service definition is valid YAML in both files.

---

### hw-ai-infra.AC7: Agents can be registered and authenticated

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC7.1 | POST to agent registration creates bot User + AgentProfile + APIToken | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 4, 5 |
| AC7.2 | Agent API token authenticates against runtime endpoints | contract | `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 5 |
| AC7.3 | Agent profile stores webhook URL, secret, and event triggers | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 4, 5 |
| AC7.4 | Non-admin users cannot register agents (403) | contract | `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 5 |
| AC7.5 | Deactivated agent's token is rejected (401 or 403) | contract | `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 5 |

**Test details:**
- AC7.1 (unit): Create `AgentProfile` with a bot `User` (`is_bot=True`, `bot_type=AGENT`); verify all objects are persisted.
- AC7.1 (contract): POST to `/api/workspaces/{slug}/agents/` with valid data; assert response includes profile data and API token.
- AC7.2: Use the returned token in the `Authorization` header; GET `/api/workspaces/{slug}/agent-runs/`; assert 200.
- AC7.3 (unit): Create `AgentProfile` with `webhook_url`, `webhook_secret`, `event_triggers`; refresh from DB and verify all fields.
- AC7.3 (contract): GET the created agent profile; verify webhook fields are present in the response.
- AC7.4: Authenticate as a non-admin workspace member; POST to agents/; assert 403.
- AC7.5: PATCH agent to `is_active=False`; use agent token; assert 403.

---

### hw-ai-infra.AC8: Agent run lifecycle works

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC8.1 | Run transitions `created` -> `in_progress` -> `completed` | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 4, 5 |
| AC8.2 | Run can be marked `failed` or `stopped` | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 4, 5 |
| AC8.3 | Inactive runs are marked `stale` after timeout (default 5 minutes) | unit | `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py` | 8 |
| AC8.4 | Stale runs resume to `in_progress` when new activity is posted | unit | `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py` | 8 |
| AC8.5 | Invalid status transitions are rejected (e.g., `completed` -> `in_progress`) | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 4, 5 |

**Test details:**
- AC8.1 (unit): Call `validate_transition()` for `created->in_progress` and `in_progress->completed`; assert no exception.
- AC8.1 (contract): POST to create run, PATCH status to `in_progress`, PATCH to `completed`; all succeed with 200.
- AC8.2 (unit): Call `validate_transition()` for `in_progress->failed` and `in_progress->stopped`; assert no exception.
- AC8.2 (contract): Transition to `failed` and `stopped` via PATCH; assert 200.
- AC8.3: Create `AgentRun` with `status=IN_PROGRESS` and `last_activity_at` set to 6 minutes ago; call `detect_stale_agent_runs()`; assert status is now `STALE`. Also test that runs within the timeout window are not marked stale, that custom `stale_timeout` values are respected, and that only `in_progress` runs are affected.
- AC8.4: Create `AgentRun` with `status=STALE`; call `validate_transition(AgentRunStatus.IN_PROGRESS)`; assert no exception raised. The actual auto-transition is implemented in `AgentRunActivityViewSet.create` (Phase 5) and tested via contract test in AC9 scenarios.
- AC8.5 (unit): Call `validate_transition()` for `completed->in_progress`; assert `ValueError`.
- AC8.5 (contract): PATCH a completed run to `in_progress`; assert 400 with error message.

---

### hw-ai-infra.AC9: Activity system works

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC9.1 | Thoughts and actions stored with `is_ephemeral=True` | unit + contract | `apps/api/plane/tests/unit/hw/test_agent_models.py`, `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 4, 5 |
| AC9.2 | Response activities auto-create IssueComments with bot user as actor | contract | `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 5 |
| AC9.3 | Elicitation activities store question and expected input type | contract | `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 5 |
| AC9.4 | Error activities are stored and retrievable | contract | `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 5 |
| AC9.5 | Ephemeral activities cleaned up after run completion (24h window) | unit | `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py` | 8 |
| AC9.6 | IssueComments from response activities have `external_source="agent"` and correct `external_id` | contract | `apps/api/plane/tests/contract/hw/test_agent_runs.py` | 5 |

**Test details:**
- AC9.1 (unit): Create `AgentRunActivity` with `activity_type="thought"`; assert `is_ephemeral=True` after save. Same for `"action"`.
- AC9.1 (contract): POST activity with `activity_type="thought"`; assert response has `is_ephemeral=True`.
- AC9.2: POST activity with `activity_type="response"` on a run linked to an issue; query `IssueComment` for that issue; assert comment exists with `actor` set to the bot user.
- AC9.3: POST activity with `activity_type="elicitation"` and `metadata={"question": "...", "input_type": "text"}`; GET the activity; assert metadata is stored correctly.
- AC9.4: POST activity with `activity_type="error"`; GET activities for the run; assert the error activity is present.
- AC9.5: Create completed run with `completed_at` 25 hours ago; create ephemeral and non-ephemeral activities; call `cleanup_ephemeral_activities()`; assert only ephemeral activities are deleted. Also test recently completed runs (within 24h) are not cleaned, `failed`/`stopped` runs are also cleaned, and `in_progress` runs are not cleaned.
- AC9.6: After posting a response activity, query `IssueComment` and assert `external_source="agent"` and `external_id="{run_id}:{activity_id}"`.

---

### hw-ai-infra.AC10: Webhook delivery triggers agents

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC10.1 | Comment containing `@agent-name` triggers a webhook | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |
| AC10.2 | Webhook payload is HMAC-SHA256 signed with the agent's secret | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |
| AC10.3 | Webhook payload includes a pre-created AgentRun ID | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |
| AC10.4 | Failed webhook delivery retries with exponential backoff | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |
| AC10.5 | Persistently failing webhook auto-deactivates the agent | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |
| AC10.6 | Mentioning a deactivated agent does not trigger a webhook | unit | `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | 6 |

**Test details:**
- AC10.1: Call `_detect_agent_mentions()` with text containing `@myagent` where `myagent` is a registered active agent; assert `agent_webhook_send_task.delay()` is called. Mock the delay method.
- AC10.2: Execute `agent_webhook_send_task` with a mock for `requests.post`; capture the headers; verify `X-Plane-Signature` is present and matches the HMAC-SHA256 digest of the payload using the agent's `webhook_secret`.
- AC10.3: Verify the payload dict passed to `requests.post` contains a `run_id` field matching the pre-created `AgentRun.id`.
- AC10.4: Assert the task decorator includes `autoretry_for=(requests.RequestException,)`, `retry_backoff=600`, `max_retries=5` by inspecting task attributes.
- AC10.5: Simulate the task reaching `max_retries`; assert `AgentProfile.objects.get(pk=agent.id).is_active` is `False`.
- AC10.6: Call `_detect_agent_mentions()` with text containing `@deactivated-agent` where the agent has `is_active=False`; assert `agent_webhook_send_task.delay()` is NOT called.

---

### hw-ai-infra.AC11: Activity rendering in UI

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC11.1 | Issue detail view shows a collapsible panel for active agent runs | unit (store) | `apps/web/hw/store/agent/__tests__/agent-run.store.test.ts` | 7 |
| AC11.2 | Thoughts render as muted/collapsed text | human | N/A (see Human Verification) | 7 |
| AC11.3 | Actions render as status pills | human | N/A (see Human Verification) | 7 |
| AC11.4 | Errors render as red alert banners | human | N/A (see Human Verification) | 7 |
| AC11.5 | Elicitations render as input cards; submitting posts a response activity | human | N/A (see Human Verification) | 7 |
| AC11.6 | Run status badge appears on issues with active runs | unit (store) | `apps/web/hw/store/agent/__tests__/agent-run.store.test.ts` | 7 |
| AC11.7 | Bot user comments appear naturally in the issue timeline with avatar and display name | human | N/A (see Human Verification) | 7 |

**Test details:**
- AC11.1 (store): After `fetchRunsForIssue()`, assert `getRunsByIssueId(issueId)` returns the expected `TAgentRun[]`. The visual collapsible panel is verified manually.
- AC11.6 (store): Assert `hasActiveRuns(issueId)` returns `true` when runs have status `created`, `in_progress`, or `stale`; returns `false` when all runs are terminal. The visual badge rendering is verified manually.

---

### hw-ai-infra.AC12: Cross-cutting behaviours

| Criterion | Description | Test Type | Test File | Phase |
|-----------|-------------|-----------|-----------|-------|
| AC12.1 | All agent API endpoints require authentication (no anonymous access) | contract | `apps/api/plane/tests/contract/hw/test_agent_registration.py` | 5 |
| AC12.2 | All three stages can be shipped independently | human | N/A (see Human Verification) | N/A |
| AC12.3 | External runtimes can integrate using only HTTP -- no SDK dependency required | human | N/A (see Human Verification) | 5 |

**Test details:**
- AC12.1: Make unauthenticated requests (no token) to each agent endpoint (`/agents/`, `/agent-runs/`, `/agent-runs/{id}/activities/`); assert 401 or 403 for each. This should be included as additional test cases in the existing contract test file.

---

## Human Verification Required

| Criterion | Justification | Verification Approach |
|-----------|---------------|----------------------|
| AC3.2: Frontend `performEditorTask()` calls succeed | Requires a running frontend with connected backend; verifying the full round-trip (editor -> API -> LLM -> response rendered) involves browser interaction that is not unit-testable. | Start the dev environment (`pnpm dev` + Django dev server). Open a page editor, trigger the grammar correction action (via the AI menu). Verify the request succeeds (no 404 in the browser console) and returns a corrected text response. Additionally, `pnpm check:types` confirms the TypeScript contract compiles. |
| AC5.1: Admin settings page displays all LLM fields | Verifying visual presence of form fields in the admin React app requires browser-based UI testing which is not covered by the project's current test infrastructure. | Start the admin app (`pnpm dev`). Navigate to the AI settings page (`/ai/`). Verify that the form displays: LLM Provider (dropdown with anthropic, openai, gemini), LLM Model (text field), API Key (text field, masked), Base URL (text field, optional). Save and reload to confirm persistence. |
| AC5.3: API key is stored encrypted | The existing `LLM_API_KEY` uses `is_encrypted=True` in the instance config variable definition. Verifying encryption at rest requires inspecting the database directly. | Inspect the `InstanceConfiguration` table for the `LLM_API_KEY` row. Verify the `value` column contains an encrypted blob (not plaintext). Alternatively, confirm `is_encrypted=True` is set in `core.py` for the `LLM_API_KEY` entry. This can also be a code-review check since the encryption pattern is already established. |
| AC6.1: `docker compose up` starts the MCP server | Requires a running Docker environment with all containers. Integration testing of Docker Compose service orchestration is outside the automated test suite. | Run `docker compose -f docker-compose-local.yml up -d`. Run `docker compose -f docker-compose-local.yml ps`. Verify `plane-mcp` is listed as running. Check logs: `docker compose -f docker-compose-local.yml logs plane-mcp` shows the MCP server listening on port 8001. |
| AC6.2: MCP server connects to the API on the internal network | Requires a running Docker network with both API and MCP containers. Tests inter-container network resolution. | From the MCP container, verify the API is reachable: `docker compose exec plane-mcp wget -qO- http://api:8000/api/` returns a response (or appropriate auth error). Alternatively, check MCP server logs for successful API connectivity. |
| AC6.3: External MCP clients can connect to `localhost:8001` | Requires a running MCP server and an MCP client (Claude Code, Cursor, or `curl`). | With `plane-mcp` running, connect from the host: `curl http://localhost:8001/mcp` (or use an MCP client SDK). Verify the server responds with the MCP protocol handshake. For a full test: configure Claude Code or Cursor to point at `localhost:8001` and verify that Plane tools (list issues, create issues, etc.) are available and functional. |
| AC6.4: MCP server without `MCP_API_KEY` fails gracefully | Requires observing Docker container restart behaviour with specific environment configurations. | Start the MCP service without credentials: `MCP_API_KEY="" docker compose -f docker-compose-local.yml up plane-mcp`. Observe that the container logs a clear error about the missing API key. Verify it does not crash-loop indefinitely (it should either exit cleanly or log the error and remain in a waiting state). If crash-looping is observed, an entrypoint validation script must be added. |
| AC11.2: Thoughts render as muted/collapsed text | Visual rendering verification requires a running frontend with agent data. No component-level snapshot tests exist in the current frontend test infrastructure. | With agent test data loaded (or using a mock/storybook), navigate to an issue with an active agent run. Expand the agent run panel. Verify thought activities render in a muted style (`text-custom-text-400` or similar subdued color) and are collapsed by default with an expand toggle. |
| AC11.3: Actions render as status pills | Visual rendering verification. Same constraints as AC11.2. | In the agent run panel, verify action activities render as pill-shaped badges with the action description. Confirm styling matches design intent (e.g., `bg-custom-primary-100/20 text-custom-primary-100`). |
| AC11.4: Errors render as red alert banners | Visual rendering verification. Same constraints as AC11.2. | In the agent run panel, verify error activities render as prominent red banners (`bg-red-500/10 border-red-500/20 text-red-500`) distinct from other activity types. Verify the error content is readable. |
| AC11.5: Elicitations render as input cards; submitting posts response | Requires interactive browser testing of the elicitation card component with a live backend. | Navigate to an issue with an active agent run that has posted an elicitation activity. Verify the elicitation renders as a card with the agent's question and the appropriate input type (`text` input or `select` option buttons). Submit a response. Verify: (1) the input card shows the submitted response, (2) a new response activity is posted to the agent run (check via API or logs), (3) the activity timeline updates. |
| AC11.7: Bot user comments appear naturally in the timeline | Requires end-to-end verification that `IssueComment` records created by response activities render correctly in the existing comment timeline. | Create an agent run, post a response activity (which auto-creates an `IssueComment`). Navigate to the issue detail view. Verify the bot user's comment appears in the timeline with the bot's avatar and display name, styled the same as human comments. Verify `external_source="agent"` does not cause any rendering issues. |
| AC12.2: All three stages can be shipped independently | Architectural constraint requiring analysis of import and runtime dependencies across stages. | Code review: verify that Stage 1 (LLM backend, phases 1-2) has no imports from Stage 3 models/views. Verify Stage 2 (MCP sidecar, phase 3) depends only on Docker configuration, not on Stage 1 or 3 code. Verify Stage 3 (agent infrastructure, phases 4-8) does not import from Stage 1 LLM functions. Each stage should be deployable in isolation: deploy only Stage 2 by adding the MCP service without any backend code changes; deploy only Stage 1 without agent models. |
| AC12.3: External runtimes can integrate using only HTTP | Architectural constraint requiring analysis of the API contract. | Review the agent API endpoints registered in Phase 5. Verify that the full agent lifecycle (register agent -> receive webhook -> create run -> post activities -> complete run) uses only standard HTTP methods (POST, GET, PATCH) with JSON payloads. Verify no client SDK, WebSocket connection, or custom binary protocol is required. Confirm the webhook contract (Phase 6) uses standard HTTP POST with JSON body and HMAC signature header. Optionally, write a minimal integration test using only `curl` commands to complete the full lifecycle. |

---

## Test File Summary

| Test File | Type | Phase | ACs Covered |
|-----------|------|-------|-------------|
| `apps/api/plane/tests/unit/hw/test_llm_backend.py` | unit | 1 | AC1.1-AC1.8, AC2.1-AC2.4, AC5.4 |
| `apps/api/plane/tests/contract/hw/test_llm_endpoint.py` | contract | 1 | AC1.5 |
| `apps/api/plane/tests/contract/hw/test_grammar_endpoint.py` | contract | 2 | AC3.1, AC3.3 |
| `apps/api/plane/tests/contract/hw/test_llm_admin_settings.py` | contract | 2 | AC5.2 |
| `apps/api/plane/tests/unit/hw/test_agent_models.py` | unit | 4 | AC7.1 (partial), AC7.3 (partial), AC8.1, AC8.2, AC8.5, AC9.1 |
| `apps/api/plane/tests/unit/hw/test_agent_serializers.py` | unit | 4 | (serializer field validation -- supports AC7, AC8, AC9 correctness) |
| `apps/api/plane/tests/contract/hw/test_agent_registration.py` | contract | 5 | AC7.1-AC7.5, AC12.1 |
| `apps/api/plane/tests/contract/hw/test_agent_runs.py` | contract | 5 | AC8.1, AC8.2, AC8.5, AC9.1-AC9.4, AC9.6 |
| `apps/api/plane/tests/unit/hw/test_agent_webhook.py` | unit | 6 | AC10.1-AC10.6 |
| `apps/web/hw/store/agent/__tests__/agent-run.store.test.ts` | unit (Vitest) | 7 | AC11.1, AC11.6 |
| `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py` | unit | 8 | AC8.3, AC8.4, AC9.5 |

---

## Running the Tests

```bash
# All backend unit tests
cd apps/api && python run_tests.py -u

# All backend contract tests
cd apps/api && python run_tests.py -c

# All backend tests with coverage
cd apps/api && python run_tests.py -o

# Frontend store tests
pnpm test --filter=web

# All checks (lint, types, format)
pnpm check
```
