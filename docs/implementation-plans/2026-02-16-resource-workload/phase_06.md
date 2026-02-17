# Resource Workload Implementation Plan — Phase 6

**Goal:** Worklog CRUD API and fill in existing UI stubs for time tracking.

**Architecture:** Django REST viewset for worklog CRUD in plane.hw. Frontend service for API calls. Fill in the three existing HW stub components (IssueWorklogProperty, IssueActivityWorklog, IssueActivityWorklogCreateButton) — they are already wired into the sidebar and activity feed, just returning empty fragments. Add time tracking toggle to project settings features list. Gate worklog creation on `project.is_time_tracking_enabled` (field already exists on the model).

**Tech Stack:** Django REST Framework, React, MobX, SWR, TailwindCSS

**Scope:** 7 phases from original design (this is phase 6 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC6: Worklog CRUD and UI

- **resource-workload.AC6.1 Success:** Worklogs can be created on an issue with duration and logged date
- **resource-workload.AC6.2 Success:** Issue detail sidebar shows total time logged via `IssueWorklogProperty`
- **resource-workload.AC6.3 Success:** Activity feed shows worklog entries via `IssueActivityWorklog`
- **resource-workload.AC6.4 Success:** Time tracking toggle appears in project features settings
- **resource-workload.AC6.5 Success:** Worklog creation is gated by `project.is_time_tracking_enabled`
- **resource-workload.AC6.6 Failure:** Creating a worklog on a project with time tracking disabled returns 403
- **resource-workload.AC6.7 Edge:** Deleting a worklog updates the aggregated total in the sidebar

---

## Key codebase references

- Existing HW stubs (already wired in):
  - `apps/web/hw/components/issues/worklog/property/root.tsx` — `IssueWorklogProperty`, returns `<></>`
  - `apps/web/hw/components/issues/worklog/activity/root.tsx` — `IssueActivityWorklog`, returns `<></>`
  - `apps/web/hw/components/issues/worklog/activity/worklog-create-button.tsx` — `IssueActivityWorklogCreateButton`, returns `<></>`
- CE stubs (matching interfaces): `apps/web/ce/components/issues/worklog/`
- Sidebar integration: `apps/web/core/components/issues/issue-detail/sidebar.tsx:262-267`
- Activity feed integration: `apps/web/core/components/issues/issue-detail/issue-activity/activity-comment-root.tsx:91-99`
- Create button integration: `apps/web/core/components/issues/issue-detail/issue-activity/root.tsx:113-120`
- Project model: `apps/api/plane/db/models/project.py:98` — `is_time_tracking_enabled` already exists
- Project features list: `apps/web/core/components/project/settings/features-list.tsx:30-76`
- Prop contracts:
  - `IssueWorklogProperty`: `{ workspaceSlug, projectId, issueId, disabled }`
  - `IssueActivityWorklog`: `{ workspaceSlug, projectId, issueId, activityComment: TIssueActivityComment, ends?: "top" | "bottom" }`
  - `IssueActivityWorklogCreateButton`: `{ workspaceSlug, projectId, issueId, disabled }`

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Worklog viewset

**Verifies:** resource-workload.AC6.1, resource-workload.AC6.5, resource-workload.AC6.6

**Files:**

- Create: `apps/api/plane/hw/views/worklog.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/views/worklog.py` with `WorklogViewSet`:

- Extends `BaseViewSet` (from `plane.app.views`)
- Uses `WorklogSerializer` from `plane.hw.serializers`
- `get_queryset()`: filters by `project_id=self.kwargs.get("project_id")`, `issue_id=self.kwargs.get("issue_id")`, and `project__workspace__slug=self.kwargs.get("slug")`, ordered by `-logged_date`, with `select_related("issue", "member", "project")`. The workspace scoping is critical — without it, `list`, `partial_update`, and `destroy` operations could access data from other workspaces if a user knows a project UUID. This matches the same security pattern applied to `ProjectMemberAllocationViewSet` in Phase 2.
- Methods:
  - `list(self, request, slug, project_id, issue_id)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` — returns worklogs for this issue
  - `create(self, request, slug, project_id, issue_id)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")`:
    - Check `project.is_time_tracking_enabled` — if `False`, return 403 (AC6.5, AC6.6)
    - Get project, issue, validate data
    - Save with `issue=issue, member=request.user, project=project`
    - Return 201
  - `partial_update(self, request, slug, project_id, issue_id, pk)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` — only the worklog creator or admin can update
  - `destroy(self, request, slug, project_id, issue_id, pk)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` — only the worklog creator or admin can delete

Update `apps/api/plane/hw/views/__init__.py` to export `WorklogViewSet`.

**Verification:**
Run: `python run_tests.py -c -k test_worklog_api` from `apps/api/`
Expected: Tests pass (created in Task 3)

**Commit:** `feat(hw): add WorklogViewSet with time tracking gate`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Worklog URL registration

**Files:**

- Create: `apps/api/plane/hw/urls/worklog.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/urls/worklog.py`:

```python
from django.urls import path

from plane.hw.views import WorklogViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/",
        WorklogViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-worklogs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/",
        WorklogViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-worklog-detail",
    ),
]
```

Update `apps/api/plane/hw/urls/__init__.py` to import and spread `worklog_urls`.

**Verification:**
Run: `python run_tests.py -c -k test_worklog_api` from `apps/api/`
Expected: URL resolves correctly

**Commit:** `feat(hw): register worklog URL patterns`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Worklog API contract tests

**Verifies:** resource-workload.AC6.1, resource-workload.AC6.5, resource-workload.AC6.6

**Files:**

- Create: `apps/api/plane/tests/contract/hw/test_worklog_api.py`

**Implementation:**

Create contract tests following `apps/api/plane/tests/contract/hw/test_agent_registration.py` pattern.

**Testing:**

`TestWorklogAPI` with `@pytest.mark.contract`:

- AC6.1: POST create worklog with `{"duration_minutes": 90, "logged_date": "2026-02-16", "description": "Implemented feature"}` → 201 with correct data
- AC6.1: GET list worklogs for an issue → 200 with created worklog
- AC6.5: Enable `is_time_tracking_enabled` on project, create worklog → succeeds (201)
- AC6.6: Disable `is_time_tracking_enabled`, POST create worklog → 403
- PATCH update worklog duration → 200 with updated value
- DELETE worklog → 204
- Non-project-member → 403

Set up test fixtures:

- Create project with `is_time_tracking_enabled=True`
- Create issue on that project
- Use `session_client` (admin) for success cases
- Create separate non-member client for 403 case

**Verification:**
Run: `python run_tests.py -c -k test_worklog_api` from `apps/api/`
Expected: All tests pass

**Commit:** `test(hw): add contract tests for worklog API`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->

### Task 4: Frontend worklog service

**Files:**

- Create: `packages/services/src/issue/worklog.service.ts`
- Modify: `packages/services/src/issue/index.ts`

**Implementation:**

Create `packages/services/src/issue/worklog.service.ts`:

```typescript
import { APIService } from "../api.service";
import { API_BASE_URL } from "@plane/constants";
import type { IWorklog } from "@plane/types";

export class WorklogService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async listWorklogs(workspaceSlug: string, projectId: string, issueId: string): Promise<IWorklog[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { duration_minutes: number; logged_date: string; description?: string }
  ): Promise<IWorklog> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorklog(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<{ duration_minutes: number; logged_date: string; description: string }>
  ): Promise<IWorklog> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklogId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorklog(workspaceSlug: string, projectId: string, issueId: string, worklogId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/${worklogId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
```

Add `IWorklog` type to `packages/types/src/workload.ts`:

```typescript
export interface IWorklog {
  id: string;
  issue_id: string;
  member_id: string;
  project_id: string;
  workspace_id: string;
  duration_minutes: number;
  description: string;
  logged_date: string;
  created_at: string;
  updated_at: string;
}
```

Export from package index files.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add WorklogService and IWorklog type`

<!-- END_TASK_4 -->

<!-- START_SUBCOMPONENT_B (tasks 5-7) -->

<!-- START_TASK_5 -->

### Task 5: Fill in IssueWorklogProperty stub

**Verifies:** resource-workload.AC6.2, resource-workload.AC6.7

**Files:**

- Modify: `apps/web/hw/components/issues/worklog/property/root.tsx`

**Implementation:**

Fill in the existing `IssueWorklogProperty` component (currently returns `<></>`). Props are already defined: `{ workspaceSlug, projectId, issueId, disabled }`. The existing stub imports `type { FC }` from React but doesn't use it — either type the component as `FC<Props>` or remove the unused import to avoid lint warnings. Apply the same treatment to `activity/root.tsx` and `activity/worklog-create-button.tsx`.

The component should:

- Use SWR to fetch worklogs for the issue via `WorklogService.listWorklogs()`
- Compute total duration by summing `duration_minutes` across all worklogs
- Display formatted total (e.g., "12h 30m") in the sidebar property area
- If no worklogs exist, show "No time logged" or similar
- Reactive: when worklogs are created/deleted, the SWR key should revalidate (AC6.7)
- Format helper: `function formatDuration(minutes: number): string` — converts minutes to "Xh Ym" format

Follow the visual style of adjacent sidebar properties (check how estimate or labels are displayed).

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): implement IssueWorklogProperty to show total logged time`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Fill in IssueActivityWorklog stub

**Verifies:** resource-workload.AC6.3

**Files:**

- Modify: `apps/web/hw/components/issues/worklog/activity/root.tsx`

**Implementation:**

Fill in the existing `IssueActivityWorklog` component. Props: `{ workspaceSlug, projectId, issueId, activityComment, ends }`.

The `activityComment` is of type `TIssueActivityComment` with `activity_type === "WORKLOG"`. The component should:

- Display the worklog entry in the activity feed timeline
- Show: member who logged time, duration, logged date, description (if any)
- Use the `ends` prop to style the timeline connector (same as other activity components)
- Follow the visual pattern of existing activity entries in the feed (check adjacent component implementations for timeline dot + content layout)

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): implement IssueActivityWorklog for activity feed entries`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Fill in IssueActivityWorklogCreateButton stub

**Verifies:** resource-workload.AC6.1, resource-workload.AC6.5

**Files:**

- Modify: `apps/web/hw/components/issues/worklog/activity/worklog-create-button.tsx`

**Implementation:**

Fill in the existing `IssueActivityWorklogCreateButton` component. Props: `{ workspaceSlug, projectId, issueId, disabled }`.

The component should:

- Render a button/icon that opens a time entry form (modal or inline)
- The form has: duration input (hours + minutes), date picker (defaults to today), optional description
- On submit, calls `WorklogService.createWorklog()` with the form data
- On success, trigger SWR revalidation so `IssueWorklogProperty` updates
- Show toast on success/error
- When `disabled` is true, the button is visually disabled
- Should check `project.is_time_tracking_enabled` and not render if disabled (AC6.5)

Use `@plane/propel` components (Button, Modal, Input) and existing toast patterns.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): implement IssueActivityWorklogCreateButton with time entry form`

