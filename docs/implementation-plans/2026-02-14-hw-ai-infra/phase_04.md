# HW AI Infrastructure Implementation Plan — Phase 4

**Goal:** Create the database foundation for agent infrastructure: models, enums, migrations, and serializers.

**Architecture:** Three new models in `plane.hw` — `AgentProfile` (one-to-one with User), `AgentRun` (lifecycle tracking), `AgentRunActivity` (individual steps). Extends the existing `BotTypeEnum` with `AGENT`. All models inherit from `BaseModel` (UUID pk, timestamps, soft delete). Serializers use the existing `BaseSerializer` pattern from HW serializers.

**Tech Stack:** Python, Django 4.2, Django REST Framework 3.15, pytest

**Scope:** 8 phases from original design (phase 4 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC7: Agents can be registered and authenticated (partial — model foundation)
- **hw-ai-infra.AC7.1 Success:** POST to agent registration endpoint creates a bot User (`is_bot=True`, `bot_type=AGENT`) + AgentProfile + APIToken
- **hw-ai-infra.AC7.3 Success:** Agent profile stores webhook URL, secret, and event triggers

### hw-ai-infra.AC8: Agent run lifecycle works (partial — model and status transitions)
- **hw-ai-infra.AC8.1 Success:** Run can be created, transitioned through `created` → `in_progress` → `completed`
- **hw-ai-infra.AC8.2 Success:** Run can be marked `failed` or `stopped`
- **hw-ai-infra.AC8.5 Failure:** Invalid status transitions are rejected (e.g., `completed` → `in_progress`)

### hw-ai-infra.AC9: Activity system works (partial — model foundation)
- **hw-ai-infra.AC9.1 Success:** Thoughts and actions are stored with `is_ephemeral=True`

---

<!-- START_TASK_1 -->
### Task 1: Add AGENT to BotTypeEnum

**Files:**
- Modify: `apps/api/plane/db/models/user.py:52-53`

**Step 1: Extend the enum**

Add the `AGENT` choice to the existing `BotTypeEnum` at line 52-53:

```python
class BotTypeEnum(models.TextChoices):
    WORKSPACE_SEED = "WORKSPACE_SEED", "Workspace Seed"
    AGENT = "AGENT", "Agent"
```

This is a TextChoices enum stored as a CharField — no migration is needed for this change since the field already accepts any string up to 30 chars.

**Step 2: Verify**

Run: `cd apps/api && python -c "from plane.db.models.user import BotTypeEnum; print(BotTypeEnum.AGENT)"`
Expected: `AGENT`

**Step 3: Commit**

```bash
git add apps/api/plane/db/models/user.py
git commit -m "feat: add AGENT to BotTypeEnum for agent bot users"
```
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-4) -->

<!-- START_TASK_2 -->
### Task 2: Create AgentProfile, AgentRun, AgentRunActivity models

**Verifies:** hw-ai-infra.AC7.3, hw-ai-infra.AC8.1, hw-ai-infra.AC8.2, hw-ai-infra.AC9.1

**Files:**
- Create: `apps/api/plane/hw/models/agent.py`
- Modify: `apps/api/plane/hw/models/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/models/agent.py` with three models. Follow the exact patterns from `apps/api/plane/hw/models/issue_property.py`:

