# Agent UX Implementation Plan — Phase 5: SSE Streaming Layer

**Goal:** Real-time activity delivery from Celery tasks to frontend clients via Server-Sent Events.

**Architecture:** `django-eventstream` with Redis pub/sub bridges activity from Celery workers to the ASGI server. When the Celery task creates an `AgentRunActivity`, it calls `send_event()` which publishes via Redis. The Gunicorn/uvicorn ASGI processes push events to connected `EventSource` clients. Two channel types: run-level (`agent-run-{run_id}`) for single-run streams and conversation-level (`agent-conversation-{conversation_id}`) for chat UI streams.

**Tech Stack:** django-eventstream, Redis pub/sub, Django Channels (routing only), Gunicorn + uvicorn workers (existing), pytest

**Scope:** 8 phases from original design (this is phase 5 of 8)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC5: SSE streaming

- **agent-ux.AC5.1 Success:** Creating an `AgentRunActivity` (from either agent type) pushes an SSE event to connected clients on the correct channel.
- **agent-ux.AC5.2 Success:** Run-level channels (`agent-run-{id}`) deliver only activities for that specific run.
- **agent-ux.AC5.3 Success:** Conversation-level channels (`agent-conversation-{id}`) deliver activities across all runs in that conversation.
- **agent-ux.AC5.4 Failure:** Unauthenticated SSE connections are rejected.
- **agent-ux.AC5.5 Failure:** SSE connections for runs in workspaces the user doesn't belong to are rejected.

---

## Investigation findings

- **ASGI config** at `apps/api/plane/asgi.py` — minimal setup with `ProtocolTypeRouter({"http": get_asgi_application()})`. Channels installed (`channels==4.1.0`) but not configured. No existing SSE or WebSocket routing.
- **Production server** — Gunicorn with `uvicorn.workers.UvicornWorker` (`apps/api/bin/docker-entrypoint-api.sh:38`). Handles long-lived SSE connections natively.
- **Dev server** — `python manage.py runserver` (WSGI). SSE won't work with this — need to use `uvicorn plane.asgi:application` for local SSE testing.
- **Redis** — available at `REDIS_URL` env var. Used for caching (`django_redis.cache.RedisCache`). Handles both SSL (`rediss://`) and plaintext. docker-compose runs `valkey/valkey:7.2.11-alpine` on port 6379.
- **django-eventstream** — NOT installed. Needs to be added to `requirements/base.txt`. Provides `send_event(channel, event_type, data)` API. Supports Redis pub/sub backend via `EVENTSTREAM_REDIS` setting. Views inherit from `EventsView` and override `get_channels()` for authorization.
- **SSE routing** — django-eventstream works as regular Django URL routes (not Channels consumers). No special ASGI routing needed beyond what exists. The `EventsView` holds the HTTP connection open and streams events.
- **Activity creation** — external agents post activities via `AgentRunActivityViewSet.create()` (line 312-395 in `apps/api/plane/hw/views/agent.py`). Built-in agent creates activities in the Celery task. Both paths need `send_event()` calls.

---

<!-- START_TASK_1 -->

### Task 1: Add django-eventstream dependency and configuration

**Verifies:** None (infrastructure)

**Files:**

- Modify: `apps/api/requirements/base.txt` (add `django-eventstream`)
- Modify: `apps/api/plane/settings/common.py` (add to INSTALLED_APPS, configure EVENTSTREAM_REDIS)

**Implementation:**

Add to `requirements/base.txt`:

```
django-eventstream==6.0.0
```

Add to `INSTALLED_APPS` in `settings/common.py`:

```python
"django_eventstream",
```

Add Redis configuration for eventstream in `settings/common.py` after the `CACHES` block. `django-eventstream` accepts either a URL string or a dict. Parse the `REDIS_URL` to provide the dict format for maximum compatibility:

```python
import urllib.parse as urlparse

_parsed_redis = urlparse.urlparse(REDIS_URL) if REDIS_URL else None
EVENTSTREAM_STORAGE_CLASS = "django_eventstream.storage.DjangoModelStorage"
EVENTSTREAM_CHANNELMANAGER_CLASS = "django_eventstream.channelmanager.DefaultChannelManager"

if _parsed_redis:
    EVENTSTREAM_REDIS = {
        "host": _parsed_redis.hostname or "localhost",
        "port": _parsed_redis.port or 6379,
        "db": int(_parsed_redis.path.lstrip("/") or 0),
        "password": _parsed_redis.password or None,
        "ssl": REDIS_SSL,
    }
```

