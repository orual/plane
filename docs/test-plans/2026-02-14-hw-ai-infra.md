# HW AI infrastructure — human test plan

## Prerequisites

- Development environment fully running:
  - `docker compose -f docker-compose-local.yml up` for infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO)
  - Django API server on port 8000: `cd apps/api && python manage.py runserver`
  - Frontend dev servers: `pnpm dev` (web on 3000, admin on 3001)
- All backend tests passing: `cd apps/api && python run_tests.py`
- All frontend checks passing: `pnpm check`
- An admin user account created and logged in
- At least one workspace and project available

---

## Phase 1: LLM backend and grammar correction

| Step | Action                                                                                                                                                                                                                                                               | Expected                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Navigate to the admin panel at `http://localhost:3001`. Go to the AI settings page (`/ai/`).                                                                                                                                                                         | The page loads without errors.                                                                                                                                                                    |
| 1.2  | Verify the AI settings form displays: provider dropdown (with options `anthropic`, `openai`, `gemini`), model text field, API key text field (masked), base URL text field (marked optional).                                                                        | All four fields are visible and labelled correctly.                                                                                                                                               |
| 1.3  | Select `anthropic` as the provider, enter a valid Anthropic API key, leave base URL blank, and click Save. Reload the page.                                                                                                                                          | Settings persist after reload. Provider shows `anthropic`, API key is masked, base URL is empty.                                                                                                  |
| 1.4  | Inspect the `InstanceConfiguration` table in PostgreSQL for the `LLM_API_KEY` row. Run: `docker compose -f docker-compose-local.yml exec plane-db psql -U plane -c "SELECT key, value, is_encrypted FROM instance_configurations WHERE key='LLM_API_KEY';"`          | The `is_encrypted` column is `true`. The `value` column contains an encrypted blob, not plaintext.                                                                                                |
| 1.5  | Open the web app at `http://localhost:3000`. Navigate to any page editor (e.g., create a new page in a project). Open the AI assistant menu and trigger the grammar correction action on a block of text with deliberate errors (e.g., "This are a test sentense."). | The request completes successfully (no 404 or 500 in the browser network tab). The corrected text is displayed in the editor. The browser console shows no errors related to `performEditorTask`. |
| 1.6  | Change the LLM provider to `openai` in admin settings with a valid OpenAI API key. Return to the editor and trigger another AI action.                                                                                                                               | The request succeeds using OpenAI as the backend. The response is returned from the new provider.                                                                                                 |
| 1.7  | Set the LLM provider to `openai` with base URL `http://localhost:11434` (a hypothetical Ollama endpoint). Trigger an AI action.                                                                                                                                      | The request is sent to the custom base URL. If Ollama is not running, the error message should be user-friendly (e.g., "Error from openai: ..."), not a raw traceback or generic 500.             |

---

## Phase 2: AI branding and rate limit removal

| Step | Action                                                                                                                                                 | Expected                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 2.1  | Search the web app UI for any mention of "Pi", "Ask Pi", or "AskPi" in the AI-related interface elements (assistant drawer, editor AI menu, settings). | Zero occurrences. The AI assistant uses the configurable name.            |
| 2.2  | Verify there is no mention of "50 requests" or "per month per user" rate limit messaging anywhere in the AI UI.                                        | No rate limit messaging is visible. Users can make unlimited AI requests. |

---

## Phase 3: MCP sidecar container

