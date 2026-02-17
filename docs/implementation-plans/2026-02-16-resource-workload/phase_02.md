# Resource Workload Implementation Plan — Phase 2

**Goal:** CRUD API endpoints for managing member capacity and project allocation caps, plus settings UI.

**Architecture:** Two Django REST Framework viewsets in plane.hw following the IssueTypeViewSet pattern. Frontend settings pages using the workspace/project settings routing pattern with MobX stores. CE stubs return null.

**Tech Stack:** Django REST Framework, React, MobX, SWR, TailwindCSS

**Scope:** 7 phases from original design (this is phase 2 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC2: Capacity settings UI

- **resource-workload.AC2.1 Success:** Workspace settings page shows member list with current capacity values
- **resource-workload.AC2.2 Success:** Editing a member's capacity creates a new record with today's `effective_from`
- **resource-workload.AC2.3 Success:** Project settings page shows member list with allocation caps for that project
- **resource-workload.AC2.4 Success:** Allocation caps can be set and updated per member per project
- **resource-workload.AC2.5 Failure:** Non-admin users cannot modify capacity or allocation settings (API returns 403)

---

## Testing references

- Contract test directory: `apps/api/plane/tests/contract/hw/`
- Example contract test: `apps/api/plane/tests/contract/hw/test_agent_registration.py`
- Factories: `apps/api/plane/tests/factories.py` — MemberCapacityFactory, ProjectMemberAllocationFactory (added in Phase 1)
- Fixtures: `apps/api/plane/tests/conftest.py` — session_client (admin), api_client, workspace, create_user
- Markers: `@pytest.mark.contract` on class, `@pytest.mark.django_db` on methods
- Run: `python run_tests.py -c` from `apps/api/`

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: MemberCapacity viewset

**Verifies:** resource-workload.AC2.1, resource-workload.AC2.2, resource-workload.AC2.5

**Files:**

- Create: `apps/api/plane/hw/views/capacity.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/views/capacity.py` with `MemberCapacityViewSet` following the exact pattern of `IssueTypeViewSet` in `apps/api/plane/hw/views/issue_type.py`:

- Extends `BaseViewSet` (from `plane.app.views`)
- Uses `MemberCapacitySerializer` from `plane.hw.serializers`
- `get_queryset()` filters by `workspace__slug=self.kwargs.get("slug")` and `member_id=self.kwargs.get("member_id")`, ordered by `-effective_from`, with `select_related("workspace", "member")`
- Methods:
  - `list(self, request, slug, member_id)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")` — returns all capacity records for the member (ordered most recent first)
  - `create(self, request, slug, member_id)` — `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` — creates a new capacity record. Looks up workspace via `Workspace.objects.get(slug=slug)` and member via `User.objects.get(pk=member_id)`. Saves with `workspace=workspace, member=member`. If no `effective_from` in request data, defaults to `date.today()`.
  - `partial_update(self, request, slug, member_id, pk)` — `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` — updates an existing capacity record

Import `ROLE` and `allow_permission` from `plane.app.permissions`. Import `Workspace` from `plane.db.models`. Import `User` via `from django.contrib.auth import get_user_model; User = get_user_model()`.

Update `apps/api/plane/hw/views/__init__.py` to import and export `MemberCapacityViewSet`.

**Verification:**
Run: `python run_tests.py -c -k test_capacity_api` from `apps/api/`
Expected: Tests pass (created in Task 3)

**Commit:** `feat(hw): add MemberCapacity viewset`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: ProjectMemberAllocation viewset

**Verifies:** resource-workload.AC2.3, resource-workload.AC2.4, resource-workload.AC2.5

**Files:**

- Modify: `apps/api/plane/hw/views/capacity.py` (append)
- Modify: `apps/api/plane/hw/views/__init__.py`

**Implementation:**

Add `ProjectMemberAllocationViewSet` to `apps/api/plane/hw/views/capacity.py`:

- Extends `BaseViewSet`
- Uses `ProjectMemberAllocationSerializer`
- `get_queryset()` filters by `project_id=self.kwargs.get("project_id")`, `member_id=self.kwargs.get("member_id")`, and `project__workspace__slug=self.kwargs.get("slug")`, with `select_related("project", "member")`. The workspace scoping is critical — without it, list and partial_update operations could access data from other workspaces if a user knows a project UUID.
- Methods:
  - `list(self, request, slug, project_id, member_id)` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")` — returns allocation record for this member on this project
  - `create(self, request, slug, project_id, member_id)` — `@allow_permission([ROLE.ADMIN], level="PROJECT")` — creates allocation cap. Looks up project via `Project.objects.get(pk=project_id, workspace__slug=slug)`. Saves with `project=project, member=member`.
  - `partial_update(self, request, slug, project_id, member_id, pk)` — `@allow_permission([ROLE.ADMIN], level="PROJECT")` — updates allocation cap

Note: project-level permissions use `level="PROJECT"` in the decorator, which checks `ProjectMember` role.

Update `apps/api/plane/hw/views/__init__.py` to also export `ProjectMemberAllocationViewSet`.

**Verification:**
Run: `python run_tests.py -c -k test_capacity_api` from `apps/api/`
Expected: Tests pass (created in Task 3)

**Commit:** `feat(hw): add ProjectMemberAllocation viewset`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Capacity and allocation API contract tests

**Verifies:** resource-workload.AC2.1, resource-workload.AC2.2, resource-workload.AC2.3, resource-workload.AC2.4, resource-workload.AC2.5

**Files:**

- Create: `apps/api/plane/tests/contract/hw/test_capacity_api.py`

**Implementation:**

Create contract tests following the pattern in `apps/api/plane/tests/contract/hw/test_agent_registration.py`. Use `session_client` fixture (which is admin-authenticated) and `workspace` fixture.

Create a local `member_client` fixture (same pattern as in test_agent_registration.py) that creates a non-admin user with `role=15` (MEMBER) for testing AC2.5 permission failures.

**Testing:**

MemberCapacity API tests (`TestMemberCapacityAPI` with `@pytest.mark.contract`):

- AC2.1: GET list returns capacity records for a member; create a MemberCapacityFactory record first, then GET the endpoint, verify response includes the record
- AC2.2: POST create with `{"capacity_hours": "32.00", "capacity_points": 15}` creates a record; verify response has `effective_from` set to today
- AC2.2: POST create twice with different data for same member creates two records (temporal versioning, not update-in-place)
- AC2.5: POST create with `member_client` (non-admin) returns 403

ProjectMemberAllocation API tests (`TestProjectMemberAllocationAPI`):

- AC2.3: GET list returns allocation for a member on a project; create via factory, then GET, verify response
- AC2.4: POST create with `{"max_hours": "24.00", "max_points": 10}`, verify 201 and persisted
- AC2.4: PATCH update with `{"max_hours": "16.00"}`, verify 200 and updated value
- AC2.5: POST create with member_client (non-admin) returns 403

Use URL helper methods like `get_capacity_url(workspace_slug, member_id)` returning `/api/workspaces/{slug}/members/{member_id}/capacity/`. Verify the URL construction pattern by checking how existing contract tests in `test_agent_registration.py` build URLs (some use `reverse()`, some use raw f-string paths) — follow whichever pattern is established.

**Verification:**
Run: `python run_tests.py -c -k test_capacity_api` from `apps/api/`
Expected: All tests pass

**Commit:** `test(hw): add contract tests for capacity and allocation API endpoints`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->

### Task 4: URL registration for capacity and allocation endpoints

**Files:**

- Create: `apps/api/plane/hw/urls/capacity.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Implementation:**

Create `apps/api/plane/hw/urls/capacity.py` following the pattern in `apps/api/plane/hw/urls/agent.py`:

```python
from django.urls import path

from plane.hw.views import MemberCapacityViewSet, ProjectMemberAllocationViewSet

urlpatterns = [
    # Member capacity CRUD
    path(
        "workspaces/<str:slug>/members/<uuid:member_id>/capacity/",
        MemberCapacityViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-member-capacity",
    ),
    path(
        "workspaces/<str:slug>/members/<uuid:member_id>/capacity/<uuid:pk>/",
        MemberCapacityViewSet.as_view({"patch": "partial_update"}),
        name="workspace-member-capacity-detail",
    ),
    # Project member allocation CRUD
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/members/<uuid:member_id>/allocation/",
        ProjectMemberAllocationViewSet.as_view({"get": "list", "post": "create"}),
        name="project-member-allocation",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/members/<uuid:member_id>/allocation/<uuid:pk>/",
        ProjectMemberAllocationViewSet.as_view({"patch": "partial_update"}),
        name="project-member-allocation-detail",
    ),
]
```

Update `apps/api/plane/hw/urls/__init__.py` to import and spread `capacity_urls`.

**Verification:**
Run: `python run_tests.py -c -k test_capacity_api` from `apps/api/`
Expected: Tests pass (URL resolution works)

**Commit:** `feat(hw): register capacity and allocation URL patterns`

<!-- END_TASK_4 -->

<!-- START_SUBCOMPONENT_B (tasks 5-7) -->

<!-- START_TASK_5 -->

### Task 5: Frontend capacity service

**Files:**

- Create: `packages/services/src/workspace/capacity.service.ts`
- Modify: `packages/services/src/workspace/index.ts`

**Implementation:**

Create `packages/services/src/workspace/capacity.service.ts` following the pattern in `packages/services/src/workspace/member.service.ts`:

- Export `WorkspaceCapacityService` extending `APIService`
- Constructor accepts optional `BASE_URL` parameter following the established codebase pattern: `import { API_BASE_URL } from "@plane/constants";` then `constructor(BASE_URL?: string) { super(BASE_URL || API_BASE_URL); }` — this matches every other service in `packages/services/` (e.g., `WorkspaceMemberService`, `NotificationService`). Do NOT use `@/helpers/common.helper` (app-specific alias unavailable in shared packages) and do NOT hardcode `"/api"` (breaks deployments where `VITE_API_BASE_URL` is configured to a non-standard value)
- Methods:
  - `listMemberCapacity(workspaceSlug: string, memberId: string): Promise<IMemberCapacity[]>` — GET `/api/workspaces/${workspaceSlug}/members/${memberId}/capacity/`
  - `createMemberCapacity(workspaceSlug: string, memberId: string, data: Partial<IMemberCapacity>): Promise<IMemberCapacity>` — POST same endpoint
  - `updateMemberCapacity(workspaceSlug: string, memberId: string, capacityId: string, data: Partial<IMemberCapacity>): Promise<IMemberCapacity>` — PATCH with `/${capacityId}/`
  - `listProjectAllocation(workspaceSlug: string, projectId: string, memberId: string): Promise<IProjectMemberAllocation[]>` — GET `/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${memberId}/allocation/`
  - `createProjectAllocation(workspaceSlug: string, projectId: string, memberId: string, data: Partial<IProjectMemberAllocation>): Promise<IProjectMemberAllocation>` — POST
  - `updateProjectAllocation(workspaceSlug: string, projectId: string, memberId: string, allocationId: string, data: Partial<IProjectMemberAllocation>): Promise<IProjectMemberAllocation>` — PATCH

All methods follow the `.then((response) => response?.data).catch((error) => { throw error?.response?.data; })` pattern.

Export from `packages/services/src/workspace/index.ts`.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add WorkspaceCapacityService for capacity and allocation API`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Frontend types for capacity and allocation