Also add `django_eventstream` to `ASGI_APPLICATION` config and update `apps/api/plane/asgi.py` to include django-eventstream's URL routing. While django-eventstream can work as regular Django views, the ASGI routing ensures proper long-lived connection handling:

```python
# In apps/api/plane/asgi.py — add after django_asgi_app:
import django_eventstream.routing

application = ProtocolTypeRouter({
    "http": URLRouter([
        *django_eventstream.routing.urlpatterns,
        re_path(r"", django_asgi_app),
    ]),
})
```

**Note:** The existing `asgi.py` redundantly calls `get_asgi_application()` twice (once to assign `django_asgi_app` and once inline in the `ProtocolTypeRouter`). The new code fixes this by using only the `django_asgi_app` variable in the `URLRouter` fallback.

This ensures SSE paths are handled by django-eventstream's ASGI consumer while all other HTTP traffic goes through the standard Django ASGI app.

**Verification:**

Run: `pip install -r apps/api/requirements/base.txt`
Expected: Installs without errors.

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `chore(hw): add django-eventstream dependency and configuration`

<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-3) -->

<!-- START_TASK_2 -->

### Task 2: SSE event helper and activity event emission

**Verifies:** agent-ux.AC5.1, agent-ux.AC5.2, agent-ux.AC5.3

**Files:**

- Create: `apps/api/plane/hw/services/agent_events.py`

**Implementation:**

Create a helper module that centralises event emission for agent activities:

```python
def emit_activity_event(activity: AgentRunActivity) -> None:
    """Emit SSE events for a created activity on the appropriate channels."""
```

This function:

1. Serialises the activity using `AgentRunActivitySerializer`.
2. Calls `send_event()` on the run-level channel: `f"agent-run-{activity.run_id}"` with event type `"activity_created"`.
3. If the run has a `conversation_id`, also calls `send_event()` on the conversation channel: `f"agent-conversation-{activity.run.conversation_id}"` with event type `"activity_created"`.

Also add:

```python
def emit_run_status_event(run: AgentRun) -> None:
    """Emit SSE event when a run's status changes."""
```

This emits on both run-level and conversation-level channels (if applicable) with event type `"run_status_changed"` and data `{"run_id": str(run.id), "status": run.status}`.

Both functions handle the case where `send_event` fails gracefully (log and continue — SSE failures should never break the execution flow).

**Verification:**

Run: `python -c "from plane.hw.services.agent_events import emit_activity_event, emit_run_status_event; print('OK')"`
Expected: Imports succeed.

**Commit:** `feat(hw): add SSE event emission helpers for agent activities`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Integrate event emission into activity creation paths

**Verifies:** agent-ux.AC5.1

**Files:**

- Modify: `apps/api/plane/hw/views/agent.py` (external agent activity creation)
- Modify: `apps/api/plane/bgtasks/builtin_agent_task.py` (built-in agent activity creation)

**Implementation:**

In `AgentRunActivityViewSet.create()` (at `apps/api/plane/hw/views/agent.py:312-395`), after the activity is created and saved (around line 357), call `emit_activity_event(activity)`. Also call `emit_run_status_event(run)` when the run auto-transitions status (around line 344).

In `builtin_agent_execute_task` (at `apps/api/plane/bgtasks/builtin_agent_task.py`), after each `AgentRunActivity.objects.create(...)` call, call `emit_activity_event(activity)`. After each run status transition (`run.save()`), call `emit_run_status_event(run)`.

