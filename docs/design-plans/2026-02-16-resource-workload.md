# Resource workload and capacity tracking design

## Summary

Resource workload and capacity tracking extends Plane's project management capabilities with a first-class understanding of how much work each team member can take on and how much they are currently allocated. The feature is built in two layers: a backend aggregation engine that joins issues, assignees, and estimates across projects to compute per-member utilisation, and a new frontend workload layout that renders those results as a colour-coded timeline analogous to the resource views in tools like Monday.com or Jira's Planner. The backend handles the expensive cross-project query once and returns pre-aggregated data; the frontend consumes that data both in the dedicated view and as reactive enrichment of the existing Gantt chart.

The implementation follows the repository's HW/CE overlay pattern: production capabilities live in `plane.hw` (backend) and `apps/web/hw/` (frontend), while community-edition stubs in `apps/web/ce/` satisfy the same interfaces with no-op implementations, ensuring CE builds compile cleanly without the feature. Data is introduced in seven incremental phases — models and migrations first, then CRUD endpoints, then the aggregation engine, then the workload view, then Gantt enrichment, then worklog time tracking, and finally CPM-aware levelling suggestions as a stretch goal. Temporal versioning on the `MemberCapacity` model (an `effective_from` date rather than in-place updates) is the one structural pattern introduced that has no existing precedent in the codebase.

## Definition of Done

When workspace members have configurable capacity and projects have per-member allocation caps, a dedicated workload view shows per-member allocation with overallocation detection, and the worklog data model is implemented to enable future planned-vs-actual tracking.

Specifically:

1. **Capacity model** — workspace members have configurable capacity (hours/week or points/cycle depending on project estimate type), and projects have per-member allocation caps. The system knows how much work each person can take on globally and per-project.

2. **Workload view** — a dedicated view (alongside Gantt/Board/Spreadsheet) showing per-member allocation across a time period (cycle or date range), with colour-coded overallocation indicators (green/yellow/red). PMs can see at a glance who's overloaded and who has room.

3. **Allocation calculation** — for each member in a cycle/date range, the system aggregates assigned issue effort (from estimate points or time estimates depending on project type), splits multi-assignee issues evenly, and compares against capacity to compute utilisation percentage.

4. **Worklog data model** — the backend model for time entries (worklogs) is designed and implemented, enabling future planned-vs-actual tracking. The existing worklog UI stubs are connected to real data. Full UI may be phased.

5. **Overallocation detection** — visual warnings surface when a member exceeds their capacity, both in the dedicated workload view and as inline indicators where useful.

**Out of scope:** full auto-levelling (MS Project-style automatic rescheduling), cross-workspace resource management. CPM-aware levelling suggestions will be investigated during brainstorming but are a stretch goal, not a requirement.

## Acceptance Criteria

### resource-workload.AC1: Capacity model

- **resource-workload.AC1.1 Success:** Workspace admin can set a member's capacity in hours per week
- **resource-workload.AC1.2 Success:** Workspace admin can set a member's capacity in points per cycle
- **resource-workload.AC1.3 Success:** Capacity changes with a new `effective_from` date preserve history (previous records remain)
- **resource-workload.AC1.4 Success:** Active capacity is the record with the most recent `effective_from <= today`
- **resource-workload.AC1.5 Success:** Project admin can set per-member allocation caps (max hours, max points) on a project
- **resource-workload.AC1.6 Success:** `hours_per_point` on an estimate enables points↔hours conversion for allocation
- **resource-workload.AC1.7 Edge:** Member with no capacity record is treated as unset (no utilisation calculation, not as 0)
- **resource-workload.AC1.8 Edge:** Project allocation cap exceeding workspace capacity is allowed (cap is a ceiling, not a guarantee)

### resource-workload.AC2: Capacity settings UI

- **resource-workload.AC2.1 Success:** Workspace settings page shows member list with current capacity values
- **resource-workload.AC2.2 Success:** Editing a member's capacity creates a new record with today's `effective_from`
- **resource-workload.AC2.3 Success:** Project settings page shows member list with allocation caps for that project
- **resource-workload.AC2.4 Success:** Allocation caps can be set and updated per member per project
- **resource-workload.AC2.5 Failure:** Non-admin users cannot modify capacity or allocation settings (API returns 403)

