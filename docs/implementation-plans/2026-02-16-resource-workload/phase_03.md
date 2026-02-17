# Resource Workload Implementation Plan — Phase 3

**Goal:** Backend aggregation endpoint that computes per-member allocation across projects for a given date range.

**Architecture:** A single GET endpoint in plane.hw that joins Issue → IssueAssignee → EstimatePoint → MemberCapacity via Django ORM. Multi-assignee issues split effort evenly. Returns pre-aggregated data with utilisation percentages and status classification. Frontend service consumes the endpoint.

**Tech Stack:** Django 4.2, Django ORM (Sum, Cast, FloatField, Subquery, Count), Django REST Framework

**Scope:** 7 phases from original design (this is phase 3 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC3: Allocation calculation

- **resource-workload.AC3.1 Success:** Workload endpoint returns per-member allocation aggregated across projects for a date range
- **resource-workload.AC3.2 Success:** Multi-assignee issues split effort evenly (5-point issue, 2 assignees = 2.5 each)
- **resource-workload.AC3.3 Success:** Utilisation percentage is `total_allocated / capacity * 100`
- **resource-workload.AC3.4 Success:** Status thresholds: under (<60%), optimal (60–80%), near (80–100%), over (>100%)
- **resource-workload.AC3.5 Success:** Response includes per-project breakdown with allocated hours/points and issue count
- **resource-workload.AC3.6 Success:** `hours_per_point` conversion applied when aggregating across mixed-unit projects
- **resource-workload.AC3.7 Edge:** Issues without estimates are excluded from allocation calculation (not treated as 0)
- **resource-workload.AC3.8 Edge:** Member with assignments but no capacity record returns allocation data with null utilisation

---

## Testing references

- Contract test directory: `apps/api/plane/tests/contract/hw/`
- Factories: `apps/api/plane/tests/factories.py` — MemberCapacityFactory, ProjectMemberAllocationFactory, IssueFactory, EstimateFactory, WorklogFactory (from Phase 1)
- Key model patterns:
  - `EstimatePoint.value` is CharField — must `Cast("estimate_point__value", FloatField())` for aggregation
  - `IssueAssignee` is through-table at `apps/api/plane/db/models/issue.py:336-359`
  - Module estimate pattern at `apps/api/plane/app/views/module/base.py:145-200`
- Run: `python run_tests.py -c` from `apps/api/`

---

<!-- START_SUBCOMPONENT_A (tasks 1-4) -->

<!-- START_TASK_1 -->

### Task 1: Workload aggregation helper

**Files:**

- Create: `apps/api/plane/hw/helpers/__init__.py`
- Create: `apps/api/plane/hw/helpers/workload.py`

**Implementation:**

Create `apps/api/plane/hw/helpers/workload.py` with a `compute_member_workload()` function that encapsulates the aggregation logic, keeping it testable independently from the view.

The function takes:

- `workspace_slug: str`
- `start_date: date`
- `end_date: date`
- `project_id: str | None = None` (optional filter)
- `member_ids: list[str] | None = None` (optional filter)

And returns a list of dicts matching the `WorkloadResponse.members` shape from the design.

**Logic:**

1. **Get issues in date range**: Query `Issue.issue_objects` (the manager that filters out triage/archived/draft) filtered by:
   - `workspace__slug=workspace_slug`
   - `start_date__lte=end_date` and `target_date__gte=start_date` (issue overlaps the date range)
   - Optional: `project_id=project_id`
   - `estimate_point__isnull=False` (AC3.7: exclude issues without estimates)
   - Filter to issues whose `estimate_point__value` is numeric: use `estimate_point__value__regex=r'^\d+\.?\d*$'` to ensure only castable values are included. This handles all estimate types (points, time, categories) correctly — category estimates with non-numeric values like "Small" or "Medium" are excluded, while numeric-valued estimates of any type participate in aggregation. This avoids a `DataError` from `Cast()` on non-numeric strings and correctly includes category estimates that have `hours_per_point` set (AC3.6).

2. **Join through IssueAssignee**: For each issue, get all assignees via the `issue_assignee` relation. Count assignees per issue for splitting.

3. **Compute per-member allocation**: For each unique (member, project) pair:
   - Sum `Cast("estimate_point__value", FloatField())` divided by assignee count per issue
   - This gives allocated points per member per project
   - If the project's estimate has `hours_per_point` set, multiply to get allocated hours (AC3.6). This conversion applies regardless of estimate type — if a category-based estimate has `hours_per_point=4.0` and a numeric value of `"5"`, the allocated hours are 20.0.
   - Count distinct issues per member per project

4. **Get capacity**: For each member, call `MemberCapacity.get_active(workspace_id, member_id)` to get their current capacity.

5. **Compute utilisation**:
   - `utilisation_pct = total_allocated_hours / capacity_hours * 100` (AC3.3)
   - If capacity is None, set `utilisation_pct = None` (AC3.8)

6. **Classify status** (AC3.4):
   - `None` → no status (no capacity record)
   - `< 60` → `"under"`
   - `60–80` → `"optimal"`
   - `80–100` → `"near"`
   - `> 100` → `"over"`

The aggregation approach: use a raw queryset that annotates per-issue assignee count via a `Subquery`, then groups by `(assignee_id, project_id)` with `Sum` of `value / assignee_count`. Follow the exact `Sum(Cast(..., FloatField()))` pattern from `apps/api/plane/app/views/module/base.py:153`.

Create empty `apps/api/plane/hw/helpers/__init__.py`.

**Verification:**
Run: `python run_tests.py -u -k test_workload_aggregation` from `apps/api/`
Expected: Tests pass (created in Task 3)

**Commit:** `feat(hw): add workload aggregation helper`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Workload viewset

**Verifies:** resource-workload.AC3.1, resource-workload.AC3.5

**Files:**

- Create: `apps/api/plane/hw/views/workload.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/views/workload.py` with `WorkloadViewSet`:

- Extends `BaseViewSet` (from `plane.app.views`)
- Single method: `list(self, request, slug)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")`
- Parses query params:
  - `start_date` and `end_date` (required, ISO format strings, parse with `datetime.date.fromisoformat()`)
  - `project_id` (optional UUID)
  - `member_ids` (optional comma-separated UUIDs)
- Calls `compute_member_workload()` from the helper
- Returns `Response({"members": results}, status=status.HTTP_200_OK)`
- Validates date params: if missing or malformed, returns 400

Update `apps/api/plane/hw/views/__init__.py` to export `WorkloadViewSet`.

**Verification:**
Run: `python run_tests.py -c -k test_workload_api` from `apps/api/`
Expected: Tests pass (created in Task 3)

**Commit:** `feat(hw): add workload aggregation viewset`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Workload aggregation tests

**Verifies:** resource-workload.AC3.1, resource-workload.AC3.2, resource-workload.AC3.3, resource-workload.AC3.4, resource-workload.AC3.5, resource-workload.AC3.6, resource-workload.AC3.7, resource-workload.AC3.8

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_workload_aggregation.py`
- Create: `apps/api/plane/tests/contract/hw/test_workload_api.py`
- Modify: `apps/api/plane/tests/factories.py`

**Implementation:**

Add an `EstimatePointFactory` to `apps/api/plane/tests/factories.py`:

```python
from plane.db.models import EstimatePoint

class EstimatePointFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EstimatePoint

    id = factory.LazyFunction(uuid4)
    estimate = factory.SubFactory(EstimateFactory)
    project = factory.SelfAttribute("estimate.project")
    workspace = factory.SelfAttribute("estimate.workspace")
    key = factory.Sequence(lambda n: n)
    value = "5"
    created_by = factory.SelfAttribute("estimate.created_by")
    updated_by = factory.SelfAttribute("estimate.created_by")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

Also add an `IssueAssigneeFactory`:

```python
from plane.db.models import IssueAssignee

class IssueAssigneeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IssueAssignee

    id = factory.LazyFunction(uuid4)
    issue = factory.SubFactory(IssueFactory)
    assignee = factory.SubFactory(UserFactory)
    project = factory.SelfAttribute("issue.project")
    workspace = factory.SelfAttribute("issue.workspace")
    created_by = factory.SelfAttribute("issue.created_by")
    updated_by = factory.SelfAttribute("issue.created_by")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

**Testing:**

Unit tests for `compute_member_workload()` (`test_workload_aggregation.py`, `@pytest.mark.unit`):

- AC3.1: Create issues assigned to two members across two projects, call compute_member_workload, verify response has entries for both members with allocation data
- AC3.2: Create a 5-point issue with 2 assignees, verify each gets 2.5 points allocated
- AC3.3: Member with capacity_hours=40 and 20 hours allocated → verify utilisation_pct=50.0
- AC3.4: Test all four thresholds — create scenarios yielding under/optimal/near/over status
- AC3.5: Verify response includes by_project breakdown with project_id, allocated_hours, allocated_points, issue_count
- AC3.6: Create an estimate with hours_per_point=4.0 and a 5-point issue, verify allocated_hours = 20.0 (5 \* 4)
- AC3.7: Create an issue without an estimate_point, verify it's excluded from allocation
- AC3.8: Create a member with assignments but no MemberCapacity record, verify utilisation_pct is None and allocation data still returned

Contract tests for the API endpoint (`test_workload_api.py`, `@pytest.mark.contract`):

- GET /api/workspaces/{slug}/workload/?start_date=...&end_date=... returns 200 with correct shape
- Missing date params returns 400
- Non-workspace-member returns 403
- Response matches expected per-member allocation structure

**Verification:**
Run: `python run_tests.py -u -k test_workload_aggregation` from `apps/api/`
Run: `python run_tests.py -c -k test_workload_api` from `apps/api/`
Expected: All tests pass

**Commit:** `test(hw): add unit and contract tests for workload aggregation`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Workload URL registration

**Files:**

- Create: `apps/api/plane/hw/urls/workload.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/urls/workload.py`:

```python
from django.urls import path

from plane.hw.views import WorkloadViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/workload/",
        WorkloadViewSet.as_view({"get": "list"}),
        name="workspace-workload",
    ),
]
```

Update `apps/api/plane/hw/urls/__init__.py` to import and spread `workload_urls`.

**Verification:**
Run: `python run_tests.py -c -k test_workload_api` from `apps/api/`
Expected: URL resolves correctly, tests pass

**Commit:** `feat(hw): register workload URL pattern`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4b -->

### Task 4b: Add response caching to workload endpoint

**Files:**

- Modify: `apps/api/plane/hw/views/workload.py`

**Implementation:**

The workload aggregation query is expensive — it joins across issues, assignees, estimates, and capacities for all projects in a workspace. The design specifies a 30-second cache TTL since allocation data doesn't change on every page load.

**Do NOT use `cache_page` decorator.** The `cache_page` decorator wraps the entire view including permission checks — on a cache hit, the cached response is returned before `@allow_permission` runs, bypassing authentication entirely. The only existing `cache_page` usage in the codebase (`apps/api/plane/app/views/timezone/base.py`) applies to an `AllowAny` endpoint. There is no precedent for `cache_page` on permission-gated viewsets.

Instead, use manual caching with `django.core.cache` inside the view method, after permission checks have already passed:

```python
from django.core.cache import cache