```python
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from plane.db.models import BaseModel


class AgentRunStatus(models.TextChoices):
    CREATED = "created", "Created"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    STOPPED = "stopped", "Stopped"
    STALE = "stale", "Stale"


class AgentActivityType(models.TextChoices):
    THOUGHT = "thought", "Thought"
    ACTION = "action", "Action"
    RESPONSE = "response", "Response"
    ELICITATION = "elicitation", "Elicitation"
    ERROR = "error", "Error"


VALID_STATUS_TRANSITIONS = {
    AgentRunStatus.CREATED: {AgentRunStatus.IN_PROGRESS, AgentRunStatus.FAILED, AgentRunStatus.STOPPED},
    AgentRunStatus.IN_PROGRESS: {
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.STOPPED,
        AgentRunStatus.STALE,
    },
    AgentRunStatus.STALE: {AgentRunStatus.IN_PROGRESS, AgentRunStatus.FAILED, AgentRunStatus.STOPPED},
    AgentRunStatus.COMPLETED: set(),
    AgentRunStatus.FAILED: set(),
    AgentRunStatus.STOPPED: set(),
}


class AgentProfile(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_profile",
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_agents",
    )
    webhook_url = models.URLField(max_length=1024, blank=True, default="")
    webhook_secret = models.CharField(max_length=255, default="")
    event_triggers = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "hw_agent_profiles"
        unique_together = [("workspace", "display_name")]

    def __str__(self):
        return f"{self.display_name} ({self.workspace.slug})"


class AgentRun(BaseModel):
    agent = models.ForeignKey(
        AgentProfile,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_runs",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="agent_runs",
        null=True,
        blank=True,
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="agent_runs",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=AgentRunStatus.choices,
        default=AgentRunStatus.CREATED,
    )
    stale_timeout = models.IntegerField(default=300)
    last_activity_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    trigger_metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "hw_agent_runs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} ({self.status})"

    def validate_transition(self, new_status):
        """Validate that a status transition is allowed."""
        allowed = VALID_STATUS_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from '{self.status}' to '{new_status}'. "
                f"Allowed transitions: {', '.join(s.value for s in allowed) or 'none'}"
            )


class AgentRunActivity(BaseModel):
    run = models.ForeignKey(
        AgentRun,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    activity_type = models.CharField(
        max_length=20,
        choices=AgentActivityType.choices,
    )
    content = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict)
    is_ephemeral = models.BooleanField(default=False)

    class Meta:
        db_table = "hw_agent_run_activities"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.activity_type} in run {self.run_id}"

    def save(self, *args, **kwargs):
        if self.activity_type in (AgentActivityType.THOUGHT, AgentActivityType.ACTION):
            self.is_ephemeral = True
        super().save(*args, **kwargs)
```

Update `apps/api/plane/hw/models/__init__.py`:

```python
from .issue_property import IssuePropertyDefinition, IssuePropertyValue
from .agent import (
    AgentProfile,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
    VALID_STATUS_TRANSITIONS,
)
```

**Step 2: Verify imports**

Run: `cd apps/api && python -c "from plane.hw.models import AgentProfile, AgentRun, AgentRunActivity; print('OK')"`
Expected: Imports successfully

**Step 3: Commit**

```bash
git add apps/api/plane/hw/models/agent.py apps/api/plane/hw/models/__init__.py
git commit -m "feat: add AgentProfile, AgentRun, AgentRunActivity models"
```
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create migration for agent models

**Files:**
- Create: `apps/api/plane/hw/migrations/NNNN_agent_models.py` (auto-generated — number depends on existing migrations)

**Step 1: Generate migration**

Run: `cd apps/api && python manage.py makemigrations hw --name agent_models`
Expected: Creates a migration file (likely `0004_agent_models.py`, but the number is auto-generated and may differ if other migrations have been added) with CreateModel operations for AgentProfile, AgentRun, AgentRunActivity.

**Step 2: Verify migration applies**

Run: `cd apps/api && python manage.py migrate hw`
Expected: Applies migration cleanly

**Step 3: Commit**

```bash
git add apps/api/plane/hw/migrations/*_agent_models.py
git commit -m "feat: add migration for agent infrastructure models"
```
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Create agent serializers

**Files:**
- Create: `apps/api/plane/hw/serializers/agent.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/serializers/agent.py` following the pattern from existing HW serializers (e.g., `PropertyDefinitionSerializer`):

