# Dependency Visualization and Date Propagation — Phase 6: Client-Side Preview and Reconciliation

**Goal:** Show real-time preview of cascading date changes during gantt block drag, and reconcile with server-authoritative results on drop.

**Architecture:** During a gantt block drag, the timeline store's `getUpdatedPositionAfterDrag` is extended to walk the dependency graph and compute preview positions for all downstream dependents. Preview blocks render with reduced opacity. On drop, the primary change is sent to the server, which returns `updated_dependents`. The frontend reconciles preview positions with server-authoritative dates via the existing `updateIssueDates` batch update pattern. The `updateBlockPosition` method is extended to cascade position updates to dependent blocks in real-time.

**Tech Stack:** TypeScript, React, MobX, SVG

**Scope:** 7 phases from original design (phase 6 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC6: Client-side preview and reconciliation

- **dep-viz-propagation.AC6.1 Success:** During gantt block drag, downstream dependent blocks show preview positions (shifted) in real-time
- **dep-viz-propagation.AC6.2 Success:** Preview blocks render with reduced opacity to distinguish from committed state
- **dep-viz-propagation.AC6.3 Success:** Dependency connector lines update in real-time as the source block is dragged
- **dep-viz-propagation.AC6.4 Success:** On drop, server-authoritative dates replace preview positions — zero visual jank when server matches preview
- **dep-viz-propagation.AC6.5 Edge:** When server result differs from preview (concurrent edit changed the graph), blocks snap to server-authoritative positions
- **dep-viz-propagation.AC6.6 Edge:** If the dragged issue has no downstream dependents, drag works identically to current behaviour (no preview, no regression)

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Add preview state and dependency graph traversal to timeline store

**Verifies:** dep-viz-propagation.AC6.1, dep-viz-propagation.AC6.6

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts` (add preview-related observables and methods)

**Implementation:**

Add new observables and methods to the timeline store:

New observable:

```typescript
previewBlockIds: Set<string> = new Set();
```

This tracks which block IDs are currently showing preview positions (used by the block component for opacity treatment).

New method — `computePreviewPositions(draggedBlockId: string)`:

1. From the relation store's `relationMap`, find all downstream dependents of `draggedBlockId` by following scheduling dependency types
2. For each dependent, compute its new position using the same FS/SS/FF rules as the server:
   - **FS (blocking):** successor marginLeft = predecessor marginLeft + predecessor width + dayWidth (one day gap)
   - **SS (start_before):** successor marginLeft = predecessor marginLeft
   - **FF (finish_before):** successor right edge = predecessor right edge
3. If the dependent has multiple predecessors, take the maximum (latest) constraint
4. Update `blocksMap` positions for each dependent via `updateBlockPosition`
5. Add each dependent to `previewBlockIds`
6. For dependents that themselves have dependents, recurse (respecting depth limit of 100)
7. If no dependents exist, do nothing (dep-viz-propagation.AC6.6)

This method is called from the `handleMouseMove` handler in `use-gantt-resizable.ts` after `updateBlockPosition` updates the primary block.

New method — `clearPreviewPositions()`:

1. Clear `previewBlockIds` set
2. Called on drag end, before reconciliation with server data

Extend `getUpdatedPositionAfterDrag` to return updates for ALL affected blocks (primary + preview blocks):

```typescript
// Current: returns [{ id, start_date?, target_date? }] for just the dragged block
// Extended: also includes all preview blocks with their computed dates
```

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add dependency-aware preview position computation to timeline store`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add visual preview treatment to blocks

**Verifies:** dep-viz-propagation.AC6.2, dep-viz-propagation.AC6.3

**Files:**

- Modify: `apps/web/core/components/gantt-chart/blocks/block.tsx` (add opacity treatment for preview blocks)

**Why this modifies a core file:** This follows the established codebase pattern where core gantt components read state from the timeline store (which is already HW-specific via `useTimeLineChartStore`). The `block.tsx` file already imports from `@/hooks/use-timeline-chart` (line 16). The `previewBlockIds` observable only populates in HW mode — CE has an empty set, so the opacity treatment never triggers. No CE stub needed; the code is inherently safe.

**Implementation:**

In the block component (`block.tsx`), add a check against the timeline store's `previewBlockIds`:

1. Read `previewBlockIds` from the timeline store (via `useTimeLineChartStore()` hook)
2. If the current block's ID is in `previewBlockIds`, apply:
   - `opacity-50` CSS class to the block wrapper
   - `transition-all duration-150` for smooth position animation
3. If the block is NOT in `previewBlockIds`, render normally

The opacity treatment distinguishes preview positions from committed state (dep-viz-propagation.AC6.2).

The connector lines from Phase 3 (`TimelineDependencyPaths`) automatically update because they read block positions from `blocksMap`, which is already updated by `computePreviewPositions` (dep-viz-propagation.AC6.3).

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add reduced opacity visual treatment for dependency preview blocks`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Integrate preview computation into drag handler

**Verifies:** dep-viz-propagation.AC6.1, dep-viz-propagation.AC6.6

**Files:**

- Modify: `apps/web/core/components/gantt-chart/helpers/blockResizables/use-gantt-resizable.ts` (call preview computation during drag)

**Why this modifies a core file:** The drag handler already calls `updateBlockPosition` and `getUpdatedPositionAfterDrag` on the timeline store. Adding `computePreviewPositions` follows the same pattern. The HW timeline store implements this method; the CE timeline store must also have it (it can be a no-op). Ensure the CE base-timeline.store has `computePreviewPositions` as an empty method and `clearPreviewPositions` as an empty method. This is safe because calling a no-op has no effect.

**Implementation:**

In the `handleMouseMove` handler (after `updateBlockPosition` is called at line 112), add a call to `computePreviewPositions(block.id)` on the timeline store. This cascades position updates to all downstream dependents in real-time.

In the `handleMouseUp` handler (line 115-136), add `clearPreviewPositions()` call before the date update is sent to the server.

The `getUpdatedPositionAfterDrag` call already returns the primary block's updates. Extend the `updateBlockDates` callback to also include the preview block updates:

1. Call `getUpdatedPositionAfterDrag(block.id, shouldUpdateHalfBlock)` — now returns updates for primary + dependent blocks
2. Pass all updates to `updateBlockDates`
3. Clear preview state

If the dragged block has no dependents, `computePreviewPositions` returns immediately and `getUpdatedPositionAfterDrag` returns only the primary update — same as current behaviour (dep-viz-propagation.AC6.6).

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): integrate dependency preview into drag handler`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: Process updated_dependents from API response

**Verifies:** dep-viz-propagation.AC6.4, dep-viz-propagation.AC6.5

**Files:**

- Modify: `apps/web/core/store/issue/helpers/base-issues.store.ts` (process `updated_dependents` in issue update response)

**Why this modifies a core file:** The `updateIssueDates` method is where the API response is processed. The `updated_dependents` field is checked with optional chaining (`if (response.updated_dependents)`) — when absent (non-propagation updates or CE mode), the code is a no-op. This is safe for all editions.

**Implementation:**

In the `updateIssueDates` method (or the issue patch handler), process the `updated_dependents` field from the API response:

1. After the API call succeeds, check if `response.updated_dependents` exists (use optional chaining — the field is absent for non-date updates and in CE mode)
2. If it does, update each dependent issue in the store:
   ```typescript
   runInAction(() => {
     for (const dep of response.updated_dependents) {
       this.rootIssueStore.issues.updateIssue(dep.id, {
         start_date: dep.start_date,
         target_date: dep.target_date,
       });
     }
   });
   ```
3. Update the timeline store's `blocksMap` with the server-authoritative positions:
   - For each dependent, recompute the block position from the server dates using `getItemPositionWidth`
   - Update `blocksMap[dep.id].position` with the computed position
   - Update `blocksMap[dep.id].start_date` and `blocksMap[dep.id].target_date`

This reconciliation ensures:

- **dep-viz-propagation.AC6.4:** If server dates match preview, the blocks are already in the correct position — zero visual jank
- **dep-viz-propagation.AC6.5:** If server dates differ (concurrent edit), blocks snap to the server-authoritative positions

The reconciliation happens in a single `runInAction` for atomic UI update.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(web): process updated_dependents from API for server-authoritative reconciliation`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Tests for preview and reconciliation

**Verifies:** dep-viz-propagation.AC6.1, dep-viz-propagation.AC6.4, dep-viz-propagation.AC6.5, dep-viz-propagation.AC6.6

**Files:**

- Create: `apps/web/hw/store/timeline/preview-positions.test.ts`

**Testing:**

Tests for the preview position computation and reconciliation:

- **dep-viz-propagation.AC6.1 (preview positions):** Set up blocks A→B (blocking) in the store. Call `computePreviewPositions("A")` after moving A. Verify B's position in `blocksMap` shifted accordingly.
- **dep-viz-propagation.AC6.6 (no dependents):** Set up block A with no dependents. Call `computePreviewPositions("A")`. Verify `previewBlockIds` is empty and no blocks changed.
- **dep-viz-propagation.AC6.4 (reconciliation match):** Set up preview state for B with start_date=Jan 14. Process `updated_dependents` with B's start_date=Jan 14. Verify position unchanged (zero jank).
- **dep-viz-propagation.AC6.5 (reconciliation mismatch):** Set up preview state for B with start_date=Jan 14. Process `updated_dependents` with B's start_date=Jan 16. Verify B's position snaps to Jan 16.
- **clearPreviewPositions:** Verify calling it empties `previewBlockIds`.

Use MobX observable setup with mock blocks and relations. Use `vi.mock` for services.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(gantt): add tests for dependency preview computation and server reconciliation`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (task 6) -->

<!-- START_TASK_6 -->

### Task 6: Add CE timeline store stubs for preview methods

**Verifies:** No regressions in CE mode

**Files:**

- Modify: `apps/web/ce/store/timeline/base-timeline.store.ts` (add no-op stubs for preview methods)

**Implementation:**

Tasks 2 and 3 modify core files (`block.tsx` and `use-gantt-resizable.ts`) that call `previewBlockIds`, `computePreviewPositions`, and `clearPreviewPositions` on the timeline store. The CE timeline store must have no-op stubs for these methods to prevent runtime errors in CE mode.

Add to the CE timeline store:

```typescript
previewBlockIds: Set<string> = new Set();

computePreviewPositions(_blockId: string): void {}

clearPreviewPositions(): void {}
```

Make `previewBlockIds` an `observable` and both methods `action` in the MobX decorators.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors across both CE and HW.

**Commit:** `chore(gantt): add CE timeline store stubs for preview methods`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