### resource-workload.AC3: Allocation calculation

- **resource-workload.AC3.1 Success:** Workload endpoint returns per-member allocation aggregated across projects for a date range
- **resource-workload.AC3.2 Success:** Multi-assignee issues split effort evenly (5-point issue, 2 assignees = 2.5 each)
- **resource-workload.AC3.3 Success:** Utilisation percentage is `total_allocated / capacity * 100`
- **resource-workload.AC3.4 Success:** Status thresholds: under (<60%), optimal (60–80%), near (80–100%), over (>100%)
- **resource-workload.AC3.5 Success:** Response includes per-project breakdown with allocated hours/points and issue count
- **resource-workload.AC3.6 Success:** `hours_per_point` conversion applied when aggregating across mixed-unit projects
- **resource-workload.AC3.7 Edge:** Issues without estimates are excluded from allocation calculation (not treated as 0)
- **resource-workload.AC3.8 Edge:** Member with assignments but no capacity record returns allocation data with null utilisation

### resource-workload.AC4: Workload view

- **resource-workload.AC4.1 Success:** Workload layout appears in the layout switcher alongside Gantt/Board/Spreadsheet
- **resource-workload.AC4.2 Success:** View shows per-member rows with colour-coded allocation bars (green/yellow/red)
- **resource-workload.AC4.3 Success:** Day and week granularity toggle switches the timeline column width
- **resource-workload.AC4.4 Success:** Cycle dropdown scopes the view to a cycle's date range
- **resource-workload.AC4.5 Success:** Clicking an allocation bar expands to show individual contributing issues
- **resource-workload.AC4.6 Success:** Workspace-level view shows stacked bars coloured by project
- **resource-workload.AC4.7 Edge:** Members with no assigned issues in the date range show an empty row (not hidden)
- **resource-workload.AC4.8 Edge:** CE build renders null for the workload layout (no errors, no visible element)

### resource-workload.AC5: Gantt allocation indicators

- **resource-workload.AC5.1 Success:** Gantt blocks show a small allocation status indicator per assignee
- **resource-workload.AC5.2 Success:** Indicators update reactively when workload data or assignments change
- **resource-workload.AC5.3 Edge:** Indicators do not render when workload data has not been loaded
- **resource-workload.AC5.4 Edge:** CE build renders nothing for allocation indicators

### resource-workload.AC6: Worklog CRUD and UI

- **resource-workload.AC6.1 Success:** Worklogs can be created on an issue with duration and logged date
- **resource-workload.AC6.2 Success:** Issue detail sidebar shows total time logged via `IssueWorklogProperty`
- **resource-workload.AC6.3 Success:** Activity feed shows worklog entries via `IssueActivityWorklog`
- **resource-workload.AC6.4 Success:** Time tracking toggle appears in project features settings
- **resource-workload.AC6.5 Success:** Worklog creation is gated by `project.is_time_tracking_enabled`
- **resource-workload.AC6.6 Failure:** Creating a worklog on a project with time tracking disabled returns 403
- **resource-workload.AC6.7 Edge:** Deleting a worklog updates the aggregated total in the sidebar

### resource-workload.AC7: Levelling suggestions (stretch)

- **resource-workload.AC7.1 Success:** Tasks with positive CPM slack assigned to overallocated members are identified
- **resource-workload.AC7.2 Success:** Suggestions include a delay date within the task's float window
- **resource-workload.AC7.3 Success:** Gantt blocks with levelling suggestions show a visual indicator
- **resource-workload.AC7.4 Edge:** Tasks on the critical path (zero slack) are never suggested for delay
- **resource-workload.AC7.5 Edge:** Levelling function returns empty results when no overallocation exists

## Glossary