<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_8 -->

### Task 8: Verify ProjectSerializer and add time tracking toggle

**Verifies:** resource-workload.AC6.4, resource-workload.AC6.5

**Files:**

- Verify: `apps/api/plane/app/serializers/project.py` — confirm `is_time_tracking_enabled` is in the `ProjectSerializer` fields list
- Modify: `apps/web/core/components/project/settings/features-list.tsx:30-76`

**Implementation:**

**Step 1: Verify serializer field exposure.** Before adding the toggle, verify that `is_time_tracking_enabled` is included in the `ProjectSerializer.Meta.fields` list in `apps/api/plane/app/serializers/project.py`. If the field is NOT in the serializer, add it — otherwise the PATCH request from the toggle handler would silently ignore the field and the toggle would never persist. Also add a contract test in the worklog API tests (Task 3) that PATCHes the project with `{"is_time_tracking_enabled": true}` via the existing project update endpoint and verifies the field persists.

**Step 2: Add toggle.** Add a time tracking entry to the `PROJECT_FEATURES_LIST` object following the existing pattern:

```typescript
timeTracking: {
  key: "timeTracking",
  property: "is_time_tracking_enabled",
  title: "Time tracking",
  description: "Log time spent on issues and track planned vs actual effort.",
  icon: <ClockIcon className="size-4 flex-shrink-0 rotate-90 text-yellow-500" />,
  isPro: false,
  isEnabled: true,
},
```

