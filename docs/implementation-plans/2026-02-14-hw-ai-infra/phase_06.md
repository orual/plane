# HW AI Infrastructure Implementation Plan — Phase 6

**Goal:** Trigger agents via webhooks when mentioned in comments.

**Architecture:** A new Celery task `agent_webhook_send_task` reuses the existing HMAC-SHA256 signing and retry patterns from `webhook_send_task`. Mention detection happens in the comment creation view — after saving, it parses `@agent-name` from the comment text, looks up matching `AgentProfile` records, pre-creates an `AgentRun`, and dispatches the webhook. The payload includes the run ID so the agent can immediately start posting activities.

**Tech Stack:** Python, Django, Celery, HMAC-SHA256, pytest

**Scope:** 8 phases from original design (phase 6 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC10: Webhook delivery triggers agents
- **hw-ai-infra.AC10.1 Success:** Comment containing `@agent-name` triggers a webhook to the agent's registered URL
- **hw-ai-infra.AC10.2 Success:** Webhook payload is HMAC-SHA256 signed with the agent's secret
- **hw-ai-infra.AC10.3 Success:** Webhook payload includes a pre-created AgentRun ID
- **hw-ai-infra.AC10.4 Success:** Failed webhook delivery retries with exponential backoff
- **hw-ai-infra.AC10.5 Failure:** Persistently failing webhook auto-deactivates the agent
- **hw-ai-infra.AC10.6 Edge:** Mentioning a deactivated agent does not trigger a webhook

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create agent webhook Celery task

**Verifies:** hw-ai-infra.AC10.2, hw-ai-infra.AC10.3, hw-ai-infra.AC10.4, hw-ai-infra.AC10.5

**Files:**
- Create: `apps/api/plane/bgtasks/agent_webhook_task.py`
- Modify: `apps/api/plane/settings/common.py` (add to `CELERY_IMPORTS`)

**Implementation:**

Create a Celery task following the exact pattern from `apps/api/plane/bgtasks/webhook_task.py` (`webhook_send_task` at lines 253-375).

The task `agent_webhook_send_task` should:

1. Accept parameters: `agent_profile_id`, `run_id`, `event_type`, `event_data`, `current_site`
2. Look up the `AgentProfile` by ID, bail if not found or not active
3. Build the payload:
   ```python
   payload = {
       "event": event_type,
       "action": "created",
       "agent_id": str(agent.id),
       "workspace_id": str(agent.workspace_id),
       "run_id": str(run_id),
       "data": event_data,
   }
   ```
4. Sign with HMAC-SHA256 using the agent's `webhook_secret` — follow the exact pattern from `webhook_send_task` lines 313-321:
   ```python
   if agent.webhook_secret:
       hmac_signature = hmac.new(
           agent.webhook_secret.encode("utf-8"),
           json.dumps(payload, cls=DjangoJSONEncoder).encode("utf-8"),
           hashlib.sha256,
       )
       headers["X-Plane-Signature"] = hmac_signature.hexdigest()
   ```
5. POST to `agent.webhook_url` with 30-second timeout
6. On persistent failure (after max_retries), deactivate the agent: `AgentProfile.objects.filter(pk=agent.id).update(is_active=False)`

Use the same Celery task decorator pattern:
```python
@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=600,
    max_retries=5,
    retry_jitter=True,
)
```

**Verification:**

Run: `cd apps/api && python -c "from plane.bgtasks.agent_webhook_task import agent_webhook_send_task; print('OK')"`
Expected: Imports successfully

**Step 2: Register in CELERY_IMPORTS**

Add `"plane.bgtasks.agent_webhook_task"` to the `CELERY_IMPORTS` tuple in `apps/api/plane/settings/common.py`, after the existing entries:

```python
    # agent tasks
    "plane.bgtasks.agent_webhook_task",
```

Note: While `autodiscover_tasks()` would pick this up since `bgtasks` is under an installed app, explicitly adding to `CELERY_IMPORTS` ensures the task is always registered, consistent with how Phase 8 registers `agent_lifecycle_task`.

**Verification:**

Run: `cd apps/api && python -c "from plane.bgtasks.agent_webhook_task import agent_webhook_send_task; print('OK')"`
Expected: Imports successfully

**Commit:** `feat: add agent webhook delivery Celery task`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add mention detection to comment creation

**Verifies:** hw-ai-infra.AC10.1, hw-ai-infra.AC10.3, hw-ai-infra.AC10.6

**Files:**
- Modify: `apps/api/plane/app/views/issue/comment.py` (the `create` method)

**Implementation:**

After the comment is saved and the existing `model_activity.delay()` call, add mention detection logic:

```python
from plane.bgtasks.agent_webhook_task import agent_webhook_send_task
from plane.hw.models import AgentProfile, AgentRun, AgentRunStatus

def _detect_agent_mentions(comment_text, workspace_slug, project_id, issue_id, current_site):
    """Parse @agent-name mentions from comment text and trigger webhooks."""
    import re

    mentions = re.findall(r"@([\w-]+)", comment_text)
    if not mentions:
        return

    agents = AgentProfile.objects.filter(
        workspace__slug=workspace_slug,
        display_name__in=mentions,
        is_active=True,
    ).select_related("workspace")

    for agent in agents:
        run = AgentRun.objects.create(
            agent=agent,
            workspace=agent.workspace,
            project_id=project_id,
            issue_id=issue_id,
            status=AgentRunStatus.CREATED,
            trigger_metadata={"trigger": "mention", "comment_text": comment_text},
        )

        agent_webhook_send_task.delay(
            agent_profile_id=str(agent.id),
            run_id=str(run.id),
            event_type="issue_comment.mention",
            event_data={
                "workspace_slug": workspace_slug,
                "project_id": str(project_id),
                "issue_id": str(issue_id),
                "comment_text": comment_text,
                "mentioned_agent": agent.display_name,
            },
            current_site=current_site,
        )
```

Call this function at the end of the comment `create` method, after the existing background task dispatches:

```python
_detect_agent_mentions(
    comment_text=serializer.data.get("comment_stripped", ""),
    workspace_slug=slug,
    project_id=project_id,
    issue_id=issue_id,
    current_site=base_host(request=request, is_app=True),
)
```

AC10.6 is satisfied by the `is_active=True` filter — deactivated agents are excluded from the query.

Note on mention detection: The regex operates on `comment_stripped` (plain text extracted from the comment HTML). This field preserves `@` prefixes from the original text. The `display_name__in` query naturally limits results to only registered agents, so matching non-agent `@mentions` (e.g., `@username`) in the regex is harmless — they simply won't match any `AgentProfile`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: Existing tests still pass

**Commit:** `feat: add @agent-name mention detection to comment creation`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Write tests for webhook delivery and mention detection

**Verifies:** hw-ai-infra.AC10.1, hw-ai-infra.AC10.2, hw-ai-infra.AC10.3, hw-ai-infra.AC10.4, hw-ai-infra.AC10.5, hw-ai-infra.AC10.6

**Files:**
- Create: `apps/api/plane/tests/unit/hw/test_agent_webhook.py`

**Testing:**

Unit tests for the webhook task and mention detection:

- hw-ai-infra.AC10.1: `_detect_agent_mentions()` with text containing `@myagent` dispatches `agent_webhook_send_task.delay()` for matching active agent
- hw-ai-infra.AC10.2: `agent_webhook_send_task` includes `X-Plane-Signature` header computed with HMAC-SHA256 of the payload using the agent's webhook_secret
- hw-ai-infra.AC10.3: The webhook payload contains `run_id` matching the pre-created `AgentRun.id`
- hw-ai-infra.AC10.4: Task is decorated with `autoretry_for=(requests.RequestException,)`, `retry_backoff=600`, `max_retries=5`
- hw-ai-infra.AC10.5: When `self.request.retries >= self.max_retries`, the agent's `is_active` is set to `False`
- hw-ai-infra.AC10.6: `_detect_agent_mentions()` with text containing `@deactivated-agent` where agent has `is_active=False` does NOT dispatch a webhook

Mock `requests.post` and `agent_webhook_send_task.delay` as appropriate. Use `@pytest.mark.unit` and `@pytest.mark.django_db`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `test: add tests for agent webhook delivery and mention detection`
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->