- **HW/CE overlay**: An architectural pattern in this codebase where enterprise ("HW") feature implementations live in `apps/web/hw/` and `plane.hw`, while community-edition ("CE") counterparts in `apps/web/ce/` provide no-op stubs satisfying the same TypeScript interfaces. A build-time alias (`@/plane-web/`) resolves to one or the other.
- **MobX**: A reactive state management library for JavaScript. Stores declare observable data and `computed` values; components that read those values automatically re-render when they change. Used throughout the Plane frontend.
- **`computedFn`**: A MobX utility that memoises a function by its arguments, so a per-block derived value (e.g., allocation status for a Gantt block) is only recomputed when its inputs change.
- **CPM (Critical Path Method)**: A scheduling algorithm that identifies the longest dependency chain through a set of tasks (the "critical path"). Tasks on the critical path have zero slack — any delay extends the project.
- **Slack / float**: In CPM terminology, the amount of time a task can be delayed without pushing out the project's finish date.
- **Temporal versioning (`effective_from`)**: A data modelling pattern where changes to a record are stored as new rows with a date indicating when the new value takes effect, rather than overwriting the existing row. Querying for "the current value" means finding the most recent record whose `effective_from` is on or before today.
- **Utilisation percentage**: `total_allocated_effort / capacity * 100`. Expresses how much of a member's available capacity is consumed by their assigned work. Above 100% indicates overallocation.
- **Levelling (resource levelling)**: The process of adjusting a project schedule to resolve resource overallocation, typically by delaying non-critical tasks. Full automatic levelling (as in MS Project) is out of scope; only CPM-aware suggestions are a stretch goal.
- **SWR**: A React data-fetching library (from Vercel) that provides caching, revalidation, and deduplication for API calls. Used alongside MobX stores in the Plane frontend.
- **`ProjectBaseModel`**: A Django abstract base class in `plane.db` that adds common fields — `workspace`, `project`, created/updated timestamps, and soft delete — to models that belong to a project.
- **`IssueAssignee`**: The through-table in `plane.db` linking issues to their assigned members (many-to-many). The workload aggregation query joins through this table to group effort by member.
- **`EstimatePoint`**: A model in `plane.db` storing a single value within an `Estimate` set (e.g., "5 points" or "4 hours"). The workload aggregation sums these values per assignee.
- **`EIssueLayoutTypes`**: A TypeScript enum in `@plane/types` enumerating all supported issue view layouts (Board, Gantt, Spreadsheet, etc.). Adding `WORKLOAD` here registers the new view in the layout switcher.
- **Worklog**: A time-entry record stating that a specific member spent a given duration on an issue on a specific date. Distinct from estimated effort — worklogs record what actually happened.
- **`hours_per_point`**: A conversion factor on the `Estimate` model allowing point-based estimates to be expressed as hours for cross-project allocation comparison.
- **Design tokens**: Named variables (colours, spacing, typography) that encode a design system's visual decisions. Using them ensures the workload view inherits theming (dark mode, etc.) automatically.

## Architecture

Hybrid approach: backend aggregation for workspace-wide workload data, frontend MobX enrichment for CPM-aware Gantt integration. The backend handles the expensive cross-project join (issues → assignees → estimates → capacity) and returns pre-aggregated allocation data. The frontend consumes this data for the workload view, and separately enriches the Gantt timeline store with allocation-aware computed values that compose with existing CPM results.

### Data model

Three new models in `plane.hw`, one in `plane.db`, and one field addition to an existing model.

**`MemberCapacity`** (in `plane.hw.models`, workspace-scoped):

| Field             | Type                   | Notes                                                           |
| ----------------- | ---------------------- | --------------------------------------------------------------- |
| `workspace`       | FK → Workspace         |                                                                 |
| `member`          | FK → User              |                                                                 |
| `capacity_hours`  | DecimalField           | Hours per week (e.g., 40.0)                                     |
| `capacity_points` | IntegerField, nullable | Points per cycle, used when project uses points-based estimates |
| `effective_from`  | DateField              | When this capacity takes effect                                 |

Multiple records per member allow capacity changes over time (e.g., going part-time). The most recent `effective_from <= today` is the active record. Unique constraint on `(workspace, member, effective_from)`.

**`ProjectMemberAllocation`** (in `plane.hw.models`, per-project cap):

| Field        | Type                   | Notes                                    |
| ------------ | ---------------------- | ---------------------------------------- |
| `project`    | FK → Project           |                                          |
| `member`     | FK → User              |                                          |
| `max_hours`  | DecimalField           | Maximum hours per week on this project   |
| `max_points` | IntegerField, nullable | Maximum points per cycle on this project |

