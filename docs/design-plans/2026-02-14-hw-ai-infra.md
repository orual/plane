# HW AI infrastructure design

## Summary

This design establishes three layers of AI infrastructure for the Plane HW fork. **Stage 1** replaces the current broken LLM backend (which incorrectly routes all providers through OpenAI's client) with LiteLLM, a unified gateway that dispatches to each provider's native SDK. This modernises the chatbot with current model lists (Anthropic as primary, OpenAI/Gemini/Ollama as alternatives), implements the missing grammar-correction endpoint, removes hardcoded rate limits, and rebrands from "Pi" to a configurable AI assistant name. **Stage 2** adds a containerised MCP server as a sidecar service, making Plane's API immediately accessible to Claude Code, Cursor, or any MCP-compatible client without custom integration work. **Stage 3** builds agent integration infrastructure inspired by Plane Cloud's agent protocol: bot user accounts with API key authentication, a run lifecycle system (created → in_progress → completed/failed/stopped), an activity model for thoughts/actions/responses/errors, webhook delivery for triggering agents via @-mentions, and UI rendering of agent reasoning inline with issue timelines.

The architecture reuses existing Plane patterns throughout: the bot user system (`User.is_bot`, `BotTypeEnum`), the webhook delivery pipeline (HMAC signing, retries, auto-deactivation), the comment system (`IssueComment.actor` as bot, `external_source` tracking), and the instance config pattern (env vars read via `get_llm_config()`). Each stage ships independently. No OAuth, no built-in agents — just clean HTTP contracts for maximum composability.

## Definition of Done

This design covers three independently-shippable stages of AI infrastructure for the Plane HW fork:

**Stage 1 — Fix and modernise the AI chatbot:**

- The backend dispatches to each provider's native SDK (Anthropic Messages API, OpenAI Chat Completions, Gemini) instead of routing everything through OpenAI's client.
- Model lists are current; Anthropic is the primary provider, OpenAI doubles as the Ollama/self-hosted endpoint via configurable `base_url`.
- The missing `/rephrase-grammar/` endpoint is implemented.
- The AI is rebranded from "Pi"; the hardcoded 50 requests/month rate limit is removed or made configurable.
- Instance admin settings support provider, model, API key, and base URL configuration.

**Stage 2 — MCP server sidecar:**

- The `plane-mcp-server` runs as a container in both `docker-compose-local.yml` and `docker-compose.yml`, auto-configured with Plane API credentials.
- MCP is available out of the box, connectable from Claude Code, Cursor, or any MCP-compatible client.

**Stage 3 — Agent integration infrastructure (inspired by Plane's agent protocol):**

- Agent registration via API keys (no OAuth — simple bot token auth).
- Agent run lifecycle: create → in_progress → completed/failed/stopped, with stale detection.
- Activity system: thoughts (ephemeral), actions (ephemeral), responses (persistent comments), elicitations (request user input), errors.
- Webhook delivery when agents are triggered (mentions in comments, or configured event hooks).
- Activity rendering in the UI (show agent reasoning inline, persist final responses as comments).
- Adapter-friendly design: external runtimes receive webhooks and respond via API — Pattern, Letta, or anything else can plug in.
- NOT building: OAuth app registration, the agent runtime itself, built-in agents, or exact Cloud API compatibility.

## Acceptance criteria

### hw-ai-infra.AC1: LLM backend dispatches correctly to each provider

- **hw-ai-infra.AC1.1 Success:** Anthropic models return valid completions via LiteLLM with `anthropic/` prefix routing
- **hw-ai-infra.AC1.2 Success:** OpenAI models return valid completions via LiteLLM with bare model names
- **hw-ai-infra.AC1.3 Success:** Gemini models return valid completions via LiteLLM with `gemini/` prefix routing
- **hw-ai-infra.AC1.4 Success:** Ollama endpoint works when `LLM_BASE_URL` is set, routing through OpenAI-compatible API
- **hw-ai-infra.AC1.5 Success:** Anthropic extended thinking models return `reasoning_content` in the response
- **hw-ai-infra.AC1.6 Failure:** Invalid API key returns a clear error message, not a raw stack trace
- **hw-ai-infra.AC1.7 Failure:** Unreachable provider returns a user-friendly error after retries
- **hw-ai-infra.AC1.8 Edge:** Unknown model name returns an error identifying the invalid model

### hw-ai-infra.AC2: Model lists are current

- **hw-ai-infra.AC2.1 Success:** Anthropic model list includes claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001
- **hw-ai-infra.AC2.2 Success:** OpenAI model list includes gpt-5.2, gpt-5.2-pro, gpt-4.1, o4-mini
- **hw-ai-infra.AC2.3 Success:** Gemini model list includes gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
- **hw-ai-infra.AC2.4 Success:** Anthropic is the default/primary provider

### hw-ai-infra.AC3: /rephrase-grammar/ endpoint works

- **hw-ai-infra.AC3.1 Success:** POST to `/rephrase-grammar/` with text returns grammar-corrected version
- **hw-ai-infra.AC3.2 Success:** Frontend `performEditorTask()` calls succeed (no longer 404)
- **hw-ai-infra.AC3.3 Failure:** Empty text input returns validation error

### hw-ai-infra.AC4: AI is rebranded and rate limit removed

- **hw-ai-infra.AC4.1 Success:** No "Pi" or "Ask Pi" strings appear in the frontend
- **hw-ai-infra.AC4.2 Success:** AI name is stored as a single constant, easily swappable
- **hw-ai-infra.AC4.3 Success:** Users can make unlimited AI requests (no 50/month cap)

### hw-ai-infra.AC5: Instance admin settings for LLM configuration

- **hw-ai-infra.AC5.1 Success:** Admin settings page displays provider, model, API key, and base URL fields
- **hw-ai-infra.AC5.2 Success:** Changing provider/model in settings takes effect on next AI request
- **hw-ai-infra.AC5.3 Success:** API key is stored encrypted (existing pattern via `LLM_API_KEY`)
- **hw-ai-infra.AC5.4 Edge:** Base URL field is optional — blank means use provider default

### hw-ai-infra.AC6: MCP server runs as a sidecar container

- **hw-ai-infra.AC6.1 Success:** `docker compose up` starts the MCP server alongside other services
- **hw-ai-infra.AC6.2 Success:** MCP server connects to the API on the internal network (`api:8000`)
- **hw-ai-infra.AC6.3 Success:** External MCP clients can connect to `localhost:8001` and list/execute tools
- **hw-ai-infra.AC6.4 Failure:** MCP server without a valid `MCP_API_KEY` fails with a clear error, doesn't crash-loop
- **hw-ai-infra.AC6.5 Success:** Both `docker-compose-local.yml` and `docker-compose.yml` include the MCP service

### hw-ai-infra.AC7: Agents can be registered and authenticated

- **hw-ai-infra.AC7.1 Success:** POST to agent registration endpoint creates a bot User (`is_bot=True`, `bot_type=AGENT`) + AgentProfile + APIToken
- **hw-ai-infra.AC7.2 Success:** Agent API token authenticates against runtime endpoints
- **hw-ai-infra.AC7.3 Success:** Agent profile stores webhook URL, secret, and event triggers
- **hw-ai-infra.AC7.4 Failure:** Non-admin users cannot register agents (403)
- **hw-ai-infra.AC7.5 Edge:** Deactivated agent's token is rejected (401 or 403)

### hw-ai-infra.AC8: Agent run lifecycle works

- **hw-ai-infra.AC8.1 Success:** Run can be created, transitioned through `created` → `in_progress` → `completed`
- **hw-ai-infra.AC8.2 Success:** Run can be marked `failed` or `stopped`
- **hw-ai-infra.AC8.3 Success:** Inactive runs are marked `stale` after timeout (default 5 minutes)
- **hw-ai-infra.AC8.4 Success:** Stale runs resume to `in_progress` when new activity is posted
- **hw-ai-infra.AC8.5 Failure:** Invalid status transitions are rejected (e.g., `completed` → `in_progress`)

### hw-ai-infra.AC9: Activity system works

- **hw-ai-infra.AC9.1 Success:** Thoughts and actions are stored with `is_ephemeral=True`
- **hw-ai-infra.AC9.2 Success:** Response activities automatically create IssueComments with the bot user as actor
- **hw-ai-infra.AC9.3 Success:** Elicitation activities store the agent's question and expected input type
- **hw-ai-infra.AC9.4 Success:** Error activities are stored and retrievable
- **hw-ai-infra.AC9.5 Success:** Ephemeral activities are cleaned up after run completion (24h window)
- **hw-ai-infra.AC9.6 Success:** IssueComments from response activities have `external_source="agent"` and `external_id="{run_id}:{activity_id}"`

### hw-ai-infra.AC10: Webhook delivery triggers agents

- **hw-ai-infra.AC10.1 Success:** Comment containing `@agent-name` triggers a webhook to the agent's registered URL
- **hw-ai-infra.AC10.2 Success:** Webhook payload is HMAC-SHA256 signed with the agent's secret
- **hw-ai-infra.AC10.3 Success:** Webhook payload includes a pre-created AgentRun ID
- **hw-ai-infra.AC10.4 Success:** Failed webhook delivery retries with exponential backoff
- **hw-ai-infra.AC10.5 Failure:** Persistently failing webhook auto-deactivates the agent
- **hw-ai-infra.AC10.6 Edge:** Mentioning a deactivated agent does not trigger a webhook

### hw-ai-infra.AC11: Activity rendering in UI

- **hw-ai-infra.AC11.1 Success:** Issue detail view shows a collapsible panel for active agent runs
- **hw-ai-infra.AC11.2 Success:** Thoughts render as muted/collapsed text
- **hw-ai-infra.AC11.3 Success:** Actions render as status pills
- **hw-ai-infra.AC11.4 Success:** Errors render as red alert banners
- **hw-ai-infra.AC11.5 Success:** Elicitations render as input cards; submitting posts a response activity
- **hw-ai-infra.AC11.6 Success:** Run status badge appears on issues with active runs
- **hw-ai-infra.AC11.7 Success:** Bot user comments appear naturally in the issue timeline with avatar and display name

### hw-ai-infra.AC12: Cross-cutting behaviours

- **hw-ai-infra.AC12.1:** All agent API endpoints require authentication (no anonymous access)
- **hw-ai-infra.AC12.2:** All three stages can be shipped independently (no hard cross-stage dependencies)
- **hw-ai-infra.AC12.3:** External runtimes can integrate using only HTTP — no SDK dependency required

## Glossary

- **LiteLLM**: Python library providing a unified interface to multiple LLM providers (Anthropic, OpenAI, Gemini, etc.). Routes requests to the correct provider based on model name prefixes (`anthropic/`, `gemini/`, bare for OpenAI).
- **MCP (Model Context Protocol)**: Anthropic's standard protocol for connecting AI assistants (Claude Code, Cursor) to external data sources and tools via a server.
- **Sidecar container**: A Docker container running alongside the main application containers on the same network, providing auxiliary services.
- **Bot user**: A `User` record with `is_bot=True` and a `bot_type` classification. Skips notification preferences, appears in activity feeds with distinct avatars.
- **Agent run**: A single invocation of an agent, tracking lifecycle from `created` → `in_progress` → terminal state. Links to triggering context (workspace, project, issue).
- **Agent run activity**: Individual steps within an agent run. Types: `thought` (ephemeral), `action` (ephemeral), `response` (persistent IssueComment), `elicitation` (user input request), `error`.
- **Ephemeral activity**: Activity records marked `is_ephemeral=True`, cleaned up after run completion (24-hour window). Used for internal agent state that shouldn't persist long-term.
- **HMAC-SHA256**: Hash-based Message Authentication Code using SHA-256. Signs webhook payloads with a shared secret so receivers can verify authenticity.
- **Stale detection**: Background process marking agent runs as `stale` if no activity within the `stale_timeout` window (default 5 minutes).
- **Ollama**: Open-source tool for running LLMs locally. Provides an OpenAI-compatible HTTP API, reachable via LiteLLM's `api_base` override.
- **Reasoning content**: Extended thinking output from Anthropic's reasoning models. Separate from the final answer — returned in `reasoning_content` and `thinking_blocks` fields.
- **Celery beat task**: Periodic background job scheduled via Celery's task scheduler. Used for stale detection and ephemeral cleanup.
- **Adapter pattern**: External systems integrate via a minimal HTTP contract (receive webhooks, post activities back) rather than requiring SDKs or tight coupling.
- **@-mention detection**: Parsing comment HTML for `@agent-name` patterns to trigger agent-specific webhooks. Simple string matching, no autocomplete.
- **Exponential backoff**: Retry strategy where wait time doubles each attempt. Used in webhook delivery to avoid hammering unreachable endpoints.
- **WORKSPACE_SEED**: Existing bot type for the workspace initialisation task. Demonstrates the bot user creation pattern reused for agents.

## Architecture

Three independently-shippable stages, each building on the previous.

### Stage 1: LLM backend overhaul

Replace the broken `get_llm_response()` function in `apps/api/plane/app/views/external/base.py`
(which uses OpenAI's Python client for all providers) with LiteLLM. LiteLLM routes to each
provider's native SDK via model name prefixes (`anthropic/`, `gemini/`, bare for OpenAI) and
supports Ollama/self-hosted via `api_base` override.

Current model lists:

| Provider  | Models                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| Anthropic | `claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001` |
| OpenAI    | `gpt-5.2`, `gpt-5.2-pro` (thinking), `gpt-4.1`, `o4-mini`                    |
| Gemini    | `gemini-3-pro`, `gemini-3-flash`, `gemini-2.5-pro`, `gemini-2.5-flash`       |

Instance admin configuration uses existing `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` env vars
plus a new `LLM_BASE_URL` for Ollama/self-hosted. Simple prompt templates drive AI features
(grammar correction, summarisation, etc.). Anthropic reasoning content (`reasoning_content`,
`thinking_blocks`) is passed through for extended thinking models.

Frontend rebranded from "Pi" to a configurable AI name (Kairos, Brigid, or Nyx — stored as a
constant, easy to swap). The hardcoded 50 requests/month rate limit is removed entirely.

### Stage 2: MCP server sidecar

The upstream `plane-mcp-server` package (pip-installed, version-pinned) runs in a thin Docker
container added to both `docker-compose-local.yml` and `docker-compose.yml`. It connects to the
API on the internal `dev_env` bridge network (`http://api:8000`) and exposes port 8001 for
external MCP clients (Claude Code, Cursor, etc.).

No fork or modification of the MCP server itself. Auth via `MCP_API_KEY` env var pointing at a
workspace API key.

### Stage 3: Agent integration infrastructure

Bot user accounts leverage the existing `User.is_bot`, `User.bot_type`, and `BotTypeEnum`
infrastructure. A new `BotTypeEnum.AGENT` value distinguishes agent bots from the existing
`WORKSPACE_SEED` type. Each agent gets a real User record, so comments from agents appear
naturally in activity feeds with proper avatars and display names.

Three new models:

**AgentProfile** — one-to-one with the bot User. Holds webhook URL, HMAC secret, event trigger
configuration, and active status. Scoped to a workspace.

**AgentRun** — lifecycle of a single invocation. Status progression: `created` → `in_progress` →
`completed`/`failed`/`stopped`/`stale`. Links to the triggering context (workspace, project,
issue). Includes a configurable stale timeout (default 5 minutes).

**AgentRunActivity** — individual activities within a run. Types: `thought` (ephemeral), `action`
(ephemeral), `response` (persistent — also creates an IssueComment), `elicitation` (request user
input), `error`. Ephemeral activities are cleaned up by a periodic Celery beat task after run
completion.

**Webhook delivery** reuses the existing Celery pipeline (`webhook_activity` →
`webhook_send_task`) with HMAC-SHA256 signing, retry logic, and auto-deactivation. Mention
detection parses `@agent-name` from comment HTML to trigger agent-specific webhooks. The webhook
payload includes a pre-created AgentRun ID so the agent can immediately start posting activities.

**Adapter contract:** Any external runtime that can receive an HTTP webhook and POST back to
Plane's agent-runs API qualifies as an adapter. No SDK required — just HTTP.

## Existing patterns

### LLM infrastructure

The current `get_llm_response()` in `apps/api/plane/app/views/external/base.py` creates a new
`OpenAI()` client per request and routes all providers through it. The `LLMProvider` base class
with `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` subclasses exists but only provides
model lists — the actual dispatch ignores provider differences. LiteLLM replaces both the
provider classes and the dispatch function.

Instance configuration via `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL` in
`apps/api/plane/utils/instance_config_variables/core.py` (lines 198-224). These are read by
`get_llm_config()` and passed to the LLM function. This pattern is preserved; only `LLM_BASE_URL`
is added.

### Bot user system

`User.is_bot` (BooleanField) and `User.bot_type` (CharField) already exist (migration 0084).
`BotTypeEnum` defines `WORKSPACE_SEED`. Bot users skip notification preference creation
(post-save signal check). `APIToken` has `user_type` (0=Human, 1=Bot) and `is_service` flags.
The workspace seed task in `apps/api/plane/bgtasks/workspace_seed_task.py` demonstrates the
bot user creation pattern.

### Webhook system

`Webhook` model in `apps/api/plane/db/models/webhook.py` — workspace-scoped, URL + secret key +
event boolean flags. `webhook_activity()` and `webhook_send_task()` Celery tasks in
`apps/api/plane/bgtasks/webhook_task.py` — HMAC-SHA256 signing, 5 retries, 10-minute exponential
backoff, auto-deactivation on persistent failure, 30-second timeout.

### Comment system

`IssueComment` in `apps/api/plane/db/models/issue.py` (lines 441-520) — nullable `actor` FK
(supports bot comments), `external_source` and `external_id` fields for integration
deduplication, parent FK for threading.

### Docker infrastructure

`docker-compose-local.yml` uses a shared `dev_env` bridge network. Services reference each other
by container name (e.g., `plane-db:5432`, `plane-redis:6379`). The MCP sidecar follows the same
pattern.

<!-- START_PHASE_1 -->

## Implementation phases

### Phase 1: LLM backend replacement

**Goal:** Replace the broken multi-provider LLM dispatch with LiteLLM.

**Components:**

- `apps/api/requirements/base.txt` — add `litellm` dependency
- `apps/api/plane/app/views/external/base.py` — replace `get_llm_response()` with LiteLLM
  `completion()` call; replace `LLMProvider` subclasses with a single model list dict; add
  `LLM_BASE_URL` support for Ollama
- `apps/api/plane/utils/instance_config_variables/core.py` — add `LLM_BASE_URL` config variable
- Model lists updated to current versions (Anthropic, OpenAI, Gemini)

**Dependencies:** None (first phase)

**Done when:** LiteLLM dispatches correctly to Anthropic, OpenAI, and Gemini; Ollama works via
base URL override; reasoning content from Anthropic thinking models is passed through in the
response

<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->

### Phase 2: Frontend rebrand, settings, and grammar endpoint

**Goal:** Complete Stage 1 — rebrand, add missing endpoint, remove rate limit, wire admin settings.

**Components:**

- `apps/api/plane/app/views/external/base.py` — new `/rephrase-grammar/` view using LiteLLM with
  a grammar-correction prompt template
- `apps/api/plane/app/urls/external.py` — register the new endpoint
- `apps/web/core/constants/ai.ts` — replace "Pi" branding with configurable name constant
- `apps/web/core/components/core/modals/gpt-assistant-popover.tsx` — remove 50 req/month limit
  logic
- `apps/web/hw/components/pages/editor/ai/menu.tsx` — rebrand EditorAIMenu
- `apps/web/hw/components/pages/editor/ai/ask-pi-menu.tsx` — rename component and file
- `apps/web/ce/components/pages/editor/ai/` — matching CE rebrand
- Instance admin settings page — expose LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_BASE_URL
  fields

**Dependencies:** Phase 1 (LiteLLM backend)

**Done when:** `/rephrase-grammar/` returns corrected text; all "Pi" references are replaced;
rate limit is gone; admin can configure provider, model, key, and base URL from settings UI

<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->

### Phase 3: MCP server sidecar

**Goal:** Ship MCP as an out-of-the-box container in both compose files.

**Components:**

- `mcp/Dockerfile` — thin Python image, pip install `plane-mcp-server` at pinned version
- `docker-compose-local.yml` — add `plane-mcp` service on `dev_env` network, port 8001
- `docker-compose.yml` — same with `restart: always` and nginx proxy config
- `.env.example` — add `MCP_API_KEY` variable with documentation comment

**Dependencies:** None (independent of Stage 1, but sequenced after for delivery order)

**Done when:** `docker compose up` starts the MCP server; external MCP clients can connect to
`localhost:8001` and execute Plane tools against the local instance

<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->

### Phase 4: Agent data model and migrations

**Goal:** Create the database foundation for agent infrastructure.

**Components:**

- `apps/api/plane/hw/models/agent.py` — `AgentProfile`, `AgentRun`, `AgentRunActivity` models
  with enums for run status and activity type
- `apps/api/plane/db/models/user.py` — add `AGENT = "AGENT"` to `BotTypeEnum`
- `apps/api/plane/hw/migrations/` — migration for new models and enum extension
- `apps/api/plane/hw/serializers/agent.py` — serializers for all three models

**Dependencies:** None (independent of Stages 1-2)

**Done when:** Migrations apply cleanly; models can be created, queried, and serialised; bot
users with `bot_type=AGENT` can be created following the existing workspace seed pattern

<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->

### Phase 5: Agent registration and runtime API

**Goal:** API endpoints for creating agents and managing runs.

**Components:**

- `apps/api/plane/hw/views/agent.py` — views for AgentProfile CRUD (admin-scoped), AgentRun
  CRUD, AgentRunActivity creation and listing
- `apps/api/plane/hw/urls.py` — register agent API routes under `/api/v1/workspaces/{slug}/`
- Bot user + APIToken creation logic in the registration view (creates User with `is_bot=True`,
  `bot_type=AGENT`, returns token once)
- Response activity auto-creates IssueComment with bot user as actor, `external_source="agent"`,
  `external_id="{run_id}:{activity_id}"`

**Dependencies:** Phase 4 (data model)

**Done when:** Agents can be registered via API; agent token authenticates against runtime
endpoints; runs can be created and updated; activities can be posted; response activities appear
as issue comments with correct bot actor

<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->

### Phase 6: Webhook delivery and mention detection

**Goal:** Trigger agents via webhooks when events occur.

**Components:**

- `apps/api/plane/bgtasks/agent_webhook_task.py` — Celery task that checks AgentProfile
  `event_triggers` for matches, pre-creates an AgentRun, dispatches webhook with HMAC-signed
  payload via the existing `webhook_send_task` pattern
- `apps/api/plane/app/views/issue/comment.py` — hook into comment creation to detect
  `@agent-name` mentions and fire `issue_comment.mention` events
- Webhook payload format: event type, triggering context (workspace, project, issue), pre-created
  run ID, mention metadata

**Dependencies:** Phase 5 (API), existing webhook Celery infrastructure

**Done when:** Creating a comment with `@agent-name` triggers a webhook to the agent's registered
URL; webhook is HMAC-signed; payload includes a valid AgentRun ID the agent can immediately use

<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->

### Phase 7: Activity rendering in UI

**Goal:** Display agent run state and activities in the issue detail view.

**Components:**

- `apps/web/hw/components/issues/agent/` — new component directory:
  - Run panel (collapsible, shows status + activity timeline)
  - Thought/action renderers (muted, collapsed by default)
  - Error renderer (red alert banner)
  - Elicitation renderer (card with agent's question, text input or option buttons, submit
    posts a response activity back to the agent via webhook)
  - Run status badge (shows on issue when agent is active)
- `apps/web/hw/store/agent/` — MobX store for agent runs and activities
- `apps/web/hw/services/agent.service.ts` — API service for agent endpoints

**Dependencies:** Phase 5 (API endpoints to fetch data)

**Done when:** Issue detail view shows active agent runs with status; ephemeral activities
(thoughts, actions) render in a collapsible panel; bot user comments appear naturally in the
timeline; run status badge is visible on issues with active runs; elicitation cards render the
agent's question and capture user responses

<!-- END_PHASE_7 -->

<!-- START_PHASE_8 -->

### Phase 8: Stale detection and ephemeral cleanup

**Goal:** Automated lifecycle management for agent runs.

**Components:**

- `apps/api/plane/bgtasks/agent_lifecycle_task.py` — two Celery beat tasks:
  - Stale detection: runs every minute, marks `in_progress` runs as `stale` if no activity
    within `stale_timeout`
  - Ephemeral cleanup: runs hourly, deletes `is_ephemeral=True` activities from completed/
    failed/stopped runs older than 24 hours
- `apps/api/plane/settings/celery.py` — register beat schedule entries

**Dependencies:** Phase 5 (API + data model)

**Done when:** Inactive runs are automatically marked stale after timeout; stale runs can be
resumed by posting new activity; ephemeral activities are cleaned up after run completion

<!-- END_PHASE_8 -->

## Additional considerations

**@-mention autocomplete deferred:** Mention detection uses simple string matching against
registered agent names. A proper autocomplete dropdown (like Slack or GitHub) that suggests agent
names as you type is a separate UI feature.

**Model list maintenance:** The model ID lists in the LLM provider configuration will need
periodic updates as providers release new models. These are simple constant changes — no
architectural impact.

**LiteLLM version pinning:** LiteLLM updates frequently to track provider API changes. Pin to a
specific version and update deliberately, testing provider compatibility after each bump.