**Files:**

- Create: `packages/types/src/workload.ts`
- Modify: `packages/types/src/index.ts`

**Implementation:**

Create `packages/types/src/workload.ts` with TypeScript interfaces:

```typescript
export interface IMemberCapacity {
  id: string;
  workspace_id: string;
  member_id: string;
  capacity_hours: string; // decimal from API comes as string
  capacity_points: number | null;
  effective_from: string; // ISO date
  created_at: string;
  updated_at: string;
}

export interface IProjectMemberAllocation {
  id: string;
  project_id: string;
  member_id: string;
  max_hours: string; // decimal from API comes as string
  max_points: number | null;
  created_at: string;
  updated_at: string;
}
```

Export from `packages/types/src/index.ts`.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add TypeScript types for capacity and allocation`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Workspace capacity settings UI (HW + CE stub)

**Verifies:** resource-workload.AC2.1, resource-workload.AC2.2

**Files:**

- Create: `apps/web/hw/components/workspace/settings/member-capacity-settings.tsx`
- Create: `apps/web/ce/components/workspace/settings/member-capacity-settings.tsx`

**Implementation:**

**HW component** (`apps/web/hw/components/workspace/settings/member-capacity-settings.tsx`):

An `observer` component that receives `workspaceSlug` as prop:

- Uses SWR to fetch workspace members (via existing `useMember()` hook's `fetchWorkspaceMembers`)
- For each member, fetches their active capacity (latest record) via the capacity service
- Renders a table with columns: member name, capacity hours/week, capacity points/cycle, effective from date
- Each row has an "Edit" button (visible only to admins, check with `useUserPermissions().allowPermissions`)
- Edit opens an inline form (or modal) with inputs for `capacity_hours` and `capacity_points`
- On save, POSTs to create a new capacity record with today's `effective_from` (AC2.2 — always creates new, never patches existing for temporal versioning)
- Uses `@plane/propel` components (Button, Input) and TailwindCSS for styling
- Follows the pattern of `WorkspaceMembersList` in `apps/web/core/components/workspace/settings/members-list.tsx`

**CE stub** (`apps/web/ce/components/workspace/settings/member-capacity-settings.tsx`):

```typescript
export const MemberCapacitySettings = () => null;
```

Both files export `MemberCapacitySettings` as the component name.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add workspace member capacity settings UI with CE stub`