class WorkloadViewSet(BaseViewSet):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        cache_key = f"workload:{slug}:{request.query_params.urlencode()}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        results = compute_member_workload(
            workspace_slug=slug,
            start_date=start_date,
            end_date=end_date,
            project_id=project_id,
            member_ids=member_ids,
        )
        response_data = {"members": results}
        cache.set(cache_key, response_data, timeout=30)
        return Response(response_data)
```

This ensures `@allow_permission` always runs before any data is returned. The cache key includes the workspace slug and all query params, so different filter combinations get separate cache entries.

**Verification:**
Run: `python run_tests.py -c -k test_workload_api` from `apps/api/`
Expected: Tests still pass (caching is transparent to the API contract)

**Commit:** `feat(hw): add 30s response cache to workload aggregation endpoint`

<!-- END_TASK_4b -->

<!-- START_TASK_5 -->

### Task 5: Frontend workload service

**Files:**

- Create: `packages/services/src/workspace/workload.service.ts`
- Modify: `packages/services/src/workspace/index.ts`

**Implementation:**

Create `packages/services/src/workspace/workload.service.ts` following the APIService pattern:

```typescript
import { APIService } from "../api.service";
import { API_BASE_URL } from "@plane/constants";
import type { IWorkloadResponse, TWorkloadParams } from "@plane/types";

