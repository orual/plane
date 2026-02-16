# CPM Critical Path — Phase 3: Virtual Date Injection

**Goal:** Position dateless tasks on the gantt based on their CPM-computed dates, with distinct styling and drag-to-manual conversion.

**Architecture:** Extend the block update pipeline (`updateBlocks`) to inject computed dates from the CPM store before position calculation. Add `dateSource` to `IGanttBlock`. Computed-date blocks render with dashed borders/reduced opacity and convert to manual dates on drag. Visibility filters updated to allow computed-date blocks through when CPM is enabled.

**Tech Stack:** TypeScript, MobX, Vitest

**Scope:** 7 phases from original design (phase 3 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC3: Virtual date injection

- **cpm-critical-path.AC3.1 Success:** Dateless task with FS predecessor appears on gantt at computed position when CPM is enabled
- **cpm-critical-path.AC3.2 Success:** Injected block has `dateSource: 'computed'` flag
- **cpm-critical-path.AC3.3 Success:** Computed-date blocks render with dashed border and reduced opacity
- **cpm-critical-path.AC3.4 Success:** Dragging a computed-date block sets real dates, converting `dateSource` to `'manual'`
- **cpm-critical-path.AC3.5 Failure:** Computed-date blocks cannot be resized (no drag handles for resize)
- **cpm-critical-path.AC3.6 Edge:** Dateless tasks with no dependency chain membership remain hidden (no virtual date assigned)
- **cpm-critical-path.AC3.7 Edge:** Toggling CPM off removes computed-date blocks from the gantt (they return to hidden state)

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **Block type:** `packages/types/src/layout/gantt.ts` — `IGanttBlock` interface with `start_date`, `target_date`, `meta`, `position`.
- **Block update pipeline (HW):** `apps/web/hw/store/timeline/base-timeline.store.ts:245-297` — `updateBlocks()` constructs `IGanttBlock` objects from block data, calculates position via `getItemPositionWidth()` at line 270, and sets them in `blocksMap`.
- **Position calculation:** `apps/web/core/components/gantt-chart/views/helpers.ts:89-118` — `getItemPositionWidth()` takes chart view data and a block, returns `{ marginLeft, width }` from dates.
- **Drag handler:** `apps/web/hw/store/timeline/base-timeline.store.ts:352-373` — `getUpdatedPositionAfterDrag()` converts pixel position back to dates. Currently only sets dates that already exist on the block (line 360: `if (shouldUpdateHalfBlock || currBlock.start_date)`).
- **Block visibility (block.tsx):** `apps/web/core/components/gantt-chart/blocks/block.tsx:68` — `const isBlockVisibleOnChart = block?.start_date || block?.target_date;` — renders if either date exists.
- **Block visibility (block-row.tsx):** `apps/web/core/components/gantt-chart/blocks/block-row.tsx:75` — `(!showAllBlocks && !(block.start_date && block.target_date))` — requires BOTH dates for row rendering.
- **Resize hook:** `apps/web/core/components/gantt-chart/helpers/blockResizables/use-gantt-resizable.ts` — handles block drag/resize. Resize detection is based on cursor position near block edges.
- **HW block components:** `apps/web/hw/components/gantt-chart/blocks/` — enterprise block rendering with conflict indicators. CE equivalents in `apps/web/ce/components/gantt-chart/blocks/`.
- **CPM store (from Phase 2):** `apps/web/hw/store/timeline/base-timeline.store.ts` — `getComputedDates(blockId)` returns `{ start_date, target_date } | null`.
- **Block height:** `apps/web/core/components/gantt-chart/constants.ts:7` — `BLOCK_HEIGHT = 44`.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Extend `IGanttBlock` with `dateSource` property

**Verifies:** cpm-critical-path.AC3.2

**Files:**

- Modify: `packages/types/src/layout/gantt.ts`

**Implementation:**

Add `dateSource` to the `IGanttBlock` interface:

```typescript
export interface IGanttBlock {
  data: any;
  id: string;
  name: string;
  position?: {
    marginLeft: number;
    width: number;
  };
  sort_order: number | undefined;
  start_date: string | undefined;
  target_date: string | undefined;
  meta?: Record<string, any>;
  dateSource?: "manual" | "computed";
}
```

This is a non-breaking addition — `dateSource` is optional and defaults to `undefined`, which existing code treats identically to `"manual"`.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add dateSource property to IGanttBlock interface`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Inject computed dates in `updateBlocks` pipeline

**Verifies:** cpm-critical-path.AC3.1, cpm-critical-path.AC3.2, cpm-critical-path.AC3.6, cpm-critical-path.AC3.7

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

In the `updateBlocks` method (line 245), after the block object is constructed (line 256-268) and before position calculation (line 269-271), add computed date injection:

```typescript
// After block construction at line 268, before position calculation
// Inject computed dates for dateless blocks when CPM is enabled
if (this.cpmEnabled && !block.start_date && !block.target_date) {
  const computedDates = this.getComputedDates(blockId);
  if (computedDates) {
    block.start_date = computedDates.start_date;
    block.target_date = computedDates.target_date;
    block.dateSource = "computed";
  }
}
```

This placement ensures:

- Computed dates are injected BEFORE `getItemPositionWidth()` runs (line 270), so positions are calculated correctly.
- Only dateless blocks are affected — blocks with any manual date keep their original dates.
- When `cpmEnabled` is false, no injection occurs and dateless blocks remain dateless (AC3.7).
- Dateless blocks not in any dependency chain get `null` from `getComputedDates`, so they remain hidden (AC3.6).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): inject CPM computed dates into dateless blocks`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Update drag handler for computed-to-manual conversion

**Verifies:** cpm-critical-path.AC3.4, cpm-critical-path.AC3.5

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

In `getUpdatedPositionAfterDrag` (line 352-373), modify the date update conditions to always set both dates when a computed-date block is dragged. Currently, lines 360 and 366 only update dates that already exist. For computed-date blocks, both dates should always be set (converting to manual):

```typescript
getUpdatedPositionAfterDrag = action((id: string, shouldUpdateHalfBlock: boolean) => {
  const currBlock = this.blocksMap[id];

  if (!currBlock?.position || !this.currentViewData) return [];

  const updatePayload: IBlockUpdateDependencyData = { id, meta: currBlock.meta };
  const isComputedBlock = currBlock.dateSource === "computed";

  // Computed blocks always get both dates set (converts to manual)
  if (shouldUpdateHalfBlock || currBlock.start_date || isComputedBlock) {
    updatePayload.start_date = renderFormattedPayloadDate(
      getDateFromPositionOnGantt(currBlock.position.marginLeft, this.currentViewData)
    );
  }
  if (shouldUpdateHalfBlock || currBlock.target_date || isComputedBlock) {
    updatePayload.target_date = renderFormattedPayloadDate(
      getDateFromPositionOnGantt(currBlock.position.marginLeft + currBlock.position.width, this.currentViewData, -1)
    );
  }

  return [updatePayload];
});
```

For resize prevention (AC3.5), modify the resize hook at `apps/web/core/components/gantt-chart/helpers/blockResizables/use-gantt-resizable.ts`. This hook uses a `dragDirection` parameter (`"left"` | `"right"` | `"move"`) to distinguish resize from move. The `"left"` and `"right"` directions correspond to edge resizing; `"move"` corresponds to dragging the block.

In the `handleMouseMove` handler inside `use-gantt-resizable.ts`, add a guard at the top of the resize branches. When `dragDirection` is `"left"` or `"right"` and the block has `dateSource === "computed"`, return early (skip the resize logic):

```typescript
if ((dragDirection === "left" || dragDirection === "right") && block?.dateSource === "computed") {
  return;
}
```

Place this check inside `handleMouseMove` before the existing `dragDirection` switch/if-else dispatching. This allows computed blocks to be drag-moved but prevents resize.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): handle drag-to-manual conversion for computed-date blocks`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Computed-date block styling

**Verifies:** cpm-critical-path.AC3.3

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx` — `IssueGanttBlock` renders the styled task bar content. This is the correct target for visual styling (NOT `block.tsx`, which is the outer positioning container `GanttChartBlock`).
- Create: `apps/web/hw/components/gantt-chart/blocks/computed-date-indicator.tsx` — HW "auto" badge
- Create: `apps/web/ce/components/gantt-chart/blocks/computed-date-indicator.tsx` — CE stub (returns null)

