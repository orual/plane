# Resource Workload Implementation Plan — Phase 1

**Goal:** Establish the data layer for capacity, allocation, and worklogs.

**Architecture:** Three new Django models (MemberCapacity and ProjectMemberAllocation in plane.hw, Worklog in plane.db), one field addition (hours_per_point on Estimate), serializers for all new models, and migrations. MemberCapacity uses temporal versioning via an effective_from date field — a new pattern not used elsewhere in the codebase.

**Tech Stack:** Django 4.2, Django REST Framework, PostgreSQL

**Scope:** 7 phases from original design (this is phase 1 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC1: Capacity model

- **resource-workload.AC1.1 Success:** Workspace admin can set a member's capacity in hours per week
- **resource-workload.AC1.2 Success:** Workspace admin can set a member's capacity in points per cycle
- **resource-workload.AC1.3 Success:** Capacity changes with a new `effective_from` date preserve history (previous records remain)
- **resource-workload.AC1.4 Success:** Active capacity is the record with the most recent `effective_from <= today`
- **resource-workload.AC1.5 Success:** Project admin can set per-member allocation caps (max hours, max points) on a project
- **resource-workload.AC1.6 Success:** `hours_per_point` on an estimate enables points↔hours conversion for allocation
- **resource-workload.AC1.7 Edge:** Member with no capacity record is treated as unset (no utilisation calculation, not as 0)
- **resource-workload.AC1.8 Edge:** Project allocation cap exceeding workspace capacity is allowed (cap is a ceiling, not a guarantee)

---

## Testing references

- Test directory: `apps/api/plane/tests/unit/hw/`
- Factories: `apps/api/plane/tests/factories.py` — UserFactory, WorkspaceFactory, WorkspaceMemberFactory, ProjectFactory, ProjectMemberFactory, IssueFactory, StateFactory
- Fixtures: `apps/api/plane/tests/conftest.py` — api_client, create_user, session_client, workspace
- Markers: `@pytest.mark.unit` on class, `@pytest.mark.django_db` on methods
- Run: `python run_tests.py -u` from `apps/api/`

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: MemberCapacity model

**Verifies:** resource-workload.AC1.1, resource-workload.AC1.2, resource-workload.AC1.3, resource-workload.AC1.4, resource-workload.AC1.7

**Files:**

- Create: `apps/api/plane/hw/models/capacity.py`
- Modify: `apps/api/plane/hw/models/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/models/capacity.py` with a `MemberCapacity` model that:

- Inherits from `BaseModel` (imported from `plane.db.models`)
- Has fields:
  - `workspace`: FK to `"db.Workspace"`, CASCADE, related_name `"workspace_member_capacities"`
  - `member`: FK to `settings.AUTH_USER_MODEL`, CASCADE, related_name `"member_capacities"`
  - `capacity_hours`: `DecimalField(max_digits=6, decimal_places=2)` — hours per week (e.g., 40.00)
  - `capacity_points`: `IntegerField(null=True, blank=True)` — points per cycle, nullable for when project uses hours-based estimates
  - `effective_from`: `DateField()` — when this capacity takes effect
- Meta:
  - `db_table = "hw_member_capacities"`
  - `ordering = ("-effective_from",)` so most recent is first
  - A `UniqueConstraint` on `(workspace, member, effective_from)` with `condition=Q(deleted_at__isnull=True)` and name `"unique_member_capacity_per_date"`
- A `__str__` returning `f"{self.member.email} — {self.capacity_hours}h/wk (from {self.effective_from})"`
- A class method `get_active(cls, workspace_id, member_id, as_of=None)` that returns the most recent record where `effective_from <= as_of` (defaults to `date.today()`), or `None` if no record exists. This satisfies AC1.4 (active capacity lookup) and AC1.7 (None means "unset", not 0).

Follow the exact pattern in `apps/api/plane/hw/models/agent.py`: copyright header, imports from `django.conf.settings` and `django.db.models`, inherit from `BaseModel`.

Update `apps/api/plane/hw/models/__init__.py` to import and export `MemberCapacity`.

**Testing:**

Tests must verify each AC listed above:

- resource-workload.AC1.1: Create a MemberCapacity with `capacity_hours=40`, verify it persists
- resource-workload.AC1.2: Create a MemberCapacity with `capacity_points=20`, verify it persists
- resource-workload.AC1.3: Create two records for the same member with different `effective_from` dates, verify both exist
- resource-workload.AC1.4: Create records with effective_from in the past and future, call `get_active()`, verify it returns the most recent past record
- resource-workload.AC1.7: Call `get_active()` for a member with no records, verify it returns None

Test file: `apps/api/plane/tests/unit/hw/test_capacity_models.py`
Test class: `TestMemberCapacity` with `@pytest.mark.unit`

**Verification:**
Run: `python run_tests.py -u -k test_capacity_models` from `apps/api/`
Expected: All tests pass

**Commit:** `feat(hw): add MemberCapacity model with temporal versioning`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: ProjectMemberAllocation model

**Verifies:** resource-workload.AC1.5, resource-workload.AC1.8

**Files:**

- Modify: `apps/api/plane/hw/models/capacity.py` (append to existing file)
- Modify: `apps/api/plane/hw/models/__init__.py`

**Implementation:**

Add `ProjectMemberAllocation` model to `apps/api/plane/hw/models/capacity.py`:

- Inherits from `BaseModel`
- Fields:
  - `project`: FK to `"db.Project"`, CASCADE, related_name `"project_member_allocations"`
  - `member`: FK to `settings.AUTH_USER_MODEL`, CASCADE, related_name `"member_allocations"`
  - `max_hours`: `DecimalField(max_digits=6, decimal_places=2)` — max hours per week on this project
  - `max_points`: `IntegerField(null=True, blank=True)` — max points per cycle on this project
- Meta:
  - `db_table = "hw_project_member_allocations"`
  - A `UniqueConstraint` on `(project, member)` with `condition=Q(deleted_at__isnull=True)` and name `"unique_project_member_allocation"`
- `__str__` returning `f"{self.member.email} on {self.project.name} — max {self.max_hours}h/wk"`

No validation preventing `max_hours` from exceeding workspace capacity — AC1.8 says caps can exceed capacity (cap is a ceiling, not a guarantee).

Update `apps/api/plane/hw/models/__init__.py` to import and export `ProjectMemberAllocation`.

**Testing:**

- resource-workload.AC1.5: Create a ProjectMemberAllocation with max_hours and max_points, verify persistence and constraint uniqueness
- resource-workload.AC1.8: Create an allocation cap of 60h on a project for a member who has 40h/wk workspace capacity — verify it's allowed (no validation error)

Test file: `apps/api/plane/tests/unit/hw/test_capacity_models.py` (append to existing)
Test class: `TestProjectMemberAllocation`

**Verification:**
Run: `python run_tests.py -u -k test_capacity_models` from `apps/api/`
Expected: All tests pass

**Commit:** `feat(hw): add ProjectMemberAllocation model`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: MemberCapacity and ProjectMemberAllocation tests

**Verifies:** resource-workload.AC1.1, resource-workload.AC1.2, resource-workload.AC1.3, resource-workload.AC1.4, resource-workload.AC1.5, resource-workload.AC1.7, resource-workload.AC1.8

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_capacity_models.py`
- Modify: `apps/api/plane/tests/factories.py`

**Implementation:**

Add factories to `apps/api/plane/tests/factories.py`:

```python
from plane.hw.models import MemberCapacity, ProjectMemberAllocation

class MemberCapacityFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MemberCapacity

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    member = factory.SubFactory(UserFactory)
    capacity_hours = factory.LazyFunction(lambda: Decimal("40.00"))
    capacity_points = None
    effective_from = factory.LazyFunction(lambda: timezone.now().date())
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectMemberAllocationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProjectMemberAllocation

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    max_hours = factory.LazyFunction(lambda: Decimal("40.00"))
    max_points = None
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

Add `from decimal import Decimal` to the imports in factories.py.

Create test file `apps/api/plane/tests/unit/hw/test_capacity_models.py` with tests for all ACs listed above. Use factories for data setup. Follow the pattern in `apps/api/plane/tests/unit/hw/test_agent_models.py`.

**Testing:**

Tests for MemberCapacity:

- AC1.1: Create with capacity_hours=40.00, assert field value persists
- AC1.2: Create with capacity_points=20, assert field value persists
- AC1.3: Create two records with same workspace+member but different effective_from dates, assert both exist in DB
- AC1.4: Create records with effective_from=2026-01-01 and 2026-02-01, call get_active(as_of=date(2026, 2, 15)), assert returns the Feb record
- AC1.4 (edge): Call get_active(as_of=date(2025, 12, 31)) when earliest record is 2026-01-01, assert returns None
- AC1.7: Call get_active() for member with no records, assert returns None
- Unique constraint: Create two records with same (workspace, member, effective_from), assert IntegrityError

Tests for ProjectMemberAllocation:

- AC1.5: Create with max_hours=24 and max_points=10, assert field values persist
- AC1.8: Create allocation with max_hours=60 for member with capacity_hours=40 — no error raised
- Unique constraint: Create two allocations for same (project, member), assert IntegrityError

**Verification:**
Run: `python run_tests.py -u -k test_capacity_models` from `apps/api/`
Expected: All tests pass

**Commit:** `test(hw): add tests for MemberCapacity and ProjectMemberAllocation models`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-6) -->

