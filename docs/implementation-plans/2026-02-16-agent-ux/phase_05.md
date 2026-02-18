# Agent UX Implementation Plan — Phase 5: SSE Streaming Layer

**Goal:** Real-time activity delivery from Celery tasks to frontend clients via Server-Sent Events.

**Architecture:** Raw Redis pub/sub with async `StreamingHttpResponse` bridges activity from Celery workers to the ASGI server. When the Celery task creates an `AgentRunActivity`, it calls `emit_activity_event()` which publishes via Redis. The uvicorn ASGI processes run async SSE views that subscribe to the relevant Redis channels and push events to connected `EventSource` clients. Two channel types: run-level (`agent-run-{run_id}`) for single-run streams and conversation-level (`agent-conversation-{conversation_id}`) for chat UI streams.

**Tech Stack:** Redis pub/sub (`redis==5.0.4` with `redis.asyncio`), Django async views, `StreamingHttpResponse`, Gunicorn + uvicorn workers (existing), pytest

**Scope:** 8 phases from original design (this is phase 5 of 8)

**Codebase verified:** 2026-02-16

**Revised:** 2026-02-18 — replaced `django-eventstream` with raw Redis pub/sub. `django-eventstream>=5.0` requires Django>=5 (we use 4.2.28) and `django-eventstream<=4.5.1` requires `channels<4` (`channels.http.AsgiRequest` removed in Channels 4.x). No version of django-eventstream is compatible with our Django 4.2.28 + Channels 4.1.0 stack.

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

- **ASGI config** at `apps/api/plane/asgi.py` — minimal setup with `ProtocolTypeRouter({"http": get_asgi_application()})`. Channels installed (`channels==4.1.0`) but not configured beyond basic HTTP routing. No existing SSE or WebSocket routing.
- **Production server** — Gunicorn with `uvicorn.workers.UvicornWorker` (`apps/api/bin/docker-entrypoint-api.sh:38`). Handles long-lived SSE connections natively via ASGI.
- **Dev server** — `python manage.py runserver` (WSGI). SSE won't work with this — need to use `uvicorn plane.asgi:application` for local SSE testing.
- **Redis** — available at `REDIS_URL` env var. Used for caching (`django_redis.cache.RedisCache`). Handles both SSL (`rediss://`) and plaintext. docker-compose runs `valkey/valkey:7.2.11-alpine` on port 6379. The `redis==5.0.4` package includes `redis.asyncio` for async pub/sub.
- **Existing Redis helper** — `plane.settings.redis.redis_instance()` returns a sync `redis.Redis` client. Suitable for the publish side (Celery tasks, Django views). The subscribe side (SSE endpoints) needs `redis.asyncio.from_url()` for non-blocking operation.
- **django-eventstream** — INCOMPATIBLE. `>=5.0` requires Django>=5; `<=4.5.1` requires `channels.http.AsgiRequest` (removed in Channels 4.x). Replaced with raw Redis pub/sub + async `StreamingHttpResponse`.
- **SSE protocol** — trivial format: `event: {type}\ndata: {json}\n\n`. No library needed.
- **Activity creation** — external agents post activities via `AgentRunActivityViewSet.create()` (in `apps/api/plane/hw/views/agent.py`). Built-in agent creates activities in the Celery task (`apps/api/plane/bgtasks/builtin_agent_task.py`). Both paths need `emit_activity_event()` calls.

---

<!-- START_TASK_1 -->

### Task 1: SSE event helpers using Redis pub/sub

**Verifies:** agent-ux.AC5.1, agent-ux.AC5.2, agent-ux.AC5.3

**Files:**

- Create: `apps/api/plane/hw/services/__init__.py`
- Create: `apps/api/plane/hw/services/agent_events.py`

**Implementation:**

Create a helper module that centralises event emission for agent activities using Redis pub/sub:

```python
def emit_activity_event(activity: AgentRunActivity) -> None:
    """Emit SSE events for a created activity on the appropriate channels.

    Publishes to:
    - Run-level channel: agent-run-{run_id}
    - Conversation-level channel (if applicable): agent-conversation-{conversation_id}
    """
```

This function:

1. Serialises the activity using `AgentRunActivitySerializer`.
2. Calls `redis_instance().publish(f"agent-run-{activity.run_id}", json_payload)`.
3. If the run has a `conversation_id`, also publishes on `f"agent-conversation-{activity.run.conversation_id}"`.

The JSON payload format: `{"event_type": "activity_created", "data": {serialized_activity}}`.

Also add:

```python
def emit_run_status_event(run: AgentRun) -> None:
    """Emit SSE event when a run's status changes."""
```

This publishes on both run-level and conversation-level channels (if applicable) with event type `"run_status_changed"` and data `{"run_id": str(run.id), "status": run.status}`.

Also add the SSE formatting helper:

```python
def format_sse(event_type: str, data: str) -> str:
    """Format a Server-Sent Event message."""
    return f"event: {event_type}\ndata: {data}\n\n"
```

Both emit functions handle Redis failures gracefully (log and continue — SSE failures should never break the execution flow).

**Verification:**