| Step | Action                                                                                                                                                           | Expected                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Run `docker compose -f docker-compose-local.yml up -d`. Then run `docker compose -f docker-compose-local.yml ps`.                                                | The `plane-mcp` service is listed and running.                                                                                                                        |
| 3.2  | Check MCP server logs: `docker compose -f docker-compose-local.yml logs plane-mcp`.                                                                              | Logs show the MCP server started successfully and is listening on port 8001.                                                                                          |
| 3.3  | From the host machine, verify external connectivity: `curl -v http://localhost:8001/mcp` (or use an MCP client SDK).                                             | The server responds with the MCP protocol handshake or an appropriate HTTP response. Port 8001 is accessible from the host.                                           |
| 3.4  | From inside the MCP container, verify API connectivity: `docker compose -f docker-compose-local.yml exec plane-mcp wget -qO- http://api:8000/api/ 2>&1 \| head`. | The API responds (may return an auth error, but the connection succeeds — no DNS or network errors).                                                                  |
| 3.5  | Start the MCP service without credentials: `MCP_API_KEY="" docker compose -f docker-compose-local.yml up plane-mcp`. Observe the logs.                           | The container logs a clear error message about the missing API key. It does not crash-loop indefinitely — it either exits cleanly or remains in a stable error state. |
| 3.6  | Validate production compose: `docker compose config --quiet`.                                                                                                    | Exits with code 0, confirming the MCP service definition is valid YAML in the production compose file.                                                                |

---

## Phases 4–5: Agent registration, runs, and activities

| Step | Action                                                                                                                                                                                                                                                                                                                                             | Expected                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Using `curl` or an HTTP client, register an agent via the API. POST to `http://localhost:8000/api/workspaces/{slug}/agents/` with body `{"display_name": "Test Agent", "webhook_url": "https://webhook.site/{unique-id}", "webhook_secret": "test-secret", "event_triggers": {"issue_commented": true}}` using an admin session cookie or API key. | Response is 201 Created. Body includes `id`, `api_token`, `display_name`, `webhook_url`.                                                                      |
| 4.2  | Save the `api_token` from step 4.1. Use it to create a run: POST to `/api/workspaces/{slug}/agent-runs/` with header `X-API-Key: {token}` and body `{"agent_id": "{agent_id}"}`.                                                                                                                                                                   | Response is 201. `status` is `"created"`.                                                                                                                     |
| 4.3  | PATCH the run to `in_progress`: PATCH `/api/workspaces/{slug}/agent-runs/{run_id}/` with `{"status": "in_progress"}`.                                                                                                                                                                                                                              | Response is 200. `status` is `"in_progress"`.                                                                                                                 |
| 4.4  | Post a thought activity: POST to `/api/workspaces/{slug}/agent-runs/{run_id}/activities/` with `{"activity_type": "thought", "content": "Analyzing the issue..."}`.                                                                                                                                                                                | Response is 201. `is_ephemeral` is `true`.                                                                                                                    |
| 4.5  | Post a response activity on a run linked to an issue. First create a run with `issue_id` and `project_id` set. Then POST activity `{"activity_type": "response", "content": "Here is my analysis."}`.                                                                                                                                              | Response is 201. An `IssueComment` is auto-created for that issue, visible in the issue's comment timeline via the web UI. The comment actor is the bot user. |
| 4.6  | PATCH the run to `completed`: `{"status": "completed"}`.                                                                                                                                                                                                                                                                                           | Response is 200. `completed_at` is non-null.                                                                                                                  |
| 4.7  | Try to PATCH the completed run to `in_progress`.                                                                                                                                                                                                                                                                                                   | Response is 400 with an error message containing "Cannot transition".                                                                                         |
| 4.8  | Attempt to register an agent as a non-admin member (role=15).                                                                                                                                                                                                                                                                                      | Response is 403 Forbidden.                                                                                                                                    |
| 4.9  | Deactivate the agent: PATCH `/api/workspaces/{slug}/agents/{agent_id}/` with `{"is_active": false}`. Then try to use the agent's token to create a new run.                                                                                                                                                                                        | The PATCH returns 200. The subsequent run creation returns 403.                                                                                               |
| 4.10 | Make all the same requests without any authentication (no session cookie, no API key).                                                                                                                                                                                                                                                             | All requests return 401 or 403.                                                                                                                               |

---

## Phase 6: Webhook delivery

