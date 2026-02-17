# Agent UX Implementation Plan — Phase 1: Data Model and Migrations

**Goal:** Extend the database schema with conversation grouping, agent type routing, and the built-in agent seed.

**Architecture:** New Django models (`AgentConversation`, `AgentConversationMessage`) extend the existing agent infrastructure. A new `agent_type` field on `AgentProfile` distinguishes external (webhook) agents from the built-in agent. A workspace signal seeds the built-in agent profile automatically.

**Tech Stack:** Django 4.2, Django REST Framework 3.15, PostgreSQL, pytest with pytest-django

**Scope:** 8 phases from original design (this is phase 1 of 8)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC1: Agent management UI

- **agent-ux.AC1.4 Success:** Built-in agent card is always present (auto-seeded), shows configuration options (model override, tool permissions, active toggle), and cannot be deleted.

### agent-ux.AC6: Cross-cutting behaviours

- **agent-ux.AC6.2:** External agent infrastructure (webhooks, mention detection, activity posting) continues to work unchanged.

---

## Investigation findings

- **AgentProfile** at `apps/api/plane/hw/models/agent.py:44-68` — confirmed fields: user (OneToOne), workspace (FK), webhook_url, webhook_secret, event_triggers, is_active, display_name, description. No `agent_type` field yet.
- **AgentRun** at `apps/api/plane/hw/models/agent.py:70-136` — status choices: created, in_progress, completed, failed, stopped, stale. Validated transitions in `save()`. No `conversation` FK yet.
- **AgentRunActivity** at `apps/api/plane/hw/models/agent.py:138-165` — activity types: thought, action, response, elicitation, error. Ephemeral enforcement on thought/action.
- **Serializers** at `apps/api/plane/hw/serializers/agent.py` — 5 serializers exist (profile, profile create, run, run create, activity). No conversation serializers.
- **Views** at `apps/api/plane/hw/views/agent.py` — 3 ViewSets (profile, run, activity). No conversation endpoints.
- **URLs** at `apps/api/plane/hw/urls/agent.py` — all agent endpoints registered.
- **Workspace seed** at `apps/api/plane/bgtasks/workspace_seed_task.py:504-570` — pattern for bot user creation confirmed.
- **BotTypeEnum** at `db/models/user.py:52-117` — values: WORKSPACE_SEED, AGENT.
- **Migration 0004** in `hw/migrations/0004_agent_models.py` — creates agent tables.
- **Tests** at `tests/contract/hw/test_agent_registration.py` (272 lines) and `tests/contract/hw/test_agent_runs.py` (387 lines) — comprehensive contract tests exist using real database fixtures via pytest-django.
- **Test methodology:** Uses `@pytest.mark.django_db`, actual ORM objects, Factory Boy factories. Celery tasks auto-mocked. No DB mocking.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Add agent_type field to AgentProfile and conversation models

**Verifies:** agent-ux.AC6.2

**Files:**

- Modify: `apps/api/plane/hw/models/agent.py:44-165`
- Modify: `apps/api/plane/hw/models/__init__.py` (update exports)

**Implementation:**

Add `AgentType` text choices and `agent_type` field to `AgentProfile`:

```python
class AgentType(models.TextChoices):
    EXTERNAL = "external"
    BUILTIN = "builtin"
```

Add `agent_type` field to `AgentProfile`:

```python
agent_type = models.CharField(
    max_length=20,
    choices=AgentType.choices,
    default=AgentType.EXTERNAL,
)
```

Add `AgentConversation` model after `AgentRunActivity`:

```python
class AgentConversation(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_conversations",
    )
    user = models.ForeignKey(
        "db.User",
        on_delete=models.CASCADE,
        related_name="agent_conversations",
    )
    title = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "hw_agent_conversations"
        ordering = ["-created_at"]
```

Add `AgentConversationMessage` model:

```python
class AgentConversationMessageRole(models.TextChoices):
    USER = "user"
    ASSISTANT = "assistant"

class AgentConversationMessage(BaseModel):
    conversation = models.ForeignKey(
        AgentConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(
        max_length=20,
        choices=AgentConversationMessageRole.choices,
    )
    content = models.TextField()
    run = models.ForeignKey(
        AgentRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversation_messages",
    )

    class Meta:
        db_table = "hw_agent_conversation_messages"
        ordering = ["created_at"]
```

Add `conversation` FK to `AgentRun`:

```python
conversation = models.ForeignKey(
    "hw.AgentConversation",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="runs",
)
```