Unique constraint on `(project, member)`. Enforces per-project allocation caps — e.g., Sarah has 40 hr/week capacity but max 24 hr on Project A and max 16 hr on Project B.

**`Worklog`** (in `plane.db.models`, core data type):

| Field              | Type                  | Notes                                            |
| ------------------ | --------------------- | ------------------------------------------------ |
| `issue`            | FK → Issue            |                                                  |
| `member`           | FK → User             | Who logged the time                              |
| `duration_minutes` | IntegerField          | Stored as minutes for precision                  |
| `description`      | TextField, blank=True | Optional — quick logging should be friction-free |
| `logged_date`      | DateField             |                                                  |

Inherits from `ProjectBaseModel` (gets `workspace`, `project`, timestamps, soft delete). Connects to existing worklog UI stubs whose interfaces accept `workspaceSlug`, `projectId`, `issueId`.

**Estimate extension** (field addition to existing `Estimate` model in `plane.db`):

| Field             | Type                   | Notes                                                 |
| ----------------- | ---------------------- | ----------------------------------------------------- |
| `hours_per_point` | DecimalField, nullable | Conversion factor (e.g., 4.0 means 1 point = 4 hours) |

When set, allocation can be expressed in either unit. When null, points-based projects track allocation in points only (no hours conversion).

### Backend API

**Workload aggregation** (the workhorse):

`GET /api/v1/workspaces/{slug}/workload/`

Query params: `start_date`, `end_date` (defaults to current cycle if project context), `project_id` (optional filter), `member_ids` (optional filter).

Response contract:

```typescript
interface WorkloadResponse {
  members: Array<{
    member_id: string;
    capacity: {
      hours_per_week: number;
      points_per_cycle: number | null;
    };
    allocation: {
      total_hours: number;
      total_points: number;
      utilisation_pct: number;
      actual_hours: number; // from worklogs, 0 until worklogs implemented
      status: "under" | "optimal" | "near" | "over";
    };
    by_project: Array<{
      project_id: string;
      project_name: string;
      allocated_hours: number;
      allocated_points: number;
      max_hours: number | null;
      issue_count: number;
    }>;
  }>;
}
```

Utilisation thresholds: `under` < 60%, `optimal` 60–80%, `near` 80–100%, `over` > 100%.

Backend computes allocation via Django ORM — joins through `IssueAssignee`, aggregates estimate point values with `Sum(Cast(..., FloatField()))`, divides by assignee count for multi-assignee splitting. Follows the existing module estimate aggregation pattern in `apps/api/plane/app/views/module/base.py`.

**Capacity CRUD:**

- `GET/POST/PATCH /api/v1/workspaces/{slug}/members/{member_id}/capacity/`

**Project allocation CRUD:**

- `GET/POST/PATCH /api/v1/workspaces/{slug}/projects/{project_id}/members/{member_id}/allocation/`

**Worklog CRUD:**

- `GET/POST /api/v1/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/`
- `PATCH/DELETE .../worklogs/{worklog_id}/`

### Frontend workload view

New layout type `WORKLOAD` added to `EIssueLayoutTypes` enum in `packages/types/src/issues/issue.ts`. Layout metadata added to `ISSUE_LAYOUT_MAP` in `packages/constants/src/issue/layout.ts`. Switch cases added to project, cycle, and module layout roots.

The view follows Monday.com's workload widget pattern adapted to Plane's design language:

- **Left column:** member name, overall utilisation percentage, status colour indicator (green/yellow/red)
- **Timeline columns:** day or week buckets (switchable granularity)
- **Bars:** filled proportionally to allocation vs capacity, colour-coded by utilisation status
- **Click-through:** clicking a member's allocation bar for a day/week expands to show individual contributing issues
- **Scope selector:** cycle dropdown or custom date range picker
- **Points mode:** for points-based projects, bars show points instead of hours with capacity line at `capacity_points` distributed across cycle working days
- **Workspace level:** stacked bars colour-coded by project showing cross-project allocation per member

Must use existing design tokens and match the application's theming patterns for consistency with other views.