Run: `python -c "from plane.hw.services.agent_events import emit_activity_event, emit_run_status_event, format_sse; print('OK')"`
Expected: Imports succeed.

**Commit:** `feat(hw): add SSE event emission helpers using Redis pub/sub`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Integrate event emission into activity creation paths

**Verifies:** agent-ux.AC5.1

**Files:**

- Modify: `apps/api/plane/hw/views/agent.py` (external agent activity creation)
- Modify: `apps/api/plane/bgtasks/builtin_agent_task.py` (built-in agent activity creation)

**Implementation:**

In `AgentRunActivityViewSet.create()` (at `apps/api/plane/hw/views/agent.py`), after the activity is created and saved, call `emit_activity_event(activity)`. Also call `emit_run_status_event(run)` when the run auto-transitions status.

In `builtin_agent_execute_task` (at `apps/api/plane/bgtasks/builtin_agent_task.py`), after each `AgentRunActivity.objects.create(...)` call, call `emit_activity_event(activity)`. After each run status transition (`run.save()`), call `emit_run_status_event(run)`.

This ensures both agent types (external webhook and built-in) emit identical SSE events.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): emit SSE events from both agent activity creation paths`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: SSE endpoint views with authentication

**Verifies:** agent-ux.AC5.2, agent-ux.AC5.3, agent-ux.AC5.4, agent-ux.AC5.5

**Files:**

- Create: `apps/api/plane/hw/views/agent_events.py`
- Modify: `apps/api/plane/hw/urls/agent.py` (add SSE routes)

**Implementation:**

Create async SSE endpoint views using `StreamingHttpResponse`:

1. `AgentRunEventsView` — SSE endpoint for run-level streaming.
   - Auth: user is authenticated (reject 401), workspace member (reject 403), run exists in workspace (reject 404).
   - Subscribes to Redis channel `agent-run-{run_id}` via `redis.asyncio`.
   - Returns `StreamingHttpResponse(event_generator(), content_type="text/event-stream")`.

2. `AgentConversationEventsView` — SSE endpoint for conversation-level streaming.
   - Auth: user is authenticated, conversation.created_by == user, conversation is in workspace.
   - Subscribes to Redis channel `agent-conversation-{conversation_id}`.

The async generator pattern:

```python
async def _event_generator(channel_name: str):
    r = redis.asyncio.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel_name)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                payload = json.loads(message["data"])
                yield format_sse(payload["event_type"], json.dumps(payload["data"]))
    finally:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await r.close()
```

Handle `REDIS_SSL` properly — if `REDIS_URL` starts with `rediss://`, pass appropriate SSL options.

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

**SSE catch-up/recovery pattern:** The existing activity list endpoint (`GET /api/workspaces/{slug}/agent-runs/{run_id}/activities/`) serves as the catch-up mechanism. When an SSE connection drops, the frontend fetches all activities via this endpoint to restore state, then re-opens the `EventSource`. No additional backend endpoint is needed.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add authenticated SSE endpoints for agent streaming`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Tests for SSE streaming

**Verifies:** agent-ux.AC5.1, agent-ux.AC5.2, agent-ux.AC5.3, agent-ux.AC5.4, agent-ux.AC5.5

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_agent_events.py`
- Create: `apps/api/plane/tests/contract/hw/test_agent_sse.py`

**Testing:**

**Unit tests (test_agent_events.py):**

- **agent-ux.AC5.1:** `emit_activity_event()` calls `redis.publish()` with the correct channel name and serialised activity data. Mock `redis_instance` and verify publish call args.
- **agent-ux.AC5.2:** `emit_activity_event()` for a run without a conversation only publishes to the run-level channel (`agent-run-{run_id}`).
- **agent-ux.AC5.3:** `emit_activity_event()` for a run with a conversation publishes to both the run-level channel and the conversation channel (`agent-conversation-{conversation_id}`).
- `emit_run_status_event()` publishes correct status data to the correct channels.
- Both emit functions handle Redis failure gracefully (no exception raised when `publish()` throws).
- `format_sse()` produces correct SSE format (`event: type\ndata: json\n\n`).

**Contract tests (test_agent_sse.py):**

- **agent-ux.AC5.4:** An unauthenticated GET request to `/api/workspaces/{slug}/agent-runs/{id}/events/` returns 401 or 403.
- **agent-ux.AC5.5:** An authenticated GET request to an SSE endpoint for a run in a workspace the user doesn't belong to returns 403.
- Authenticated workspace member can access the SSE endpoint (returns 200 with `text/event-stream` content type).
- **SSE catch-up recovery:** Activities created while no SSE connection exists are retrievable via the existing activity list endpoint. Create several activities for a run, then verify they are all returned by the list endpoint in `created_at` order.

Use `@pytest.mark.django_db` for contract tests. Use the `session_client` and `workspace` fixtures.

**Verification:**

Run: `python apps/api/run_tests.py -u && python apps/api/run_tests.py -c`
Expected: All tests pass.

**Commit:** `test(hw): add tests for SSE event emission and endpoint authentication`

<!-- END_TASK_4 -->