**Implementation:**

`IssueGanttBlock` in `blocks.tsx` receives `issueId` as a prop (NOT a `block` object). To access `dateSource`, the component needs to look up the block from the timeline store:

```typescript
// In IssueGanttBlock, access the block via the timeline store
const { blocksMap } = useTimeLineChartStore();
const block = blocksMap[issueId];
const isComputedDate = block?.dateSource === "computed";
```

Apply conditional styling to the task bar div inside `IssueGanttBlock`:

```typescript
<div
  className={cn(
    // ... existing classes
    {
      "opacity-80 border-dashed border border-custom-border-300 rounded": isComputedDate,
    }
  )}
>
```

The dashed border and 80% opacity distinguish computed blocks visually. The implementor should verify the exact Tailwind classes match the project's existing bar styling and adjust if needed.

For the "auto" badge icon, create an HW overlay component:

**`hw/components/gantt-chart/blocks/computed-date-indicator.tsx`:**

```typescript
import { observer } from "mobx-react";

type Props = {
  isComputedDate: boolean;
};

export const ComputedDateIndicator = observer(function ComputedDateIndicator({ isComputedDate }: Props) {
  if (!isComputedDate) return null;

  return (
    <span className="absolute -top-1 -left-1 text-[10px] leading-none bg-custom-background-100 text-custom-text-300 rounded px-0.5">
      auto
    </span>
  );
});
```