Full implementation in `apps/web/hw/components/issues/issue-layouts/workload/`. CE stub in `apps/web/ce/components/issues/issue-layouts/workload/` returns null. Import resolution via `@/plane-web/` alias.

### Frontend stores

**WorkloadStore** (new, in `apps/web/hw/store/workload/`):

Consumes the backend workload API and provides reactive access for the workload view.

```typescript
interface IWorkloadStore {
  memberAllocations: Record<string, MemberAllocationData>;
  isLoading: boolean;
  dateRange: { start: string; end: string };
  granularity: "day" | "week";
  projectFilter: string | null;

  getMemberUtilisation(memberId: string): UtilisationStatus;
  getMemberDailyAllocation(memberId: string, date: string): DailyAllocation;
  getOverallocatedMembers(): string[];

  fetchWorkload(workspaceSlug: string, params: WorkloadParams): Promise<void>;
}
```

**Timeline store enrichment** (extends `apps/web/hw/store/timeline/base-timeline.store.ts`):

```typescript
// New computed values on existing timeline store
getAllocationStatus(blockId: string): "under" | "optimal" | "near" | "over" | null;
getAssigneeUtilisation(blockId: string): Array<{ memberId: string; pct: number; status: string }>;
```

These read from the workload store's cached data plus the block's `assignee_ids` from `block.data`. When viewing Gantt with CPM enabled, blocks can show a small allocation indicator per assignee.

### CPM-aware levelling suggestions (stretch goal)

A pure function in `apps/web/hw/helpers/allocation-analyzer.ts`, following the exact pattern of `detectDependencyConflicts` in `apps/web/hw/helpers/dependency-conflict.ts`:

```typescript
interface AllocationConflict {
  memberId: string;
  dateRange: { start: string; end: string };
  allocatedEffort: number;
  capacity: number;
  contributingIssueIds: string[];
}

interface LevellingSuggestion {
  issueId: string;
  action: "delay" | "reassign";
  reason: string;
  suggestedDate?: string;
  slackAvailable?: number;
}

function analyzeLevelling(
  cpmResults: CpmResultMap,
  allocations: MemberAllocationData[],
  blocksMap: Record<string, IGanttBlock>
): LevellingSuggestion[];
```

The key insight: tasks with positive CPM slack can be delayed to relieve overallocation without affecting the critical path. The function groups tasks by assignee per day, sums effort, compares against capacity, and for overallocated days identifies tasks with slack that could be shifted within their float window. Wrapped in `computedFn` for MobX memoisation on the timeline store.

### Worklog integration (phased)

The worklog model connects to existing UI stubs:

- `IssueWorklogProperty` — shows total time logged in the issue detail sidebar
- `IssueActivityWorklog` — renders worklog entries in the activity feed
- `IssueActivityWorklogCreateButton` — quick-add button for logging time

The workload API response shape includes `actual_hours` (returns 0 until worklogs are implemented). Once worklogs exist, the workload view gains a "Planned vs Actual" toggle that switches the bar data source. The visual pattern is identical — only the numbers change.

### Multi-assignee handling

Effort is split evenly across assignees. A 5-point issue with 2 assignees contributes 2.5 points to each assignee's allocation. The division happens at the backend query level in the workload aggregation endpoint.

## Existing Patterns

This design follows patterns established in the codebase:

- **HW/CE overlay** — new models in `plane.hw`, new components in `apps/web/hw/` with parallel stubs in `apps/web/ce/`. Same pattern as issue types (`plane.hw.models.issue_type`) and custom properties (`plane.hw.models.issue_property`).

- **Module estimate aggregation** — the backend workload endpoint uses the same `Sum(Cast("estimate_point__value", FloatField()))` pattern from `apps/api/plane/app/views/module/base.py` (lines 145–200), joining through `IssueAssignee` instead of `IssueModule`.

- **CPM pure-function + MobX computed** — `allocation-analyzer.ts` follows the pattern of `apps/web/hw/helpers/cpm-calculator.ts` (pure functions, no store access) and `apps/web/hw/helpers/dependency-conflict.ts` (structured conflict results). Timeline store integration uses `computedFn` for per-block memoisation, same as `isCritical(blockId)` and `getDependencyConflicts(blockId)`.