<!-- START_TASK_4 -->

### Task 4: Worklog model in plane.db

**Verifies:** resource-workload.AC6.1 (data model only — API and UI are Phase 6)

**Files:**

- Create: `apps/api/plane/db/models/worklog.py`
- Modify: `apps/api/plane/db/models/__init__.py`

**Implementation:**

Create `apps/api/plane/db/models/worklog.py` with a `Worklog` model that:

- Inherits from `ProjectBaseModel` (imported from `.project`)
- Fields:
  - `issue`: FK to `"db.Issue"`, CASCADE, related_name `"worklogs"`
  - `member`: FK to `settings.AUTH_USER_MODEL`, CASCADE, related_name `"worklogs"`
  - `duration_minutes`: `PositiveIntegerField()` — stored as minutes for precision
  - `description`: `TextField(blank=True, default="")` — optional, quick logging should be friction-free
  - `logged_date`: `DateField()` — when the work was done
- Meta:
  - `db_table = "worklogs"`
  - `ordering = ("-logged_date", "-created_at")`
  - `verbose_name = "Worklog"`
  - `verbose_name_plural = "Worklogs"`
- `__str__` returning `f"{self.member.email} — {self.duration_minutes}min on {self.issue.name} ({self.logged_date})"`

Note: `ProjectBaseModel` already provides `workspace`, `project`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` fields. The `save()` method auto-syncs `workspace` from `project`.

Follow the copyright header pattern from existing db models.

Update `apps/api/plane/db/models/__init__.py` to import and export `Worklog`.

**Testing:**

- AC6.1 (data model): Create a Worklog with duration_minutes, logged_date, issue, member — verify persistence
- Verify ProjectBaseModel inheritance: workspace auto-set from project on save

Test file: `apps/api/plane/tests/unit/models/test_worklog_model.py`

**Verification:**
Run: `python run_tests.py -u -k test_worklog_model` from `apps/api/`
Expected: All tests pass

**Commit:** `feat(db): add Worklog model for time entries`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: hours_per_point field on Estimate model

**Verifies:** resource-workload.AC1.6

**Files:**

- Modify: `apps/api/plane/db/models/estimate.py:14-36` (Estimate class)

**Implementation:**

Add to the `Estimate` model (after the `last_used` field on line 18):

```python
hours_per_point = models.DecimalField(
    max_digits=6,
    decimal_places=2,
    null=True,
    blank=True,
    help_text="Conversion factor: 1 point = N hours. Used for cross-project allocation comparison.",
)
```

Nullable so existing estimates don't need a value. When set, the workload aggregation API (Phase 3) uses it to convert points to hours for cross-project comparison.

**Testing:**

- AC1.6: Create an Estimate with hours_per_point=4.0, verify the field persists and can be read back
- Edge: Create an Estimate without hours_per_point, verify it defaults to None

Test file: `apps/api/plane/tests/unit/models/test_estimate_model.py` (create new, or append to existing if one exists)

**Verification:**
Run: `python run_tests.py -u -k test_estimate` from `apps/api/`
Expected: All tests pass

**Commit:** `feat(db): add hours_per_point field to Estimate model`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Worklog and Estimate tests

**Verifies:** resource-workload.AC6.1 (data model), resource-workload.AC1.6

**Files:**

- Create: `apps/api/plane/tests/unit/models/test_worklog_model.py`
- Create: `apps/api/plane/tests/unit/models/test_estimate_model.py`
- Modify: `apps/api/plane/tests/factories.py`

**Implementation:**

Add factories to `apps/api/plane/tests/factories.py`:

```python
from plane.db.models import Worklog, Estimate

class EstimateFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Estimate

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Estimate {n}")
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.SelfAttribute("project.workspace")
    created_by = factory.SelfAttribute("project.created_by")
    updated_by = factory.SelfAttribute("project.created_by")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class WorklogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Worklog

    id = factory.LazyFunction(uuid4)
    issue = factory.SubFactory(IssueFactory)
    project = factory.SelfAttribute("issue.project")
    workspace = factory.SelfAttribute("issue.workspace")
    member = factory.SubFactory(UserFactory)
    duration_minutes = 60
    description = ""
    logged_date = factory.LazyFunction(lambda: timezone.now().date())
    created_by = factory.SelfAttribute("member")
    updated_by = factory.SelfAttribute("member")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

Create test files following patterns in `apps/api/plane/tests/unit/hw/test_agent_models.py`.

**Testing:**

Worklog tests (`test_worklog_model.py`):

- AC6.1: Create worklog with duration_minutes=90 and logged_date, verify persistence
- Verify workspace auto-set from project via ProjectBaseModel
- Verify ordering: create two worklogs with different logged_dates, verify order is most recent first

Estimate tests (`test_estimate_model.py`):

- AC1.6: Create Estimate with hours_per_point=Decimal("4.00"), verify value persists
- AC1.6 (null): Create Estimate without hours_per_point, verify it's None