Use an appropriate icon from `@plane/propel/icons` or `lucide-react` (find what's available by checking existing icon imports in the file).

The existing toggle handler (`handleSubmit`, around lines 86-109) already calls `updateProject()` with the toggled property — no additional handler code needed.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds. Time tracking toggle appears in project settings features page.

**Commit:** `feat: add time tracking toggle to project features settings`

**Commit:** `feat: verify ProjectSerializer field and add time tracking toggle`

<!-- END_TASK_8 -->

<!-- START_TASK_8b -->

### Task 8b: Add planned-vs-actual toggle to workload view

**Verifies:** resource-workload.AC6.2 (worklogs surface in allocation context)

**Files:**

- Modify: `apps/web/hw/components/issues/issue-layouts/workload/workload-layout.tsx` (created in Phase 4 Task 4)

**Implementation:**

The workload API response (Phase 3) already includes `actual_hours` per member (returns 0 until worklogs are logged). Now that worklogs exist (this phase), add a toggle to the workload layout header that switches between planned and actual data:

- Add a "Planned / Actual" segmented control or toggle to the WorkloadLayout header bar (alongside granularity and scope selector from Phase 4)
- Store the mode in WorkloadStore as `displayMode: "planned" | "actual"` (add observable + action)
- When `"planned"`: allocation bars use `allocation.total_hours` (existing behaviour)
- When `"actual"`: allocation bars use `allocation.actual_hours` from the API response
- The bar colour logic (under/optimal/near/over) applies the same thresholds to whichever value is active
- Default to `"planned"` — `"actual"` only makes sense once worklogs have been logged

No backend changes needed — the API contract already supports this.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add planned-vs-actual toggle to workload layout`

<!-- END_TASK_8b -->

<!-- START_TASK_9 -->

### Task 9: Add worklog activity filter type

**Verifies:** resource-workload.AC6.3

**Files:**

- Investigate and modify: The file exporting `ACTIVITY_FILTER_TYPE_OPTIONS` or `TActivityFilters` (likely in `@plane/constants` — grep for `ACTIVITY_FILTER_TYPE_OPTIONS`)
- Investigate and modify: `apps/web/hw/components/issues/worklog/activity/filter-root.tsx` and CE counterpart (if filter integration is needed there)

**Implementation:**

The existing `filter-root.tsx` in the worklog activity directory provides activity type filtering via `ACTIVITY_FILTER_TYPE_OPTIONS`. When worklog entries are created, they need to appear as a distinct activity type that users can filter on.

1. Find where `ACTIVITY_FILTER_TYPE_OPTIONS` is defined (grep `@plane/constants` or the relevant constants file)
2. Add a `"WORKLOG"` entry to the activity filter type options
3. **Add IssueActivity emission to the worklog viewset** (Task 1's `WorklogViewSet`): In `create()`, after saving the worklog, create an `IssueActivity` record with `field="worklog"`, `verb="created"`, `new_value=str(worklog.duration_minutes)`, `issue_id=issue.id`, `project_id=project.id`, `workspace_id=project.workspace_id`, `actor=request.user`. In `destroy()`, create an `IssueActivity` with `field="worklog"`, `verb="deleted"`, `old_value=str(worklog.duration_minutes)`. Follow the pattern used by other activity-emitting views in the codebase — check how `IssueActivity.objects.create(...)` is called in `plane.app.views` or whether a centralized `issue_activity` utility function is used instead. Use whichever pattern is established.
4. Ensure `filter-root.tsx` includes the worklog filter option

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add worklog activity filter type for activity feed filtering`

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->

### Task 10: Run full test suite and lint

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

<!-- END_TASK_10 -->