- **Layout registration** — new `WORKLOAD` layout type follows the enum + constants + switch-case pattern used by all existing layouts in `apps/web/core/components/issues/issue-layouts/roots/`.

- **Worklog stubs** — fills in existing interface contracts at `apps/web/hw/components/issues/worklog/` and `apps/web/ce/components/issues/worklog/`. Component signatures remain unchanged.

- **Cycle-scoped analytics** — the workload endpoint mirrors the existing `ProjectAdvanceAnalyticsStatsEndpoint` pattern of grouping work items by assignee within a date range.

**One new pattern:** `MemberCapacity` uses `effective_from` date-based temporal versioning — no existing model does this. The alternative (single record updated in place) loses history of capacity changes. The overhead is minimal (one extra date field, queryset filter for most-recent record).

## Implementation Phases

<!-- START_PHASE_1 -->

### Phase 1: Backend data models and migrations

**Goal:** Establish the data layer for capacity, allocation, and worklogs.

**Components:**

- `MemberCapacity` model in `apps/api/plane/hw/models/` — workspace-scoped member capacity with temporal versioning
- `ProjectMemberAllocation` model in `apps/api/plane/hw/models/` — per-project allocation caps
- `Worklog` model in `apps/api/plane/db/models/` — time entries on issues
- `hours_per_point` field addition to `Estimate` model in `apps/api/plane/db/models/estimate.py`
- Serializers for all new models in `apps/api/plane/hw/serializers/`
- Migrations for both `plane.hw` and `plane.db`

**Dependencies:** None (first phase).

**Done when:** Migrations apply cleanly, models can be created/read/updated via Django shell, serializers validate input correctly. Covers `resource-workload.AC1.*`.

<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->

### Phase 2: Capacity and allocation API endpoints

**Goal:** CRUD endpoints for managing member capacity and project allocation caps.

**Components:**

- Capacity viewset in `apps/api/plane/hw/views/` — `GET/POST/PATCH` for workspace member capacity
- Allocation viewset in `apps/api/plane/hw/views/` — `GET/POST/PATCH` for project member allocation caps
- URL registration in `apps/api/plane/hw/urls/`
- Capacity settings UI components in `apps/web/hw/components/settings/` — workspace member capacity editor, project member allocation editor
- CE stubs in `apps/web/ce/components/settings/` returning null

**Dependencies:** Phase 1 (models exist).

**Done when:** Capacity and allocation can be created and updated via API, settings UI renders and persists changes. Covers `resource-workload.AC2.*`.

<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->

### Phase 3: Workload aggregation API

**Goal:** Backend endpoint that computes per-member allocation across projects for a given date range.

**Components:**

- Workload viewset in `apps/api/plane/hw/views/` — `GET` endpoint with date range, project, and member filters
- Django ORM query joining `Issue` → `IssueAssignee` → `EstimatePoint` → `MemberCapacity`, with multi-assignee splitting
- Utilisation calculation and status classification (under/optimal/near/over)
- Workload service in `apps/web/core/services/` — API client for the workload endpoint

**Dependencies:** Phase 1 (models), Phase 2 (capacity data exists to compute against).

**Done when:** Endpoint returns correct per-member allocation with utilisation percentages and status, handles multi-assignee splitting, filters by date range and project. Covers `resource-workload.AC3.*`.

<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->

### Phase 4: Workload view (frontend)

**Goal:** Dedicated workload layout showing per-member allocation with overallocation indicators.

**Components:**

- `WORKLOAD` value added to `EIssueLayoutTypes` in `packages/types/src/issues/issue.ts`
- Layout metadata in `packages/constants/src/issue/layout.ts`
- WorkloadStore in `apps/web/hw/store/workload/` — consumes backend API, provides reactive access
- Workload layout components in `apps/web/hw/components/issues/issue-layouts/workload/` — member rows, timeline bars, allocation detail panel, scope selector
- CE stub in `apps/web/ce/components/issues/issue-layouts/workload/` — returns null
- Switch cases in layout roots: `apps/web/core/components/issues/issue-layouts/roots/`
- Layout loader in `apps/web/core/components/ui/loader/layouts/`
- Must use existing design tokens and theming patterns for visual consistency