Update `__init__.py` to export `AgentConversation`, `AgentConversationMessage`, `AgentType`, `AgentConversationMessageRole`.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add agent_type, conversation, and message models`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create migration for new models and fields

**Verifies:** None (infrastructure)

**Files:**

- Create: `apps/api/plane/hw/migrations/0005_agent_conversations.py` (auto-generated)

**Implementation:**

Run: `python apps/api/manage.py makemigrations hw`

Verify the generated migration includes:

- `agent_type` field addition to `AgentProfile` (default="external")
- `conversation` FK addition to `AgentRun` (nullable)
- `AgentConversation` table creation
- `AgentConversationMessage` table creation

Run: `python apps/api/manage.py migrate`

**Verification:**

Run: `python apps/api/manage.py migrate`
Expected: Migration applies cleanly with no errors.

Run: `python apps/api/manage.py showmigrations hw`
Expected: All migrations show `[X]` (applied).

**Commit:** `feat(hw): add migration for agent conversations and agent_type`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Add serializers for conversation models and update AgentProfileSerializer

**Verifies:** None (infrastructure — serializers tested via contract tests in Task 5)

**Files:**

- Modify: `apps/api/plane/hw/serializers/agent.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py` (update exports)

**Implementation:**

Add `agent_type` to `AgentProfileSerializer.Meta.fields` and `read_only_fields`.

Add `agent_type` to `AgentProfileCreateSerializer.Meta.fields` (writable, so admins can set it on creation — defaults to "external").

Add `conversation` field to `AgentRunSerializer.Meta.fields` and `read_only_fields` (as `conversation_id`).

Add new serializers:

```python
class AgentConversationSerializer(BaseSerializer):
    class Meta:
        model = AgentConversation
        fields = [
            "id",
            "workspace_id",
            "user_id",
            "title",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "user_id",
            "created_at",
            "updated_at",
        ]


class AgentConversationMessageSerializer(BaseSerializer):
    class Meta:
        model = AgentConversationMessage
        fields = [
            "id",
            "conversation_id",
            "role",
            "content",
            "run_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "conversation_id",
            "run_id",
            "created_at",
            "updated_at",
        ]
```

Update `__init__.py` to export new serializers.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add conversation serializers and update profile serializer with agent_type`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Add workspace seed logic for built-in agent

**Verifies:** agent-ux.AC1.4

**Files:**

- Modify: `apps/api/plane/bgtasks/workspace_seed_task.py`

**Implementation:**

In the `workspace_seed` function, after the existing bot user creation section (~line 570), add logic to seed the built-in agent profile.

The function should:

1. Check if a built-in agent profile already exists for this workspace (idempotent).
2. If not, create a bot user with `bot_type=BotTypeEnum.AGENT`, `display_name="Plane Agent"`, `is_bot=True`.
3. Add the bot user as a workspace member (role=20, admin).
4. Create an `AgentProfile` with `agent_type=AgentType.BUILTIN`, `display_name="Plane Agent"`, `is_active=True`.

Follow the existing bot user creation pattern at lines 504-570. Use a unique email pattern like `builtin_agent_{workspace.id}@plane.so` and username `builtin_agent_{workspace.id}`.

The seed must be idempotent — calling it on a workspace that already has a built-in agent should be a no-op.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): seed built-in agent profile on workspace creation`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Tests for new models and agent_type field

**Verifies:** agent-ux.AC6.2, agent-ux.AC1.4

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_agent_models.py`

**Testing:**

Tests must verify:

- **agent-ux.AC6.2 (partial):** Creating an `AgentProfile` without specifying `agent_type` defaults to `"external"`. Existing agent infrastructure (creating runs, posting activities) still works unchanged with the new field present.
- **agent-ux.AC1.4 (partial):** A built-in agent profile can be created with `agent_type="builtin"`.
- `AgentConversation` can be created with workspace and user FKs, defaults `is_active=True`.
- `AgentConversationMessage` can be created with conversation FK, role ("user" or "assistant"), and content. The `run` FK is nullable.
- `AgentRun` can be created with a nullable `conversation` FK. Status transitions still work correctly with the conversation field present.
- Conversation messages are ordered by `created_at` ascending.
- Conversations are ordered by `created_at` descending.

Follow the existing test pattern in `tests/contract/hw/test_agent_registration.py` — use `@pytest.mark.django_db`, create real ORM objects via fixtures, and use the `workspace` and `create_user` fixtures from conftest.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass, including new ones.

**Commit:** `test(hw): add unit tests for agent conversation models and agent_type`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Tests for workspace seed of built-in agent

**Verifies:** agent-ux.AC1.4

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_builtin_agent_seed.py`

**Testing:**

Tests must verify:

- **agent-ux.AC1.4:** After `workspace_seed` runs for a workspace, a built-in `AgentProfile` exists with `agent_type="builtin"`, `is_active=True`, and a bot user with `bot_type=BotTypeEnum.AGENT`.
- **Idempotency:** Running the seed task twice for the same workspace does not create duplicate built-in agent profiles.
- The built-in agent's bot user is a workspace member.

Use the `workspace` fixture from conftest. Since `mock_celery_tasks` is autouse, you'll need to call `workspace_seed` directly (not via `.delay()`). Import the function and call it with the workspace slug.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass, including new ones.

**Commit:** `test(hw): add unit tests for built-in agent workspace seed`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_TASK_7 -->

### Task 7: Update AGENTS.md with new model contracts

**Verifies:** None (documentation)

**Files:**

- Modify: `apps/api/plane/hw/models/AGENTS.md`

**Implementation:**

Add documentation for:

- `AgentType` enum and its values
- `agent_type` field on `AgentProfile` (default behaviour, constraints)
- `AgentConversation` model (fields, ordering, relationships)
- `AgentConversationMessage` model (fields, ordering, role choices)
- `conversation` FK on `AgentRun` (nullable, SET_NULL behaviour)
- Built-in agent seed contract (idempotent, auto-created per workspace)

Follow the existing documentation style in AGENTS.md — include invariants, guarantees, and edge cases.

**Verification:**

Review the updated AGENTS.md for completeness.

**Commit:** `docs(hw): update AGENTS.md with conversation models and agent_type contracts`

<!-- END_TASK_7 -->