| Step | Action                                                                                                                                                                                                                                                          | Expected                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Register an agent with a `webhook_url` pointing to a publicly accessible webhook inspector (e.g., `https://webhook.site/{unique-id}`). Set `webhook_secret` to a known value. Create an issue in the project. Add a comment mentioning `@{agent-display-name}`. | The webhook inspector receives a POST request. The payload includes `event`, `action`, `agent_id`, `workspace_id`, `run_id`, and `data`. The `X-Plane-Signature` header is present. |
| 6.2  | Verify the HMAC signature. Compute `HMAC-SHA256(webhook_secret, JSON.stringify(payload))` and compare with the `X-Plane-Signature` header value.                                                                                                                | They match.                                                                                                                                                                         |
| 6.3  | Verify that mentioning a deactivated agent in a comment does NOT trigger a webhook. Deactivate the agent first, then post a comment with `@{agent-name}`.                                                                                                       | No webhook is received. No new `AgentRun` is created (verify via API: GET `/api/workspaces/{slug}/agent-runs/?agent_id={id}`).                                                      |

---

## Phase 7: Activity rendering in UI

| Step | Action                                                                                                                                                                                                                             | Expected                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7.1  | With an active agent run linked to an issue (from steps 4.1–4.5), navigate to the issue detail view in the web app at `http://localhost:3000/{workspace-slug}/projects/{project-id}/issues/{issue-id}`.                            | A collapsible agent run panel is visible on the issue detail page.                                                                                                                                     |
| 7.2  | Expand the agent run panel. Observe the thought activities.                                                                                                                                                                        | Thought activities render in a muted/subdued style (lighter text colour, e.g., `text-custom-text-400`). They are collapsed by default with an expand toggle.                                           |
| 7.3  | Observe the action activities in the panel.                                                                                                                                                                                        | Action activities render as pill-shaped status badges with the action description.                                                                                                                     |
| 7.4  | Post an error activity via the API (`{"activity_type": "error", "content": "Something went wrong"}`). Refresh the issue detail page.                                                                                               | The error activity renders as a prominent red alert banner, distinct from other activity types. The error content is readable.                                                                         |
| 7.5  | Post an elicitation activity via the API: `{"activity_type": "elicitation", "content": "What priority?", "metadata": {"question": "What priority should this issue have?", "input_type": "text"}}`. Refresh the issue detail page. | The elicitation renders as an input card with the question text and a text input field.                                                                                                                |
| 7.6  | Submit a response in the elicitation card by typing into the input and pressing the submit button.                                                                                                                                 | The input card shows the submitted response. A new response activity is posted to the run (verify via API or by refreshing the panel).                                                                 |
| 7.7  | Observe the run status badge on the issue in the issue list view.                                                                                                                                                                  | Issues with active runs (`created`, `in_progress`, or `stale`) display a status badge. Issues with only terminal runs (`completed`, `failed`, `stopped`) do not show a badge.                          |
| 7.8  | Navigate to the issue's comment timeline. Verify the bot user's comment (from step 4.5).                                                                                                                                           | The bot user's comment appears in the timeline with the bot's avatar and display name, styled the same as human comments. The `external_source="agent"` attribute does not cause any rendering issues. |

---

## Phase 8: Lifecycle background tasks

| Step | Action                                                                                                                                                                                                                                                                                                                                   | Expected                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Create a run and transition it to `in_progress`. Post one activity and then wait 5+ minutes without posting any further activities. Check the run's status via API: GET `/api/workspaces/{slug}/agent-runs/{run_id}/`.                                                                                                                   | The run's status has transitioned to `stale` (the Celery beat task `detect_stale_agent_runs` runs every minute).                |
| 8.2  | Post a new activity to the stale run. Check the run's status via API.                                                                                                                                                                                                                                                                    | The run transitions back to `in_progress` automatically.                                                                        |
| 8.3  | Complete a run. Manually set `completed_at` to 25 hours ago in the database (or wait 24+ hours). Trigger the `cleanup_ephemeral_activities` task manually: `python manage.py shell -c "from plane.bgtasks.agent_lifecycle_task import cleanup_ephemeral_activities; cleanup_ephemeral_activities()"`. Query the activities for that run. | Ephemeral activities (thoughts, actions) are deleted. Non-ephemeral activities (responses, errors, elicitations) are preserved. |