**Dependencies:** Phase 3 (workload API provides data).

**Done when:** Workload view renders in layout switcher, shows per-member allocation bars with colour-coded utilisation status, supports day/week granularity switching and cycle/date range scoping, click-through shows contributing issues. Covers `resource-workload.AC4.*`.

<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->

### Phase 5: Gantt allocation indicators and CPM enrichment

**Goal:** Surface allocation status on Gantt blocks and compose with CPM results.

**Components:**

- Timeline store extension in `apps/web/hw/store/timeline/base-timeline.store.ts` — `getAllocationStatus(blockId)` and `getAssigneeUtilisation(blockId)` computed values reading from workload store
- Block allocation indicator in `apps/web/hw/components/gantt-chart/blocks/` — small colour-coded dot per assignee showing utilisation status
- CE stubs for indicator components

**Dependencies:** Phase 3 (workload data available), Phase 4 (workload store exists).

**Done when:** Gantt blocks show allocation status indicators, indicators update reactively when workload data changes, indicators respect CPM toggle state. Covers `resource-workload.AC5.*`.

<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->

### Phase 6: Worklog API and UI stubs

**Goal:** Worklog CRUD and fill in existing UI stubs for time tracking.

**Components:**

- Worklog viewset in `apps/api/plane/hw/views/` — `GET/POST/PATCH/DELETE` for issue worklogs
- URL registration in `apps/api/plane/hw/urls/`
- Worklog service in `apps/web/core/services/` — API client
- Fill in `apps/web/hw/components/issues/worklog/property/root.tsx` — shows aggregated time logged
- Fill in `apps/web/hw/components/issues/worklog/activity/root.tsx` — renders worklog entries in feed
- Fill in `apps/web/hw/components/issues/worklog/activity/worklog-create-button.tsx` — time entry modal
- CE stubs remain as empty fragments (no change needed)
- `Project.is_time_tracking_enabled` toggle added to project settings features list in `apps/web/core/components/project/settings/features-list.tsx`

**Dependencies:** Phase 1 (Worklog model exists). Independent of Phases 4 and 5.

**Done when:** Worklogs can be created, listed, updated, and deleted via API. Issue detail sidebar shows total logged time. Activity feed shows worklog entries. Time tracking toggle appears in project settings. Covers `resource-workload.AC6.*`.

<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->

### Phase 7: Levelling suggestions (stretch)

**Goal:** CPM-aware analysis that identifies non-critical tasks that could be delayed to relieve overallocation.

**Components:**

- `analyzeLevelling()` pure function in `apps/web/hw/helpers/allocation-analyzer.ts` — takes CPM results, allocation data, and blocks map, returns levelling suggestions
- `getLevellingSuggestions(blockId)` computed value on timeline store via `computedFn`
- Suggestion indicator on Gantt blocks in `apps/web/hw/components/gantt-chart/blocks/` — visual cue that a task could be delayed to help an overallocated member
- CE stubs for suggestion components

**Dependencies:** Phase 5 (allocation data on timeline store), requires CPM implementation from `cpm-critical-path` design to be complete.

**Done when:** Levelling function identifies tasks with CPM slack assigned to overallocated members and suggests delay dates within the float window. Suggestions render on Gantt blocks. Covers `resource-workload.AC7.*`.

<!-- END_PHASE_7 -->

## Additional Considerations

**Planned vs actual tracking:** the workload API response includes `actual_hours` from day one (returns 0 until Phase 6 completes). Once worklogs are implemented, the workload view gains a "Planned vs Actual" toggle that switches the bar data source without any structural changes to the view component.

**Estimate type interaction:** projects using `categories` type estimates (e.g., T-shirt sizes) cannot participate in hours-based allocation calculation unless `hours_per_point` is set on the estimate. The workload view gracefully handles this — categorically-estimated issues show as "unestimated" in the allocation breakdown, with a prompt to either switch to points/time estimates or set a conversion factor.

**Performance:** the workload aggregation query joins across issues, assignees, and estimates for all projects a member participates in. For large workspaces this could be expensive. The endpoint should use Django's `Prefetch` and `select_related` to minimize query count, and the response should be cached (e.g., 30-second TTL) since allocation data doesn't change on every page load.
