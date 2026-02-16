# HW AI Infrastructure Implementation Plan — Phase 5

**Goal:** API endpoints for creating agents, managing runs, and posting activities.

**Architecture:** Three ViewSets in `plane.hw.views.agent` — `AgentProfileViewSet` (admin-scoped registration + CRUD), `AgentRunViewSet` (run lifecycle), `AgentRunActivityViewSet` (activity posting). Registration creates a bot User + AgentProfile + APIToken in a single transaction. Response activities auto-create IssueComments with the bot user as actor. URLs registered under `/api/workspaces/{slug}/agents/`.

**Tech Stack:** Python, Django 4.2, Django REST Framework 3.15, pytest

**Scope:** 8 phases from original design (phase 5 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC7: Agents can be registered and authenticated
- **hw-ai-infra.AC7.1 Success:** POST to agent registration endpoint creates a bot User (`is_bot=True`, `bot_type=AGENT`) + AgentProfile + APIToken
- **hw-ai-infra.AC7.2 Success:** Agent API token authenticates against runtime endpoints
- **hw-ai-infra.AC7.3 Success:** Agent profile stores webhook URL, secret, and event triggers
- **hw-ai-infra.AC7.4 Failure:** Non-admin users cannot register agents (403)
- **hw-ai-infra.AC7.5 Edge:** Deactivated agent's token is rejected (401 or 403)

### hw-ai-infra.AC8: Agent run lifecycle works
- **hw-ai-infra.AC8.1 Success:** Run can be created, transitioned through `created` → `in_progress` → `completed`
- **hw-ai-infra.AC8.2 Success:** Run can be marked `failed` or `stopped`
- **hw-ai-infra.AC8.5 Failure:** Invalid status transitions are rejected (e.g., `completed` → `in_progress`)

### hw-ai-infra.AC9: Activity system works
- **hw-ai-infra.AC9.1 Success:** Thoughts and actions are stored with `is_ephemeral=True`
- **hw-ai-infra.AC9.2 Success:** Response activities automatically create IssueComments with the bot user as actor
- **hw-ai-infra.AC9.3 Success:** Elicitation activities store the agent's question and expected input type
- **hw-ai-infra.AC9.4 Success:** Error activities are stored and retrievable
- **hw-ai-infra.AC9.6 Success:** IssueComments from response activities have `external_source="agent"` and `external_id="{run_id}:{activity_id}"`

### hw-ai-infra.AC12: Cross-cutting behaviours
- **hw-ai-infra.AC12.1:** All agent API endpoints require authentication (no anonymous access)
- **hw-ai-infra.AC12.3:** External runtimes can integrate using only HTTP — no SDK dependency required

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create AgentProfileViewSet with bot user registration

**Verifies:** hw-ai-infra.AC7.1, hw-ai-infra.AC7.3, hw-ai-infra.AC7.4, hw-ai-infra.AC7.5

**Files:**
- Create: `apps/api/plane/hw/views/agent.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/views/agent.py` following the pattern from `apps/api/plane/hw/views/issue_property.py`:

```python
import uuid

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views import BaseViewSet
from plane.db.models import APIToken, User, Workspace, IssueComment
from plane.db.models.user import BotTypeEnum
from plane.hw.models import (
    AgentProfile,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
)
from plane.hw.serializers import (
    AgentProfileSerializer,
    AgentProfileCreateSerializer,
    AgentRunSerializer,
    AgentRunActivitySerializer,
)
```

**AgentProfileViewSet:**

- `list` — ADMIN/MEMBER at WORKSPACE level — lists all agents in workspace
- `retrieve` — ADMIN/MEMBER at WORKSPACE level — get single agent
- `create` — ADMIN only at WORKSPACE level — registration endpoint:
  1. Validate input with `AgentProfileCreateSerializer`
  2. In a `transaction.atomic()` block:
     - Create bot User: `User.objects.create(username=f"agent_{uuid4().hex}", email=f"agent_{uuid4().hex}@agent.internal", display_name=data["display_name"], is_bot=True, bot_type=BotTypeEnum.AGENT, password=make_password(uuid4().hex), is_password_autoset=True)` (uses `@agent.internal` to avoid conflicting with real email addresses on `plane.so`)
     - Create AgentProfile: linked to user and workspace
     - Create APIToken: `APIToken.objects.create(label=f"agent-{profile.display_name}", user=bot_user, workspace=workspace, user_type=1, is_service=True)`
  3. Return the profile data plus the token value (token is only visible on creation)
- `partial_update` — ADMIN at WORKSPACE level — update agent profile fields
- `destroy` — ADMIN at WORKSPACE level — deactivate agent (set `is_active=False`), don't hard delete

For AC7.5 (deactivated agent token rejection): Add a check in the run/activity views that verifies the agent's `is_active` status. If the agent owning the token is deactivated, return 403.

**Update** `apps/api/plane/hw/views/__init__.py` to export the new viewsets.

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.views import AgentProfileViewSet; print('OK')"`
Expected: Imports successfully

**Commit:** `feat: add AgentProfileViewSet with bot user registration`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create AgentRunViewSet

**Verifies:** hw-ai-infra.AC8.1, hw-ai-infra.AC8.2, hw-ai-infra.AC8.5

**Files:**
- Modify: `apps/api/plane/hw/views/agent.py`

**Implementation:**

Add `AgentRunViewSet` to `agent.py`:

- `list` — ADMIN/MEMBER at WORKSPACE level — list runs for a workspace, optionally filtered by agent_id or issue_id query params
- `retrieve` — ADMIN/MEMBER at WORKSPACE level — get single run with activities
- `create` — authenticated (agent token or user) — create a new run:
  1. Validate agent exists and is active
  2. Create AgentRun with status `created`, linking workspace/project/issue from request data
  3. Return run data
- `partial_update` — authenticated — update run status:
  1. Get current run
  2. If `status` is in the update data, call `run.validate_transition(new_status)` — returns 400 on invalid transition
  3. If transitioning to a terminal state (`completed`, `failed`, `stopped`), set `completed_at`
  4. Save and return updated run
- No `destroy` — runs are not deletable

The `validate_transition()` method on the model (from Phase 4) raises `ValueError` for invalid transitions. Catch this and return a 400 response with the error message.

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.views import AgentRunViewSet; print('OK')"`
Expected: Imports successfully

**Commit:** `feat: add AgentRunViewSet for run lifecycle management`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create AgentRunActivityViewSet with IssueComment auto-creation

**Verifies:** hw-ai-infra.AC9.1, hw-ai-infra.AC9.2, hw-ai-infra.AC9.3, hw-ai-infra.AC9.4, hw-ai-infra.AC9.6

**Files:**
- Modify: `apps/api/plane/hw/views/agent.py`

**Implementation:**

Add `AgentRunActivityViewSet` to `agent.py`:

- `list` — ADMIN/MEMBER at WORKSPACE level — list activities for a run, ordered by `created_at`
- `create` — authenticated (agent token) — post new activity:
  1. Get the run and validate it's in an active state (`created`, `in_progress`, `stale`)
  2. If run is `created` or `stale`, auto-transition to `in_progress`
  3. Create the activity with the serializer
  4. Update `run.last_activity_at = timezone.now()`
  5. **If `activity_type == "response"`**: auto-create an IssueComment:
     ```python
     if activity.activity_type == AgentActivityType.RESPONSE and run.issue_id:
         IssueComment.objects.create(
             comment_stripped=activity.content,
             comment_html=f"<p>{activity.content}</p>",
             comment_json={"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": activity.content}]}]},
             project_id=run.project_id,
             issue_id=run.issue_id,
             actor=run.agent.user,
             external_source="agent",
             external_id=f"{run.id}:{activity.id}",
         )
     ```
  6. Return the activity data

The `is_ephemeral` flag is set automatically by `AgentRunActivity.save()` (from Phase 4 model) for `thought` and `action` types.

For elicitation activities (AC9.3), the `metadata` JSON field stores the question and expected input type:
```json
{"question": "What priority should this be?", "input_type": "select", "options": ["High", "Medium", "Low"]}
```

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.views import AgentRunActivityViewSet; print('OK')"`
Expected: Imports successfully

**Commit:** `feat: add AgentRunActivityViewSet with IssueComment auto-creation`
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->
### Task 4: Register agent URL routes

**Verifies:** hw-ai-infra.AC12.1, hw-ai-infra.AC12.3

**Files:**
- Create: `apps/api/plane/hw/urls/agent.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/urls/agent.py` following the pattern from `apps/api/plane/hw/urls/issue_property.py`:

```python
from django.urls import path

from plane.hw.views import (
    AgentProfileViewSet,
    AgentRunViewSet,
    AgentRunActivityViewSet,
)

urlpatterns = [
    # Agent profile CRUD
    path(
        "workspaces/<str:slug>/agents/",
        AgentProfileViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agents",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:pk>/",
        AgentProfileViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-agent",
    ),
    # Agent runs
    path(
        "workspaces/<str:slug>/agent-runs/",
        AgentRunViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agent-runs",
    ),
    path(
        "workspaces/<str:slug>/agent-runs/<uuid:pk>/",
        AgentRunViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="workspace-agent-run",
    ),
    # Agent run activities
    path(
        "workspaces/<str:slug>/agent-runs/<uuid:run_id>/activities/",
        AgentRunActivityViewSet.as_view({"get": "list", "post": "create"}),
        name="agent-run-activities",
    ),
]
```

Update `apps/api/plane/hw/urls/__init__.py` to include the new URL module alongside existing ones.

All endpoints require authentication (provided by `BaseViewSet`'s `permission_classes = [IsAuthenticated]` default). This satisfies AC12.1.

The URL contract is pure HTTP REST — no SDK required (AC12.3).

**Verification:**

Step 1 — verify imports work:

Run: `cd apps/api && python -c "from plane.hw.urls import urlpatterns; print(f'{len(urlpatterns)} URLs registered')"`
Expected: Shows increased URL count

Step 2 — verify URL mounting point by checking how HW URLs are included in the main URL configuration. Check `apps/api/plane/app/urls/__init__.py` or `apps/api/plane/urls.py` for where `plane.hw.urls` is included. The agent endpoints should be reachable at `/api/workspaces/{slug}/agents/` and `/api/workspaces/{slug}/agent-runs/`. Confirm the base prefix matches what Phase 7's frontend service expects.

Run: `cd apps/api && python -c "from django.urls import reverse; print(reverse('workspace-agents', kwargs={'slug': 'test'}))"`
Expected: `/api/workspaces/test/agents/` (confirm the `/api/` prefix)

If the prefix differs, update either the URL patterns or the Phase 7 service URLs to match.

**Commit:** `feat: register agent API URL routes`
<!-- END_TASK_4 -->

<!-- START_SUBCOMPONENT_B (tasks 5-6) -->

<!-- START_TASK_5 -->
### Task 5: Write contract tests for agent registration

**Verifies:** hw-ai-infra.AC7.1, hw-ai-infra.AC7.2, hw-ai-infra.AC7.3, hw-ai-infra.AC7.4, hw-ai-infra.AC7.5

**Files:**
- Create: `apps/api/plane/tests/contract/hw/test_agent_registration.py`

**Testing:**

Contract tests for the agent registration and profile endpoints:

- hw-ai-infra.AC7.1: POST to `/api/workspaces/{slug}/agents/` with valid data creates bot User + AgentProfile + returns API token in response
- hw-ai-infra.AC7.2: Use the returned token to authenticate against `/api/workspaces/{slug}/agent-runs/` — should succeed (200/201)
- hw-ai-infra.AC7.3: GET the created agent profile and verify webhook_url, webhook_secret, event_triggers are stored
- hw-ai-infra.AC7.4: Authenticate as a non-admin workspace member and POST to agents/ — should return 403
- hw-ai-infra.AC7.5: Deactivate an agent (PATCH is_active=False), then attempt to use its token against agent-runs/ — should return 403

Use `session_client` for workspace member auth. Create workspace and workspace membership fixtures following `apps/api/plane/tests/conftest.py` patterns.

**Verification:**

Run: `cd apps/api && python run_tests.py -c`
Expected: All tests pass

**Commit:** `test: add contract tests for agent registration`
<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Write contract tests for runs and activities

**Verifies:** hw-ai-infra.AC8.1, hw-ai-infra.AC8.2, hw-ai-infra.AC8.5, hw-ai-infra.AC9.1, hw-ai-infra.AC9.2, hw-ai-infra.AC9.3, hw-ai-infra.AC9.4, hw-ai-infra.AC9.6

**Files:**
- Create: `apps/api/plane/tests/contract/hw/test_agent_runs.py`

**Testing:**

Contract tests for the run lifecycle and activity endpoints:

- hw-ai-infra.AC8.1: POST to create run, PATCH status to `in_progress`, PATCH to `completed` — all succeed
- hw-ai-infra.AC8.2: Create run, transition to `in_progress`, then to `failed` — succeeds; same for `stopped`
- hw-ai-infra.AC8.5: Create run, transition to `completed`, then PATCH to `in_progress` — returns 400 with error message
- hw-ai-infra.AC9.1: POST activity with `activity_type="thought"` — response shows `is_ephemeral=True`
- hw-ai-infra.AC9.2: POST activity with `activity_type="response"` on a run linked to an issue — verify IssueComment is created with the bot user as actor
- hw-ai-infra.AC9.3: POST activity with `activity_type="elicitation"` and `metadata={"question": "...", "input_type": "text"}` — verify metadata is stored
- hw-ai-infra.AC9.4: POST activity with `activity_type="error"` — verify it's stored and retrievable via GET
- hw-ai-infra.AC9.6: After posting a response activity, query IssueComments for the issue and verify `external_source="agent"` and `external_id="{run_id}:{activity_id}"`

Use agent token authentication (created via the registration endpoint in a fixture). Create workspace, project, and issue fixtures.

**Verification:**

Run: `cd apps/api && python run_tests.py -c`
Expected: All tests pass

**Commit:** `test: add contract tests for agent runs and activities`
<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->
