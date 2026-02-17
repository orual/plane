# Resource Workload Implementation Plan — Phase 5

**Goal:** Surface allocation status on Gantt blocks and compose with CPM results.

**Architecture:** Extend the HW timeline store with allocation-aware `computedFn` values that read from the WorkloadStore (Phase 4). Add a small indicator component to Gantt blocks following the ConflictIndicator pattern. CE stubs return null/safe defaults.

**Tech Stack:** React, MobX, mobx-utils (computedFn), TailwindCSS

**Scope:** 7 phases from original design (this is phase 5 of 7)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC5: Gantt allocation indicators

- **resource-workload.AC5.1 Success:** Gantt blocks show a small allocation status indicator per assignee
- **resource-workload.AC5.2 Success:** Indicators update reactively when workload data or assignments change
- **resource-workload.AC5.3 Edge:** Indicators do not render when workload data has not been loaded
- **resource-workload.AC5.4 Edge:** CE build renders nothing for allocation indicators

---

## Key codebase references

- Timeline store: `apps/web/hw/store/timeline/base-timeline.store.ts`
  - `computedFn` import from `mobx-utils` (line 10)
  - `isCritical(blockId)` pattern (line 808)
  - `getDependencyConflicts(blockId)` pattern (line 848)
  - `cpmEnabled` toggle (line 126)
- Gantt block components: `apps/web/hw/components/gantt-chart/blocks/`
  - `conflict-indicator.tsx` (pattern to follow)
  - `computed-date-indicator.tsx`
  - `critical-block-style.ts`
- CE stubs: `apps/web/ce/components/gantt-chart/blocks/`
  - `conflict-indicator.tsx` returns null
- Block data access: `block.data.assignee_ids` (string array from TBaseIssue)
- IGanttBlock: `packages/types/src/layout/gantt.ts:12-25`
- Core block renderer: `apps/web/core/components/gantt-chart/blocks/block.tsx:37-127`

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Timeline store allocation computed values

**Verifies:** resource-workload.AC5.2, resource-workload.AC5.3

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`
- Modify: `apps/web/ce/store/timeline/base-timeline.store.ts`

**Implementation:**

Add two new `computedFn` methods to the HW `BaseTimelineStore`:

**`getAllocationStatus(blockId: string): TUtilisationStatus | null`**

- Uses `computedFn` following the `isCritical(blockId)` pattern (line 808)
- Gets block via `this.getBlockById(blockId)`
- If block has no `assignee_ids` or workload data isn't loaded, return `null` (AC5.3)
- For each assignee, look up their utilisation status from the workload store (accessed via `this.rootStore.workloadStore`)
- Return the worst status among all assignees (over > near > optimal > under)
- If workload store `isLoading` or `memberAllocations` is empty, return `null`

**`getAssigneeUtilisation(blockId: string): Array<{ memberId: string; pct: number; status: TUtilisationStatus }>`**

- Uses `computedFn`
- Gets block, extracts `block.data.assignee_ids`
- For each assignee, queries workload store for their utilisation percentage and status
- Returns array of per-assignee utilisation info
- Returns empty array if workload data not loaded (AC5.3)

Both methods are reactive via MobX: when workload store data changes or block assignments change, these recompute (AC5.2).

**CE stubs** in `apps/web/ce/store/timeline/base-timeline.store.ts`:

- `getAllocationStatus(blockId: string): null` → always returns `null`
- `getAssigneeUtilisation(blockId: string): []` → always returns empty array

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add allocation computed values to timeline store`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: AllocationIndicator component

**Verifies:** resource-workload.AC5.1, resource-workload.AC5.3, resource-workload.AC5.4

**Files:**

- Create: `apps/web/hw/components/gantt-chart/blocks/allocation-indicator.tsx`
- Create: `apps/web/ce/components/gantt-chart/blocks/allocation-indicator.tsx`

**Implementation:**

**HW component** following the exact pattern of `apps/web/hw/components/gantt-chart/blocks/conflict-indicator.tsx`:

`AllocationIndicator` is an `observer` component:

- Props: `blockId: string`
- Gets timeline store via hook (same as ConflictIndicator)
- Calls `store.getAssigneeUtilisation(blockId)` to get per-assignee data
- If result is empty (workload not loaded), renders nothing (AC5.3)
- For each assignee, renders a small dot with colour based on status:
  - `under`/`optimal`: green dot
  - `near`: amber dot
  - `over`: red dot
- Dots are tiny (4-6px) and positioned at the edge of the block, similar to how the conflict indicator positions itself
- Tooltip on hover shows member name and utilisation percentage

**CE stub**: Returns `null` (AC5.4).

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add AllocationIndicator for Gantt blocks with CE stub`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Integrate indicator into Gantt block renderer

**Files:**

- Modify: Core block renderer to include `AllocationIndicator` (via `@/plane-web/` import for HW/CE resolution)

**Implementation:**

In the core Gantt block component (`apps/web/core/components/gantt-chart/blocks/block.tsx`), add the `AllocationIndicator` alongside the existing `ConflictIndicator`.

Import `AllocationIndicator` from `@/plane-web/components/gantt-chart/blocks/allocation-indicator` — this resolves to HW (renders dots) or CE (renders null) based on build.

Position it adjacent to the existing conflict indicator on the block. Exact placement: after the conflict indicator, before the block content.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds. In HW build, allocation dots appear on Gantt blocks when workload data is loaded. In CE build, nothing renders.

**Commit:** `feat: integrate AllocationIndicator into Gantt block renderer`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->

### Task 4: Run full checks

**Files:** None (verification only)

**Implementation:**

```bash
pnpm check:types
pnpm check:lint
pnpm check:format
```

**Verification:**
Expected: All checks pass

**Commit:** No commit — verification only.

<!-- END_TASK_4 -->