<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_8 -->

### Task 8: Project allocation settings UI (HW + CE stub)

**Verifies:** resource-workload.AC2.3, resource-workload.AC2.4

**Files:**

- Create: `apps/web/hw/components/projects/settings/member-allocation-settings.tsx`
- Create: `apps/web/ce/components/projects/settings/member-allocation-settings.tsx`

**Implementation:**

**HW component** (`apps/web/hw/components/projects/settings/member-allocation-settings.tsx`):

An `observer` component that receives `workspaceSlug` and `projectId` as props:

- Fetches project members (via existing project member hooks)
- For each member, fetches their allocation cap on this project via the capacity service
- Renders a table with columns: member name, max hours/week, max points/cycle
- Each row has an "Edit" button (admin only via `useUserPermissions()`)
- Edit opens inline form for `max_hours` and `max_points`
- On save, POSTs to create if no allocation exists, PATCHes to update if one does (allocation is upsert-style, not temporal)
- Uses `@plane/propel` components and TailwindCSS

**CE stub** (`apps/web/ce/components/projects/settings/member-allocation-settings.tsx`):

```typescript
export const MemberAllocationSettings = () => null;
```

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add project member allocation settings UI with CE stub`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Integrate capacity settings into workspace settings page

**Files:**

- Create: `apps/web/hw/components/workspace/settings/index.ts` (barrel export)
- Create: `apps/web/ce/components/workspace/settings/index.ts` (barrel export)

**Implementation:**

The workspace members page at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx` already renders `WorkspaceMembersList`. The capacity settings component should be rendered alongside it.

