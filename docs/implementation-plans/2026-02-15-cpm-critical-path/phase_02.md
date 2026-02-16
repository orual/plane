# CPM Critical Path — Phase 2: CPM Store Integration

**Goal:** Wire the CPM calculator into the MobX timeline store as reactive computed values.

**Architecture:** Add observable toggle state, a computed `cpmResults` value, and per-block `computedFn` accessors to the existing `BaseTimeLineStore` class. Follows the exact same pattern as `getDependencyConflicts`/`hasConflict`. CE stubs return empty/false.

**Tech Stack:** TypeScript, MobX, mobx-utils (`computedFn`), Vitest

**Scope:** 7 phases from original design (phase 2 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC2: CPM store integration

- **cpm-critical-path.AC2.1 Success:** `cpmResults` recomputes when a block's dates change
- **cpm-critical-path.AC2.2 Success:** `cpmResults` recomputes when a relation is added or removed
- **cpm-critical-path.AC2.3 Success:** `isCritical(blockId)` returns true for zero-slack blocks and false otherwise
- **cpm-critical-path.AC2.4 Success:** `getSlack(blockId)` returns correct float in days
- **cpm-critical-path.AC2.5 Success:** When `cpmEnabled` is false, `cpmResults` returns empty map without computing
- **cpm-critical-path.AC2.6 Edge:** Changing a single block only re-renders blocks whose CPM values actually changed (memoisation)

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **Timeline store (HW):** `apps/web/hw/store/timeline/base-timeline.store.ts` — existing `BaseTimeLineStore` class with `getDependencyConflicts`, `hasConflict` as pattern references. `computedFn` from `mobx-utils` (imported at line 10). Toggle pattern: `isDependencyEnabled = false` (line 110). `blocksMap` is `observable`. Relation data accessed via `this.rootStore.issue.issueDetail.relation.relationMap`.
- **Timeline store (CE):** `apps/web/ce/store/timeline/base-timeline.store.ts` — CE stub class with empty/false returns for computed methods.
- **Store registration:** `apps/web/hw/store/timeline/index.ts` — `TimeLineStore` class instantiates `BaseTimeLineStore` instances.
- **CPM calculator (from Phase 1):** `apps/web/hw/helpers/cpm-calculator.ts` — exports `computeCpm`, `CpmResult`, `CpmResultMap`.
- **CE CPM stub (from Phase 1):** `apps/web/ce/helpers/cpm-calculator.ts` — exports same types + no-op `computeCpm`.
- **Existing test pattern:** `apps/web/hw/helpers/dependency-conflict.test.ts` — Vitest, colocated tests.
- **MobX observable pattern:** `computedFn` properties are assigned directly on the class (NOT registered in `makeObservable`). Toggle properties use `observable` annotation, toggle setters use `action` annotation.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Add CPM toggle state and `cpmResults` computed to `BaseTimeLineStore`

**Verifies:** cpm-critical-path.AC2.5

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

Add the following to `BaseTimeLineStore`:

1. **New observable properties:**

```typescript
cpmEnabled = false;
crossProjectCpmEnabled = false;
```

Register in `makeObservable`:

```typescript
cpmEnabled: observable,
crossProjectCpmEnabled: observable,
```

2. **Toggle actions:**

```typescript
setCpmEnabled(enabled: boolean): void {
  this.cpmEnabled = enabled;
}

setCrossProjectCpmEnabled(enabled: boolean): void {
  this.crossProjectCpmEnabled = enabled;
}
```

Register in `makeObservable`:

```typescript
setCpmEnabled: action,
setCrossProjectCpmEnabled: action,
```

3. **`cpmResults` as a MobX `computed` value:**

This is a standard `get` computed (NOT `computedFn`) because it operates on the entire graph, not per-block. Register it as `computed` in `makeObservable`.

```typescript
get cpmResults(): CpmResultMap {
  if (!this.cpmEnabled) return new Map();

  const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;
  const getIssueDates = (id: string) => {
    const block = this.blocksMap[id];
    if (!block) return undefined;
    return {
      start_date: block.start_date,
      target_date: block.target_date,
    };
  };

  return computeCpm(relationMap, getIssueDates);
}
```

Register in `makeObservable`:

```typescript
cpmResults: computed,
```

Import at top of file:

```typescript
import { computeCpm } from "@/plane-web/helpers/cpm-calculator";
import type { CpmResultMap } from "@/plane-web/helpers/cpm-calculator";
```

4. **Update the interface** (`IBaseTimelineStore` or equivalent) to include the new properties and methods. Check the existing interface declaration (likely in the same file or a types file) and add:

```typescript
cpmEnabled: boolean;
crossProjectCpmEnabled: boolean;
cpmResults: CpmResultMap;
setCpmEnabled(enabled: boolean): void;
setCrossProjectCpmEnabled(enabled: boolean): void;
```

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CPM toggle and cpmResults computed to timeline store`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add per-block `computedFn` accessors

**Verifies:** cpm-critical-path.AC2.3, cpm-critical-path.AC2.4, cpm-critical-path.AC2.6

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

Add three `computedFn` properties following the exact pattern of `getDependencyConflicts` and `hasConflict`. These are assigned directly on the class body (NOT registered in `makeObservable`).

1. **`isCritical`** — per-block check for zero slack:

```typescript
isCritical = computedFn((blockId: string): boolean => {
  const result = this.cpmResults.get(blockId);
  return result?.isCritical ?? false;
});
```

2. **`getSlack`** — per-block float in days:

```typescript
getSlack = computedFn((blockId: string): number => {
  const result = this.cpmResults.get(blockId);
  return result?.slack ?? 0;
});
```

3. **`getComputedDates`** — returns virtual dates for dateless blocks that have CPM results, `null` for dated blocks or blocks not in CPM:

```typescript
getComputedDates = computedFn((blockId: string): { start_date: string; target_date: string } | null => {
  const block = this.blocksMap[blockId];
  if (!block) return null;
  if (block.start_date && block.target_date) return null;

  const result = this.cpmResults.get(blockId);
  if (!result) return null;

  return { start_date: result.es, target_date: result.ef };
});
```

4. **Update the interface** to include:

```typescript
isCritical(blockId: string): boolean;
getSlack(blockId: string): number;
getComputedDates(blockId: string): { start_date: string; target_date: string } | null;
```

**Why `computedFn`:** MobX's `computedFn` memoises per-argument. When `cpmResults` changes, only blocks whose individual CPM values actually differ will trigger re-renders. This directly satisfies AC2.6.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add per-block CPM accessors (isCritical, getSlack, getComputedDates)`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Tests for CPM store integration

**Verifies:** cpm-critical-path.AC2.1, cpm-critical-path.AC2.2, cpm-critical-path.AC2.3, cpm-critical-path.AC2.4, cpm-critical-path.AC2.5, cpm-critical-path.AC2.6

**Files:**

- Create: `apps/web/hw/store/timeline/cpm-store.test.ts`

**Testing:**

Create tests for the CPM store integration. Since `BaseTimeLineStore` depends on `rootStore` and MobX, the tests need to set up a minimal mock store structure.

Look at existing test patterns in the `hw/store/` directory first. If no store tests exist, create a lightweight approach:

- Instantiate `BaseTimeLineStore` with a mock `rootStore` that provides `issue.issueDetail.relation.relationMap`
- Populate `blocksMap` directly (it's observable)
- Trigger MobX reactions to verify reactivity

Tests must verify each AC:

- **cpm-critical-path.AC2.1:** Set `cpmEnabled = true`, populate `blocksMap` with dated blocks and relation map with dependencies, read `cpmResults` (should have entries). Change a block's `start_date` → `cpmResults` should reflect the new dates.

- **cpm-critical-path.AC2.2:** With CPM enabled, add a new relation to the relation map → `cpmResults` should include the new dependency in its calculation.

- **cpm-critical-path.AC2.3:** Build a graph where A→B→C is the critical path and A→D is a shorter branch. `isCritical("A")` returns true, `isCritical("D")` returns false.

- **cpm-critical-path.AC2.4:** Same graph — `getSlack("A")` returns 0, `getSlack("D")` returns a positive number matching the expected float.

- **cpm-critical-path.AC2.5:** With `cpmEnabled = false`, `cpmResults` returns an empty Map (size 0), regardless of blocks and relations in the store. `isCritical` returns false, `getSlack` returns 0.

- **cpm-critical-path.AC2.6:** This is a memoisation property — verify that `isCritical(blockId)` returns the same reference/value when called twice without changes to `cpmResults`. This can be tested by confirming `computedFn` is used (structural test) or by verifying that calling `isCritical` with the same argument twice doesn't re-execute the inner function.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add CPM store integration tests`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (task 4) -->

<!-- START_TASK_4 -->

### Task 4: Add drag debouncing for CPM recalculation

**Verifies:** None (performance infrastructure — design requirement: "compute once at drag start, suppress during, recompute on drop")

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

Add an observable flag to suppress CPM recalculation during drag operations:

1. **New observable:**

```typescript
isDraggingBlock = false;
```

Register in `makeObservable`:

```typescript
isDraggingBlock: observable,
```

2. **Actions to set drag state:**

```typescript
setDraggingBlock(dragging: boolean): void {
  this.isDraggingBlock = dragging;
}
```

Register in `makeObservable`:

```typescript
setDraggingBlock: action,
```

3. **Guard in `cpmResults` computed** — add at the top of the `cpmResults` getter, after the `cpmEnabled` check:

```typescript
get cpmResults(): CpmResultMap {
  if (!this.cpmEnabled) return new Map();
  if (this.isDraggingBlock) return this._lastCpmResults;
  // ... existing computation ...
  // Store result before returning:
  this._lastCpmResults = result;
  return result;
}
```

Add `_lastCpmResults` as a non-observable field (plain class property, not in `makeObservable`) to cache the last computed CPM results during drag.

4. **Update the interface** to include:

```typescript
isDraggingBlock: boolean;
setDraggingBlock(dragging: boolean): void;
```

The existing drag handling in the timeline store should call `setDraggingBlock(true)` at drag start and `setDraggingBlock(false)` at drag end. This wiring will happen in Phase 3 when integrating with the block drag system.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add drag debouncing for CPM recalculation`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: CE stub for CPM store properties

**Verifies:** None (infrastructure)

**Files:**

- Modify: `apps/web/ce/store/timeline/base-timeline.store.ts`

**Implementation:**

Add the same properties and methods to the CE version of `BaseTimeLineStore`, following the existing CE stub pattern:

1. **Observable properties:**

```typescript
cpmEnabled = false;
crossProjectCpmEnabled = false;
```

Register in `makeObservable`:

```typescript
cpmEnabled: observable,
crossProjectCpmEnabled: observable,
```

2. **Drag debouncing (no-op stub):**

```typescript
isDraggingBlock = false;
```

Register in `makeObservable`:

```typescript
isDraggingBlock: observable,
```

3. **Toggle and drag actions (no-op, but must exist for interface compatibility):**

```typescript
setCpmEnabled(_enabled: boolean): void {
  // CE: CPM not available
}

setCrossProjectCpmEnabled(_enabled: boolean): void {
  // CE: CPM not available
}

setDraggingBlock(_dragging: boolean): void {
  // CE: CPM not available
}
```

Register in `makeObservable`:

```typescript
setCpmEnabled: action,
setCrossProjectCpmEnabled: action,
setDraggingBlock: action,
```

4. **Computed value:**

```typescript
get cpmResults(): CpmResultMap {
  return new Map();
}
```

Register in `makeObservable`:

```typescript
cpmResults: computed,
```

Import:

```typescript
import type { CpmResultMap } from "@/plane-web/helpers/cpm-calculator";
```

5. **`computedFn` accessors:**

```typescript
isCritical = computedFn((_blockId: string): boolean => false);

getSlack = computedFn((_blockId: string): number => 0);

getComputedDates = computedFn((_blockId: string): { start_date: string; target_date: string } | null => null);
```

6. **Update the CE interface** to match the HW interface additions (including `isDraggingBlock` and `setDraggingBlock`).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CE stubs for CPM store properties`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC2.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run CPM store tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts

# Run CPM calculator tests (verify no regressions from Phase 1)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts

# Run all dependency-related helper tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/

# Type check the web app
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