---

## End-to-end: Full agent lifecycle via HTTP only

**Purpose:** Validate AC12.3 — external runtimes can integrate using only HTTP, no SDK dependency required.

1. Register an agent using `curl`:

   ```bash
   curl -X POST http://localhost:8000/api/workspaces/{slug}/agents/ \
     -H "Cookie: {session_cookie}" -H "Content-Type: application/json" \
     -d '{"display_name":"curl-agent","webhook_url":"https://webhook.site/{id}","webhook_secret":"s3cret"}'
   ```

   Save the `api_token` and `id` from the response.

2. Create a comment mentioning the agent on an issue. Observe the webhook delivery at `webhook.site`.

3. Using only the agent's API token, create a run, post activities (thought, action, response, elicitation, error), transition through states, and complete the run:

   ```bash
   curl -X POST http://localhost:8000/api/workspaces/{slug}/agent-runs/ \
     -H "X-API-Key: {token}" -H "Content-Type: application/json" \
     -d '{"agent_id":"{id}"}'
   ```

4. Verify the entire lifecycle completes using only standard HTTP methods (POST, GET, PATCH) with JSON payloads. No WebSocket, no binary protocol, no SDK.

**Expected:** The full lifecycle completes successfully using only `curl` commands.

---

## End-to-end: Independent stage shipping

**Purpose:** Validate AC12.2 — all three stages can be shipped independently.

1. **Stage 1 (LLM backend) isolation:** Review the import graph. Verify that `plane.app.views.external.base` (LLM backend) does not import from `plane.hw.models` (agent models) or `plane.bgtasks.agent_*` (agent tasks). Deploy only the LLM backend changes (phases 1–2) and verify the AI assistant works without agent models being migrated.

2. **Stage 2 (MCP sidecar) isolation:** The MCP sidecar is a Docker service that uses only the API key for authentication. Verify `docker-compose-local.yml` can start `plane-mcp` without any backend code changes beyond the API key configuration. The MCP container depends only on `api:8000` being available.

3. **Stage 3 (Agent infrastructure) isolation:** Verify `plane.hw.models.agent` does not import from `plane.app.views.external.base` (the LLM backend functions). Agent infrastructure uses the standard Django API authentication path, not the LLM dispatch path.

**Expected:** Each stage can be deployed in isolation without cross-stage import dependencies.

---

## Human verification required

| Criterion                                              | Why manual                                                             | Steps                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| AC3.2: Frontend `performEditorTask()` calls succeed    | Full round-trip requires browser + connected backend.                  | Phase 1, step 1.5.                              |
| AC5.1: Admin settings page displays all LLM fields     | Visual presence of form fields requires browser-based inspection.      | Phase 1, steps 1.1–1.2.                         |
| AC5.3: API key is stored encrypted                     | Verifying encryption at rest requires database inspection.             | Phase 1, step 1.4.                              |
| AC6.1: Docker Compose starts MCP server                | Requires Docker environment with all containers running.               | Phase 3, steps 3.1–3.2.                         |
| AC6.2: MCP connects to API on internal network         | Requires inter-container network resolution.                           | Phase 3, step 3.4.                              |
| AC6.3: External clients can connect to MCP             | Requires running MCP server and client connection from host.           | Phase 3, step 3.3.                              |
| AC6.4: MCP without valid key fails gracefully          | Requires observing container restart behaviour.                        | Phase 3, step 3.5.                              |
| AC11.2: Thoughts render as muted/collapsed text        | Visual rendering verification.                                         | Phase 7, step 7.2.                              |
| AC11.3: Actions render as status pills                 | Visual rendering verification.                                         | Phase 7, step 7.3.                              |
| AC11.4: Errors render as red alert banners             | Visual rendering verification.                                         | Phase 7, step 7.4.                              |
| AC11.5: Elicitations render as input cards with submit | Interactive browser testing.                                           | Phase 7, steps 7.5–7.6.                         |
| AC11.7: Bot user comments appear in timeline           | End-to-end rendering of `IssueComment` with `external_source="agent"`. | Phase 7, step 7.8.                              |
| AC12.2: Three stages ship independently                | Architectural constraint requiring import analysis.                    | End-to-end: Independent stage shipping.         |
| AC12.3: External runtimes integrate via HTTP only      | API contract verification.                                             | End-to-end: Full agent lifecycle via HTTP only. |