This ensures both agent types (external webhook and built-in) emit identical SSE events.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): emit SSE events from both agent activity creation paths`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: SSE endpoint views with authentication

**Verifies:** agent-ux.AC5.2, agent-ux.AC5.3, agent-ux.AC5.4, agent-ux.AC5.5

**Files:**

- Create: `apps/api/plane/hw/views/agent_events.py`
- Modify: `apps/api/plane/hw/urls/agent.py` (add SSE routes)

**Implementation:**

Create SSE endpoint views that inherit from `django_eventstream.views.EventsView`:

1. `AgentRunEventsView(EventsView)` — SSE endpoint for run-level streaming.
   - Override `get_channels(self)` to return `[f"agent-run-{self.kwargs['run_id']}"]`.
   - Before returning channels, verify: user is authenticated (reject 401 if not), user is a workspace member (reject 403 if not), the run exists in the workspace (reject 404 if not).
   - Use `WorkspaceMember.objects.filter(workspace__slug=..., member=request.user, is_active=True).exists()` for membership check.

2. `AgentConversationEventsView(EventsView)` — SSE endpoint for conversation-level streaming.
   - Override `get_channels(self)` to return `[f"agent-conversation-{self.kwargs['conversation_id']}"]`.
   - Verify: user is authenticated, user owns the conversation (conversation.user == request.user), conversation is in the workspace.

Add URL routes to `apps/api/plane/hw/urls/agent.py`:

```python
path(
    "workspaces/<str:slug>/agent-runs/<uuid:run_id>/events/",
    AgentRunEventsView.as_view(),
    name="agent-run-events",
),
path(
    "workspaces/<str:slug>/agent-conversations/<uuid:conversation_id>/events/",
    AgentConversationEventsView.as_view(),
    name="agent-conversation-events",
),
```

**Note on URL parameter naming:** These SSE endpoints use descriptive parameter names (`run_id`, `conversation_id`) rather than the `pk` convention used by DRF ViewSet detail views. This is intentional — SSE endpoints are not ViewSet actions, they are standalone views where descriptive names improve readability in both URL config and `self.kwargs` access.

**SSE catch-up/recovery pattern:** The existing activity list endpoint (`GET /api/workspaces/{slug}/agent-runs/{run_id}/activities/`) serves as the catch-up mechanism. When an SSE connection drops, the frontend fetches all activities via this endpoint to restore state, then re-opens the `EventSource`. No additional backend endpoint is needed — the existing activity list already returns all activities for a run ordered by `created_at`.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add authenticated SSE endpoints for agent streaming`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Tests for SSE streaming

**Verifies:** agent-ux.AC5.1, agent-ux.AC5.2, agent-ux.AC5.3, agent-ux.AC5.4, agent-ux.AC5.5

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_agent_events.py`
- Create: `apps/api/plane/tests/contract/hw/test_agent_sse.py`

**Testing:**

**Unit tests (test_agent_events.py):**

- **agent-ux.AC5.1:** `emit_activity_event()` calls `send_event()` with the correct channel name and serialised activity data. Mock `send_event` and verify call args.
- **agent-ux.AC5.2:** `emit_activity_event()` for a run without a conversation only emits on the run-level channel (`agent-run-{run_id}`).
- **agent-ux.AC5.3:** `emit_activity_event()` for a run with a conversation emits on both the run-level channel and the conversation channel (`agent-conversation-{conversation_id}`).
- `emit_run_status_event()` emits on the correct channels with the run status.
- `emit_activity_event()` handles `send_event` failure gracefully (no exception raised).

**Contract tests (test_agent_sse.py):**

- **agent-ux.AC5.4:** An unauthenticated GET request to `/api/workspaces/{slug}/agent-runs/{id}/events/` returns 401 or 403.
- **agent-ux.AC5.5:** An authenticated GET request to an SSE endpoint for a run in a workspace the user doesn't belong to returns 403.
- Authenticated workspace member can access the SSE endpoint (returns 200 with streaming response headers).
- **SSE catch-up recovery:** Activities created while no SSE connection exists are retrievable via the existing activity list endpoint (`GET /api/workspaces/{slug}/agent-runs/{run_id}/activities/`). Create several activities for a run, then verify they are all returned by the list endpoint in `created_at` order. This confirms the catch-up mechanism works for reconnection scenarios.

Use `@pytest.mark.django_db` for all tests. Use the `session_client` and `workspace` fixtures.

**Verification:**

Run: `python apps/api/run_tests.py -u && python apps/api/run_tests.py -c`
Expected: All tests pass.

**Commit:** `test(hw): add tests for SSE event emission and endpoint authentication`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->