export class WorkloadService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async getWorkload(workspaceSlug: string, params: TWorkloadParams): Promise<IWorkloadResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("start_date", params.start_date);
    queryParams.set("end_date", params.end_date);
    if (params.project_id) queryParams.set("project_id", params.project_id);
    if (params.member_ids) queryParams.set("member_ids", params.member_ids.join(","));

    return this.get(`/api/workspaces/${workspaceSlug}/workload/?${queryParams.toString()}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
```

Add the response and params types to `packages/types/src/workload.ts` (created in Phase 2):

```typescript
export type TWorkloadParams = {
  start_date: string;
  end_date: string;
  project_id?: string;
  member_ids?: string[];
};

export type TUtilisationStatus = "under" | "optimal" | "near" | "over";

export interface IWorkloadMember {
  member_id: string;
  capacity: {
    hours_per_week: number;
    points_per_cycle: number | null;
  };
  allocation: {
    total_hours: number;
    total_points: number;
    utilisation_pct: number | null;
    actual_hours: number;
    status: TUtilisationStatus | null;
  };
  by_project: Array<{
    project_id: string;
    project_name: string;
    allocated_hours: number;
    allocated_points: number;
    max_hours: number | null;
    issue_count: number;
  }>;
}

export interface IWorkloadResponse {
  members: IWorkloadMember[];
}
```

Export from `packages/services/src/workspace/index.ts` and `packages/types/src/index.ts`.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add WorkloadService and response types`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Run full test suite and lint

**Files:** None (verification only)

**Implementation:**

```bash
cd apps/api && python run_tests.py -u -c
pnpm check:types
pnpm check:lint
```

**Verification:**
Expected: All tests pass, no type or lint errors

**Commit:** No commit — verification only.

<!-- END_TASK_6 -->