---

## Traceability matrix

| AC     | Automated test                                                                                                                                     | Manual step                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| AC1.1  | `test_llm_backend.py::test_anthropic_model_prefix`                                                                                                 | —                                       |
| AC1.2  | `test_llm_backend.py::test_openai_model_no_prefix`                                                                                                 | —                                       |
| AC1.3  | `test_llm_backend.py::test_gemini_model_prefix`                                                                                                    | —                                       |
| AC1.4  | `test_llm_backend.py::test_base_url_passed_as_api_base`                                                                                            | —                                       |
| AC1.5  | `test_llm_backend.py::test_reasoning_content_returned_when_present` + `test_llm_endpoint.py::test_endpoint_returns_reasoning_content_when_present` | —                                       |
| AC1.6  | `test_llm_backend.py::test_authentication_error_handling`                                                                                          | —                                       |
| AC1.7  | `test_llm_backend.py::test_api_error_handling`                                                                                                     | 1.7                                     |
| AC1.8  | `test_llm_backend.py::test_unknown_model_error`                                                                                                    | —                                       |
| AC2.1  | `test_llm_backend.py::test_anthropic_models_present`                                                                                               | —                                       |
| AC2.2  | `test_llm_backend.py::test_openai_models_present`                                                                                                  | —                                       |
| AC2.3  | `test_llm_backend.py::test_gemini_models_present`                                                                                                  | —                                       |
| AC2.4  | `test_llm_backend.py::test_default_provider_is_anthropic`                                                                                          | —                                       |
| AC3.1  | `test_grammar_endpoint.py::test_grammar_correction_with_valid_text`                                                                                | 1.5                                     |
| AC3.2  | —                                                                                                                                                  | 1.5                                     |
| AC3.3  | `test_grammar_endpoint.py::test_grammar_correction_with_empty_text_input`                                                                          | —                                       |
| AC4.1  | grep verification                                                                                                                                  | 2.1                                     |
| AC4.2  | grep verification                                                                                                                                  | 2.1                                     |
| AC4.3  | grep verification                                                                                                                                  | 2.2                                     |
| AC5.1  | —                                                                                                                                                  | 1.1–1.2                                 |
| AC5.2  | `test_llm_admin_settings.py::test_llm_config_uses_updated_values`                                                                                  | 1.6                                     |
| AC5.3  | —                                                                                                                                                  | 1.4                                     |
| AC5.4  | `test_llm_backend.py::test_base_url_not_passed_when_empty`                                                                                         | —                                       |
| AC6.1  | —                                                                                                                                                  | 3.1–3.2                                 |
| AC6.2  | —                                                                                                                                                  | 3.4                                     |
| AC6.3  | —                                                                                                                                                  | 3.3                                     |
| AC6.4  | —                                                                                                                                                  | 3.5                                     |
| AC6.5  | docker compose config                                                                                                                              | 3.6                                     |
| AC7.1  | `test_agent_models.py::test_agent_profile_creation` + `test_agent_registration.py::test_ac7_1_...`                                                 | 4.1                                     |
| AC7.2  | `test_agent_registration.py::test_ac7_2_...`                                                                                                       | 4.2                                     |
| AC7.3  | `test_agent_models.py::test_agent_profile_field_storage` + `test_agent_registration.py::test_ac7_3_...`                                            | 4.1                                     |
| AC7.4  | `test_agent_registration.py::test_ac7_4_...`                                                                                                       | 4.8                                     |
| AC7.5  | `test_agent_registration.py::test_ac7_5_...`                                                                                                       | 4.9                                     |
| AC8.1  | `test_agent_models.py::test_valid_transition_*` + `test_agent_runs.py::test_ac8_1_...`                                                             | 4.2–4.3, 4.6                            |
| AC8.2  | `test_agent_models.py::test_valid_transition_*_to_failed/stopped` + `test_agent_runs.py::test_ac8_2_...`                                           | —                                       |
| AC8.3  | `test_agent_lifecycle.py::test_inactive_runs_marked_stale_after_timeout`                                                                           | 8.1                                     |
| AC8.4  | `test_agent_lifecycle.py::test_stale_runs_resume_to_in_progress`                                                                                   | 8.2                                     |
| AC8.5  | `test_agent_models.py::test_invalid_transition_completed_to_in_progress` + `test_agent_runs.py::test_ac8_5_...`                                    | 4.7                                     |
| AC9.1  | `test_agent_models.py::test_activity_type_thought/action_sets_ephemeral` + `test_agent_runs.py::test_ac9_1_...`                                    | 4.4                                     |
| AC9.2  | `test_agent_runs.py::test_ac9_2_...`                                                                                                               | 4.5                                     |
| AC9.3  | `test_agent_runs.py::test_ac9_3_...`                                                                                                               | —                                       |
| AC9.4  | `test_agent_runs.py::test_ac9_4_...`                                                                                                               | 7.4                                     |
| AC9.5  | `test_agent_lifecycle.py::test_ephemeral_activities_cleaned_after_24h`                                                                             | 8.3                                     |
| AC9.6  | `test_agent_runs.py::test_ac9_6_...`                                                                                                               | —                                       |
| AC10.1 | `test_agent_webhook.py::test_detect_agent_mentions_dispatches_webhook_*`                                                                           | 6.1                                     |
| AC10.2 | `test_agent_webhook.py::test_agent_webhook_task_sends_hmac_signature`                                                                              | 6.2                                     |
| AC10.3 | `test_agent_webhook.py::test_agent_webhook_task_includes_run_id` + `test_detect_agent_mentions_creates_agent_run`                                  | 6.1                                     |
| AC10.4 | `test_agent_webhook.py::test_agent_webhook_task_decorator_has_retry_config`                                                                        | —                                       |
| AC10.5 | `test_agent_webhook.py::test_agent_webhook_task_deactivates_agent_on_max_retries`                                                                  | —                                       |
| AC10.6 | `test_agent_webhook.py::test_detect_agent_mentions_with_deactivated_agent_does_not_dispatch`                                                       | 6.3                                     |
| AC11.1 | `agent-run.store.test.ts::fetchRunsForIssue + getRunsByIssueId`                                                                                    | 7.1                                     |
| AC11.2 | —                                                                                                                                                  | 7.2                                     |
| AC11.3 | —                                                                                                                                                  | 7.3                                     |
| AC11.4 | —                                                                                                                                                  | 7.4                                     |
| AC11.5 | —                                                                                                                                                  | 7.5–7.6                                 |
| AC11.6 | `agent-run.store.test.ts::hasActiveRuns`                                                                                                           | 7.7                                     |
| AC11.7 | —                                                                                                                                                  | 7.8                                     |
| AC12.1 | `test_agent_registration.py::TestAgentUnauthenticatedAccess` (6 tests)                                                                             | 4.10                                    |
| AC12.2 | —                                                                                                                                                  | E2E: Independent stage shipping         |
| AC12.3 | —                                                                                                                                                  | E2E: Full agent lifecycle via HTTP only |