**`ce/components/gantt-chart/blocks/computed-date-indicator.tsx`:**

```typescript
type Props = {
  isComputedDate: boolean;
};

export function ComputedDateIndicator(_props: Props) {
  return null;
}
```

Import from `@/plane-web/components/gantt-chart/blocks/computed-date-indicator` in `IssueGanttBlock` and render inside the task bar.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add computed-date block styling (dashed border, opacity, auto badge)`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Update block visibility filters

**Verifies:** cpm-critical-path.AC3.1, cpm-critical-path.AC3.7

**Files:**

- Modify: `apps/web/core/components/gantt-chart/blocks/block-row.tsx`

**Implementation:**

The visibility filter at `block-row.tsx:75` currently hides blocks without both `start_date` and `target_date` (unless `showAllBlocks` is true):

```typescript
if (!block || !block.data || (!showAllBlocks && !(block.start_date && block.target_date))) return null;
```

This filter already works correctly for computed-date blocks because Task 2 injects `start_date` and `target_date` into the block object before it reaches the rendering pipeline. The injected dates satisfy both the `block.tsx:68` check (`block?.start_date || block?.target_date`) and the `block-row.tsx:75` check (`block.start_date && block.target_date`).

**No code changes needed for visibility.** The injection in `updateBlocks` (Task 2) handles this transparently. When CPM is toggled off, the injection stops, the block loses its dates, and the existing filters hide it again (AC3.7).

However, verify this by reading through the render path to confirm no other filters block dateless blocks. If additional filters exist (e.g., in the `GanttBlocksList` component or parent containers), they may also need the `dateSource` check.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** No commit needed — verification only. If any filter changes are required, commit with `fix(gantt): update block visibility filters for computed-date blocks`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Tests for virtual date injection

**Verifies:** cpm-critical-path.AC3.1, cpm-critical-path.AC3.2, cpm-critical-path.AC3.3, cpm-critical-path.AC3.4, cpm-critical-path.AC3.5, cpm-critical-path.AC3.6, cpm-critical-path.AC3.7

**Files:**

- Create: `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts`

**Testing:**

Create tests for the virtual date injection behaviour. Reuse or extend the mock store structure from the Phase 2 CPM store tests (`cpm-store.test.ts`).

Tests must verify each AC:

- **cpm-critical-path.AC3.1:** Set up store with `cpmEnabled = true`, a dated block A and a dateless block B where A→B (FS). After `updateBlocks()`, block B should have position values (marginLeft, width) matching the CPM-computed dates.

- **cpm-critical-path.AC3.2:** Same setup — after `updateBlocks()`, block B should have `dateSource: "computed"` and block A should have `dateSource` as `undefined` (manual).

- **cpm-critical-path.AC3.3:** Verify the block object with `dateSource: "computed"` has the expected properties that styling components consume. This is primarily a structural test — the component renders dashed border based on `dateSource`.

- **cpm-critical-path.AC3.4:** After a computed block exists, call `getUpdatedPositionAfterDrag` on it. Verify the returned payload includes BOTH `start_date` and `target_date` (converts to manual).

- **cpm-critical-path.AC3.5:** Verify that the resize guard is present — for a block with `dateSource: "computed"`, the resize handler does not produce resize operations. The exact mechanism depends on how `use-gantt-resizable.ts` exposes resize vs move.

- **cpm-critical-path.AC3.6:** Set up a dateless block C with NO dependencies. After `updateBlocks()`, block C should have no `start_date`, no `target_date`, and no `dateSource`.

- **cpm-critical-path.AC3.7:** With CPM enabled, verify computed blocks exist. Toggle `cpmEnabled = false`, call `updateBlocks()` again. Verify the previously computed block now has no dates and no position.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-virtual-dates.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add virtual date injection tests`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 7-8) -->

<!-- START_TASK_7 -->

### Task 7: CE stubs for virtual date injection

**Verifies:** None (infrastructure)

**Files:**

- Verify: `apps/web/ce/store/timeline/base-timeline.store.ts` — CE store already has `getComputedDates` returning `null` (from Phase 2 Task 4). Confirm no additional changes needed.

**Implementation:**

The CE store already stubs `getComputedDates` to return `null` and `cpmEnabled` to `false`. Since the injection logic in `updateBlocks` (Task 2) is in the HW store and is guarded by `this.cpmEnabled`, and the CE store's `cpmEnabled` is always `false`, no injection ever occurs in CE builds.

Verify that no CE-specific changes are needed by running type checks.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** No commit needed — CE stubs already in place from Phase 2. If any adjustments are required, commit with `feat(gantt): update CE stubs for virtual date injection`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC3.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run virtual date injection tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-virtual-dates.test.ts

# Run CPM store tests (no regressions from Phase 2)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts

# Run CPM calculator tests (no regressions from Phase 1)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts

# Type check the web app
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_D -->