```python
from rest_framework import serializers

from plane.app.serializers import BaseSerializer
from plane.hw.models import AgentProfile, AgentRun, AgentRunActivity


class AgentProfileSerializer(BaseSerializer):
    class Meta:
        model = AgentProfile
        fields = [
            "id",
            "user_id",
            "workspace_id",
            "webhook_url",
            "event_triggers",
            "is_active",
            "display_name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "workspace_id",
            "created_at",
            "updated_at",
        ]


class AgentProfileCreateSerializer(BaseSerializer):
    class Meta:
        model = AgentProfile
        fields = [
            "display_name",
            "description",
            "webhook_url",
            "webhook_secret",
            "event_triggers",
        ]


class AgentRunSerializer(BaseSerializer):
    class Meta:
        model = AgentRun
        fields = [
            "id",
            "agent_id",
            "workspace_id",
            "project_id",
            "issue_id",
            "status",
            "stale_timeout",
            "last_activity_at",
            "completed_at",
            "trigger_metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "agent_id",
            "workspace_id",
            "last_activity_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]


class AgentRunActivitySerializer(BaseSerializer):
    class Meta:
        model = AgentRunActivity
        fields = [
            "id",
            "run_id",
            "activity_type",
            "content",
            "metadata",
            "is_ephemeral",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "run_id",
            "is_ephemeral",
            "created_at",
            "updated_at",
        ]
```

Update `apps/api/plane/hw/serializers/__init__.py` to export the new serializers:

```python
from .agent import (
    AgentProfileSerializer,
    AgentProfileCreateSerializer,
    AgentRunSerializer,
    AgentRunActivitySerializer,
)
```

Append these imports to the existing exports in `__init__.py`.

**Step 2: Verify imports**

Run: `cd apps/api && python -c "from plane.hw.serializers import AgentProfileSerializer, AgentRunSerializer; print('OK')"`
Expected: Imports successfully

**Step 3: Commit**

```bash
git add apps/api/plane/hw/serializers/agent.py apps/api/plane/hw/serializers/__init__.py
git commit -m "feat: add agent model serializers"
```
<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 5-6) -->

<!-- START_TASK_5 -->
### Task 5: Write unit tests for agent models

**Verifies:** hw-ai-infra.AC7.3, hw-ai-infra.AC8.1, hw-ai-infra.AC8.2, hw-ai-infra.AC8.5, hw-ai-infra.AC9.1

**Files:**
- Create: `apps/api/plane/tests/unit/hw/test_agent_models.py`

**Testing:**

Tests must verify each AC:

- hw-ai-infra.AC7.3: Creating an `AgentProfile` with `webhook_url`, `webhook_secret`, and `event_triggers` — all fields persist and are retrievable
- hw-ai-infra.AC8.1: Creating an `AgentRun` and transitioning `created` → `in_progress` → `completed` succeeds via `validate_transition()`
- hw-ai-infra.AC8.2: Transitioning to `failed` and `stopped` from valid states succeeds
- hw-ai-infra.AC8.5: Calling `validate_transition()` for invalid transitions (e.g., `completed` → `in_progress`) raises `ValueError`
- hw-ai-infra.AC9.1: Creating an `AgentRunActivity` with `activity_type="thought"` automatically sets `is_ephemeral=True` on save; same for `"action"`

Use `@pytest.mark.unit` and `@pytest.mark.django_db`. Use factories or direct model creation following the existing pattern in `apps/api/plane/tests/unit/hw/`.

Test classes:
- `TestAgentProfile` — creation, field storage, workspace scoping
- `TestAgentRun` — creation, all valid status transitions, all invalid transitions
- `TestAgentRunActivity` — creation, ephemeral auto-set for thought/action types, non-ephemeral for response/error types

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `test: add unit tests for agent models and status transitions`
<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Write unit tests for agent serializers

**Files:**
- Create: `apps/api/plane/tests/unit/hw/test_agent_serializers.py`

**Testing:**

Test serializer field presence, read-only enforcement, and validation:

- `AgentProfileSerializer` correctly serializes all fields, respects read_only_fields
- `AgentProfileCreateSerializer` accepts only the creation fields
- `AgentRunSerializer` correctly serializes run with all fields, respects read_only_fields
- `AgentRunActivitySerializer` correctly serializes activities, `is_ephemeral` is read-only

Use `@pytest.mark.unit` and `@pytest.mark.django_db`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `test: add unit tests for agent serializers`
<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->