**Verification:**
Run: `python run_tests.py -u -k "test_worklog_model or test_estimate_model"` from `apps/api/`
Expected: All tests pass

**Commit:** `test(db): add tests for Worklog and Estimate hours_per_point`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-9) -->

<!-- START_TASK_7 -->

### Task 7: Serializers for MemberCapacity and ProjectMemberAllocation

**Files:**

- Create: `apps/api/plane/hw/serializers/capacity.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/serializers/capacity.py` with two serializers following the pattern in `apps/api/plane/hw/serializers/agent.py`:

`MemberCapacitySerializer`:

- Extends `BaseSerializer` (from `plane.app.serializers`)
- Model: `MemberCapacity`
- Fields: `id`, `workspace_id`, `member_id`, `capacity_hours`, `capacity_points`, `effective_from`, `created_at`, `updated_at`
- Read-only: `id`, `workspace_id`, `member_id`, `created_at`, `updated_at`

`ProjectMemberAllocationSerializer`:

- Extends `BaseSerializer`
- Model: `ProjectMemberAllocation`
- Fields: `id`, `project_id`, `member_id`, `max_hours`, `max_points`, `created_at`, `updated_at`
- Read-only: `id`, `project_id`, `member_id`, `created_at`, `updated_at`

Update `apps/api/plane/hw/serializers/__init__.py` to import and export both serializers.

**Verification:**
Run: `python run_tests.py -u -k test_capacity_serializers` from `apps/api/`
Expected: Tests pass (created in Task 9)

**Commit:** `feat(hw): add serializers for MemberCapacity and ProjectMemberAllocation`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Worklog serializer

**Files:**

- Create: `apps/api/plane/hw/serializers/worklog.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/serializers/worklog.py`:

`WorklogSerializer`:

- Extends `BaseSerializer`
- Model: `Worklog` (imported from `plane.db.models`)
- Fields: `id`, `issue_id`, `member_id`, `project_id`, `workspace_id`, `duration_minutes`, `description`, `logged_date`, `created_at`, `updated_at`
- Read-only: `id`, `issue_id`, `member_id`, `project_id`, `workspace_id`, `created_at`, `updated_at`

