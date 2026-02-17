# Resource Workload Implementation Plan — Phase 4

**Goal:** Dedicated workload layout showing per-member allocation with overallocation indicators.

**Architecture:** New WORKLOAD layout type registered in the existing enum/constants/switch pattern. WorkloadStore (MobX) consumes the backend API via SWR-triggered fetch. Layout components live in HW with CE null stubs. The view renders a timeline grid with member rows, allocation bars, and utilisation status.

**Tech Stack:** React, MobX, SWR, TailwindCSS, @plane/propel components

**Scope:** 7 phases from original design (this is phase 4 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC4: Workload view

- **resource-workload.AC4.1 Success:** Workload layout appears in the layout switcher alongside Gantt/Board/Spreadsheet
- **resource-workload.AC4.2 Success:** View shows per-member rows with colour-coded allocation bars (green/yellow/red)
- **resource-workload.AC4.3 Success:** Day and week granularity toggle switches the timeline column width
- **resource-workload.AC4.4 Success:** Cycle dropdown scopes the view to a cycle's date range
- **resource-workload.AC4.5 Success:** Clicking an allocation bar expands to show individual contributing issues
- **resource-workload.AC4.6 Success:** Workspace-level view shows stacked bars coloured by project
- **resource-workload.AC4.7 Edge:** Members with no assigned issues in the date range show an empty row (not hidden)
- **resource-workload.AC4.8 Edge:** CE build renders null for the workload layout (no errors, no visible element)

---

## Key codebase references

- EIssueLayoutTypes enum: `packages/types/src/issues/issue.ts:15-21`
- ISSUE_LAYOUT_MAP: `packages/constants/src/issue/layout.ts:37-63`
- Layout root switch: `apps/web/core/components/issues/issue-layouts/roots/project-layout-root.tsx:28-43`
- Layout switcher: `apps/web/core/components/issues/issue-layouts/filters/header/layout-selection.tsx`
- HW root store: `apps/web/hw/store/root.store.ts`
- HW store pattern: `apps/web/hw/store/issue-property.store.ts` (interface + class pattern)
- Layout loader: `apps/web/core/components/ui/loader/layouts/gantt-layout-loader.tsx`
- SWR + store pattern: `apps/web/core/components/issues/issue-layouts/roots/project-layout-root.tsx:56-64`

---

<!-- START_TASK_1 -->

### Task 1: Register WORKLOAD layout type

**Verifies:** resource-workload.AC4.1

**Files:**

- Modify: `packages/types/src/issues/issue.ts:15-21` (EIssueLayoutTypes enum)
- Modify: `packages/constants/src/issue/layout.ts:37-63` (ISSUE_LAYOUT_MAP)

**Implementation:**

Add `WORKLOAD = "workload"` to the `EIssueLayoutTypes` enum in `packages/types/src/issues/issue.ts`.

Add entry to `ISSUE_LAYOUT_MAP` in `packages/constants/src/issue/layout.ts`:

```typescript
[EIssueLayoutTypes.WORKLOAD]: {
  key: EIssueLayoutTypes.WORKLOAD,
  i18n_title: "issue.layouts.title.workload",
  i18n_label: "issue.layouts.workload",
},
```

Add i18n translation keys to the relevant locale files (find by grepping for `issue.layouts.title.list` to locate the i18n file, then add adjacent entries for workload).

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: register WORKLOAD layout type in enum and constants`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: WorkloadStore (MobX)

**Files:**

- Create: `apps/web/hw/store/workload/index.ts`
- Create: `apps/web/hw/store/workload/workload.store.ts`
- Modify: `apps/web/hw/store/root.store.ts`

**Implementation:**

Create `apps/web/hw/store/workload/workload.store.ts` following the pattern of `apps/web/hw/store/issue-property.store.ts`:

Interface `IWorkloadStore`:

- Observable state:
  - `memberAllocations: Record<string, IWorkloadMember>` — keyed by member_id
  - `isLoading: boolean`
  - `dateRange: { start: string; end: string }`
  - `granularity: "day" | "week"`
  - `projectFilter: string | null`
- Computed:
  - `getMemberUtilisation(memberId: string): TUtilisationStatus | null`
  - `getMemberDailyAllocation(memberId: string, date: string): { hours: number; points: number } | null`
  - `getOverallocatedMembers(): string[]`
- Actions:
  - `fetchWorkload(workspaceSlug: string, params: TWorkloadParams): Promise<void>` — calls `WorkloadService.getWorkload()`, populates `memberAllocations`
  - `setGranularity(granularity: "day" | "week"): void`
  - `setDateRange(start: string, end: string): void`
  - `setProjectFilter(projectId: string | null): void`

Class `WorkloadStore implements IWorkloadStore`:

- Constructor takes `rootStore` (pattern from existing stores)
- `makeObservable` with observable/computed/action annotations
- `fetchWorkload` instantiates `WorkloadService` and calls API, stores results in `memberAllocations`

Create barrel export in `apps/web/hw/store/workload/index.ts`.

Register on `RootStore` in `apps/web/hw/store/root.store.ts`:

- Add `workloadStore: IWorkloadStore` property
- Instantiate `new WorkloadStore(this)` in the constructor **BEFORE** `TimeLineStore` is instantiated. Phase 5 adds `computedFn` methods to `BaseTimelineStore` that access `this.rootStore.workloadStore`. Although MobX computed values are lazy (evaluated on first access, not during construction), initialising `WorkloadStore` first eliminates any ordering fragility. Add a comment in the constructor: `// WorkloadStore must be initialised before TimeLineStore (Phase 5 reads workloadStore from timeline computed values)`

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add WorkloadStore for workload data management`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Workload layout root and loader

**Verifies:** resource-workload.AC4.1, resource-workload.AC4.8

**Files:**

- Create: `apps/web/core/components/issues/issue-layouts/workload/roots/project-root.tsx`
- Create: `apps/web/core/components/issues/issue-layouts/workload/roots/cycle-root.tsx`
- Create: `apps/web/core/components/issues/issue-layouts/workload/roots/module-root.tsx`
- Create: `apps/web/core/components/ui/loader/layouts/workload-layout-loader.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/roots/project-layout-root.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/roots/cycle-layout-root.tsx` (if exists)
- Modify: `apps/web/core/components/issues/issue-layouts/roots/module-layout-root.tsx` (if exists)

**Implementation:**

**Layout root** (`project-root.tsx`): An `observer` component that:

- Gets `workspaceSlug` and `projectId` from params/context
- Uses SWR to trigger `workloadStore.fetchWorkload()` with the current date range
- Renders `WorkloadLayout` from `@/plane-web/components/issues/issue-layouts/workload`
- Passes `isLoading` and `memberAllocations` from store
- Follows exact pattern of `apps/web/core/components/issues/issue-layouts/roots/project-layout-root.tsx:56-64` for SWR usage

Create similar roots for cycle and module contexts (cycle root extracts date range from cycle).

**Layout loader** (`workload-layout-loader.tsx`): A skeleton loader with animate-pulse showing:

- Left column of member name placeholders
- Grid of allocation bar placeholders
- Follow the pattern in `apps/web/core/components/ui/loader/layouts/gantt-layout-loader.tsx`

**Switch cases**: Add `case EIssueLayoutTypes.WORKLOAD:` to each layout root's switch statement, importing the corresponding workload root.

**CE stub** (`apps/web/ce/components/issues/issue-layouts/workload/index.tsx`):

```typescript
export const WorkloadLayout = () => null;
```

**HW barrel export** (`apps/web/hw/components/issues/issue-layouts/workload/index.tsx`):
Export the actual `WorkloadLayout` component (created in Task 4).

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat: add workload layout roots, switch cases, loader, and CE stub`

<!-- END_TASK_3 -->

<!-- START_SUBCOMPONENT_A (tasks 4-7) -->

<!-- START_TASK_4 -->

### Task 4: WorkloadLayout main component

**Verifies:** resource-workload.AC4.2, resource-workload.AC4.3, resource-workload.AC4.7

**Files:**

- Create: `apps/web/hw/components/issues/issue-layouts/workload/workload-layout.tsx`
- Create: `apps/web/hw/components/issues/issue-layouts/workload/index.tsx`

**Implementation:**

`WorkloadLayout` is an `observer` component that renders the full workload grid:

1. **Header bar**: Granularity toggle (day/week), date range selector, cycle dropdown
2. **Grid**: Left column (member list) + scrollable timeline columns

Structure:

- Reads `workloadStore` from HW root store (via a custom hook or direct store access)
- Left column renders one row per workspace member (from workload API response), including members with no allocation (AC4.7)
- Each member row shows: name, overall utilisation percentage, status colour indicator
- Timeline columns are day or week buckets based on granularity (AC4.3)
- Uses TailwindCSS for layout, `@plane/propel` components for buttons/toggles

Member rows with no assigned issues show empty bars with no colour fill (AC4.7).

Export from `apps/web/hw/components/issues/issue-layouts/workload/index.tsx`.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add WorkloadLayout main component`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Allocation bar component

**Verifies:** resource-workload.AC4.2, resource-workload.AC4.5, resource-workload.AC4.6

**Files:**

- Create: `apps/web/hw/components/issues/issue-layouts/workload/allocation-bar.tsx`

**Implementation:**

`AllocationBar` component renders a single cell in the workload grid (one member × one time period):

- Props: `memberId`, `date` (or date range for week), `allocation` data
- Bar filled proportionally to `allocated / capacity` (percentage width)
- Colour-coded by utilisation status (AC4.2):
  - `under` (<60%): green tones (e.g., `bg-green-500/20` with `bg-green-500` fill)
  - `optimal` (60-80%): green tones (slightly more saturated)
  - `near` (80-100%): yellow/amber tones (e.g., `bg-amber-500/20` with `bg-amber-500` fill)
  - `over` (>100%): red tones (e.g., `bg-red-500/20` with `bg-red-500` fill, bar overflows visually)
- Clickable — on click expands to show contributing issues (AC4.5)
- When at workspace level: stacked segments coloured by project (AC4.6) — each project contribution is a segment of the bar with a distinct colour

Use Tailwind utility classes for colours. Map the status string to a colour class lookup object.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add AllocationBar component with colour-coded utilisation`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Allocation detail panel (click-through)

**Verifies:** resource-workload.AC4.5

**Files:**

- Create: `apps/web/hw/components/issues/issue-layouts/workload/allocation-detail-panel.tsx`

**Implementation:**

`AllocationDetailPanel` renders when a member's allocation bar is clicked, showing the contributing issues:

- Props: `memberId`, `dateRange`, `byProject` data from the workload API
- Renders a list of projects with their issues
- Each project section shows: project name, allocated hours/points, issue count
- Each issue shows: title, estimate points, assignee count (if multi-assignee)
- Styled as a dropdown/panel below the bar, or as a slide-out panel
- Close on click-outside or Escape key

Follow existing dropdown/panel patterns in the codebase (check `@plane/propel` for Popover or similar).

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add AllocationDetailPanel for issue breakdown`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Scope selector (cycle dropdown + date range)

**Verifies:** resource-workload.AC4.4

**Files:**

- Create: `apps/web/hw/components/issues/issue-layouts/workload/scope-selector.tsx`

**Implementation:**

`ScopeSelector` component renders the date range controls:

- A cycle dropdown (AC4.4): when a cycle is selected, set the workload store's `dateRange` to the cycle's `start_date` and `end_date`
- A custom date range picker as fallback
- Granularity toggle (day/week) that calls `workloadStore.setGranularity()`

Uses existing cycle data from MobX stores (the cycle store should already exist in the project). Cycle model has `start_date` and `end_date` as DateTimeField — extract the date portion.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add ScopeSelector for cycle and date range selection`

<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_8 -->

### Task 8: Add WORKLOAD to layout availability lists

**Verifies:** resource-workload.AC4.1

**Files:**

- Investigate and modify: Files that define which layouts are available per context (project, cycle, module)

**Implementation:**

The layout switcher receives a `layouts` array prop. Find where this array is constructed for projects, cycles, and modules, and add `EIssueLayoutTypes.WORKLOAD` to each.

Likely locations (executor should grep for `EIssueLayoutTypes.LIST` usage in array literals to find these):

- Project view header
- Cycle view header
- Module view header

These arrays control which layout icons appear in the switcher.

**Verification:**
Run: `pnpm check:types` from repo root
Run: Check in browser that workload icon appears in layout switcher
Expected: Workload appears alongside existing layouts

**Commit:** `feat: add WORKLOAD to layout availability in project, cycle, and module views`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Run full checks

**Files:** None (verification only)

**Implementation:**

```bash
pnpm check:types
pnpm check:lint
pnpm check:format
```

Fix any issues.

**Verification:**
Expected: All checks pass

**Commit:** No commit — verification only.

<!-- END_TASK_9 -->