Import `MemberCapacitySettings` from `@/plane-web/components/workspace/settings` and render it below the members list. The `@/plane-web/` alias resolves to either `hw/` or `ce/` at build time — in HW builds it renders the capacity table, in CE builds it renders null.

Create barrel export files for both `hw` and `ce` workspace settings directories.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: integrate capacity settings into workspace settings page`

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->

### Task 10: Integrate allocation settings into project settings page

**Files:**

- Create: `apps/web/hw/components/projects/settings/index.ts` (barrel export)
- Create: `apps/web/ce/components/projects/settings/index.ts` (barrel export)

**Implementation:**

The project settings page at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/page.tsx` renders project details form and control section. Add `MemberAllocationSettings` below the existing content.

Import from `@/plane-web/components/projects/settings`. HW builds render the allocation table, CE builds render null.

Create barrel export files for both `hw` and `ce` project settings directories.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: integrate allocation settings into project settings page`

<!-- END_TASK_10 -->

<!-- START_TASK_11 -->

### Task 11: Run full test suite and lint

**Files:** None (verification only)

**Implementation:**

Run backend tests and frontend type checks:

```bash
cd apps/api && python run_tests.py -u -c
pnpm check:types
pnpm check:lint
```

Fix any issues before proceeding.

**Verification:**
Run: `python run_tests.py -u -c` from `apps/api/`
Expected: All tests pass

Run: `pnpm check` from repo root
Expected: No type or lint errors

**Commit:** No commit — verification only. Fix issues by amending relevant commits.

<!-- END_TASK_11 -->