The Worklog model lives in `plane.db` but the serializer lives in `plane.hw` because the worklog feature is HW-only. The CE stub will return null for any worklog UI.

Update `apps/api/plane/hw/serializers/__init__.py` to import and export `WorklogSerializer`.

**Verification:**
Run: `python run_tests.py -u -k test_capacity_serializers` from `apps/api/`
Expected: Tests pass (created in Task 9)

**Commit:** `feat(hw): add WorklogSerializer`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Serializer tests

**Verifies:** resource-workload.AC1.1, resource-workload.AC1.2, resource-workload.AC1.5, resource-workload.AC1.6, resource-workload.AC6.1

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_capacity_serializers.py`

**Implementation:**

Create test file following the pattern in `apps/api/plane/tests/unit/hw/test_agent_serializers.py`.

**Testing:**

MemberCapacitySerializer tests:

- AC1.1: Serialize a MemberCapacity instance, verify `capacity_hours` present in output
- AC1.2: Serialize a MemberCapacity with capacity_points set, verify `capacity_points` present
- Validate: Deserialize valid input data, verify `is_valid()` returns True
- Validate: Deserialize input missing `effective_from`, verify `is_valid()` returns False
- Read-only: Verify `workspace_id` and `member_id` cannot be set via deserialization

ProjectMemberAllocationSerializer tests:

- AC1.5: Serialize a ProjectMemberAllocation, verify `max_hours` and `max_points` present
- Validate: Deserialize valid input, verify `is_valid()` returns True

WorklogSerializer tests:

- AC6.1: Serialize a Worklog instance, verify `duration_minutes`, `logged_date`, `description` present
- Read-only: Verify `issue_id`, `member_id`, `project_id` are read-only

**Verification:**
Run: `python run_tests.py -u -k test_capacity_serializers` from `apps/api/`
Expected: All tests pass

**Commit:** `test(hw): add serializer tests for capacity, allocation, and worklog`

<!-- END_TASK_9 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_TASK_10 -->

### Task 10: Django migrations

**Files:**

- Generate: `apps/api/plane/hw/migrations/<next>_capacity_models.py` (auto-generated — number depends on current migration state)
- Generate: `apps/api/plane/db/migrations/<next>_worklog_and_estimate_hours_per_point.py` (auto-generated)

**Implementation:**

Run Django's `makemigrations` to generate migrations for the new models and field additions.

From `apps/api/`:

```bash
python manage.py makemigrations hw --name capacity_models
python manage.py makemigrations db --name worklog_and_estimate_hours_per_point
```

Then apply:

```bash
python manage.py migrate
```

Review the generated migration files to ensure they contain:

- The HW migration (named `*_capacity_models.py`): CreateModel for MemberCapacity, CreateModel for ProjectMemberAllocation, AddConstraint for both unique constraints
- The DB migration (named `*_worklog_and_estimate_hours_per_point.py`): CreateModel for Worklog, AddField for hours_per_point on Estimate

**Verification:**
Run: `python manage.py migrate` from `apps/api/`
Expected: Migrations apply cleanly with no errors

Run: `python manage.py showmigrations hw db | grep -E "(capacity|worklog|estimate)"` from `apps/api/`
Expected: New migrations show as applied [X]

**Commit:** `feat: add migrations for capacity, allocation, worklog models and hours_per_point`

<!-- END_TASK_10 -->

<!-- START_TASK_11 -->

### Task 11: Run full test suite and verify

**Files:** None (verification only)

**Implementation:**

Run the full unit test suite to verify nothing is broken:

```bash
cd apps/api && python run_tests.py -u
```

If any tests fail, investigate and fix before proceeding. All existing tests must continue to pass alongside the new ones.

**Verification:**
Run: `python run_tests.py -u` from `apps/api/`
Expected: All tests pass (existing + new)

Also run linting:

```bash
cd apps/api && ruff check .
cd apps/api && ruff format --check .
```

Expected: No lint or formatting errors

**Commit:** No commit needed — verification only. Fix any issues and amend the relevant previous commit.

<!-- END_TASK_11 -->
