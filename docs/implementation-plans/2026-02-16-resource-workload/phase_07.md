# Resource Workload Implementation Plan — Phase 7

**Goal:** CPM-aware analysis that identifies non-critical tasks that could be delayed to relieve overallocation. Stretch goal.

**Architecture:** A pure function in `apps/web/hw/helpers/allocation-analyzer.ts` following the exact pattern of `detectDependencyConflicts` in `dependency-conflict.ts`. The function takes CPM results, allocation data, and a blocks map, returning structured levelling suggestions. Wrapped in `computedFn` on the timeline store for MobX memoisation. Suggestion indicator rendered on Gantt blocks. CE stubs return safe defaults.

**Tech Stack:** TypeScript (pure functions), MobX (computedFn from mobx-utils), React, TailwindCSS

**Scope:** 7 phases from original design (this is phase 7 of 7 — stretch goal)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### resource-workload.AC7: Levelling suggestions (stretch)

- **resource-workload.AC7.1 Success:** Tasks with positive CPM slack assigned to overallocated members are identified
- **resource-workload.AC7.2 Success:** Suggestions include a delay date within the task's float window
- **resource-workload.AC7.3 Success:** Gantt blocks with levelling suggestions show a visual indicator
- **resource-workload.AC7.4 Edge:** Tasks on the critical path (zero slack) are never suggested for delay
- **resource-workload.AC7.5 Edge:** Levelling function returns empty results when no overallocation exists

---

## Key codebase references

- Pure function pattern: `apps/web/hw/helpers/dependency-conflict.ts` (input types, pure function, structured output)
- CPM types: `apps/web/hw/helpers/cpm-calculator.ts:27-36` — `CpmResult { es, ef, ls, lf, slack, isCritical }`, `CpmResultMap = Map<string, CpmResult>`
- computedFn: imported from `mobx-utils` (base-timeline.store.ts:10)
- getDependencyConflicts pattern: `apps/web/hw/store/timeline/base-timeline.store.ts:848-884`
- Existing test pattern: `apps/web/hw/helpers/cpm-calculator.test.ts`, `dependency-conflict.test.ts`
- Block assignee access: `block.data.assignee_ids` (string[]) or via `rootStore.issue.issueDetail.issue.getIssueById(id).assignee_ids`
- ConflictInfo output type: `{ predecessorIssueId, relationType, message }`

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Levelling analysis pure function

**Verifies:** resource-workload.AC7.1, resource-workload.AC7.2, resource-workload.AC7.4, resource-workload.AC7.5

**Files:**

- Create: `apps/web/hw/helpers/allocation-analyzer.ts`

**Implementation:**

Create `apps/web/hw/helpers/allocation-analyzer.ts` following the exact pattern of `apps/web/hw/helpers/dependency-conflict.ts`:

**Types:**

```typescript
import type { CpmResultMap } from "./cpm-calculator";

export type AllocationConflict = {
  memberId: string;
  dateRange: { start: string; end: string };
  allocatedEffort: number;
  capacity: number;
  contributingIssueIds: string[];
};

export type LevellingSuggestion = {
  issueId: string;
  action: "delay";
  reason: string;
  suggestedDate: string;
  slackAvailable: number;
};
```

**Function:**

```typescript
export function analyzeLevelling(
  cpmResults: CpmResultMap,
  memberAllocations: Array<{
    memberId: string;
    totalHours: number;
    capacityHours: number;
    status: string;
    issueIds: string[];
  }>,
  blocksMap: Record<string, { id: string; start_date?: string; target_date?: string; assignee_ids: string[] }>
): LevellingSuggestion[];
```

**Logic:**

1. Identify overallocated members: `status === "over"` from memberAllocations
2. For each overallocated member, find their assigned issues from `issueIds`
3. For each issue, look up CPM result from `cpmResults.get(issueId)`
4. **Skip critical path tasks**: if `cpmResult.isCritical === true` (slack === 0), never suggest for delay (AC7.4)
5. Sort remaining tasks by slack descending (most slack = best candidate for delay)
6. For the top candidates, compute a suggested delay date:
   - `suggestedDate = cpmResult.ls` (late start — the latest the task can start without affecting project end date) (AC7.2)
   - `slackAvailable = cpmResult.slack` (days of float)
7. Generate `LevellingSuggestion` for each candidate with:
   - `action: "delay"`
   - `reason: "Member [name] is overallocated. This task has [N] days of float."`
   - `suggestedDate: cpmResult.ls`
   - `slackAvailable: cpmResult.slack`
8. Return empty array when no overallocation exists (AC7.5)

Pure function — no side effects, no store access, no async. Operates entirely on the data passed in.

**Verification:**
Run: Tests (created in Task 2)
Expected: All tests pass

**Commit:** `feat(hw): add analyzeLevelling pure function for CPM-aware resource levelling`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Levelling analysis unit tests

**Verifies:** resource-workload.AC7.1, resource-workload.AC7.2, resource-workload.AC7.4, resource-workload.AC7.5

**Files:**

- Create: `apps/web/hw/helpers/allocation-analyzer.test.ts`

**Implementation:**

Create test file following the pattern of `apps/web/hw/helpers/cpm-calculator.test.ts` and `dependency-conflict.test.ts`.

**Testing:**

- AC7.1: Create a scenario with an overallocated member (>100% utilisation) and non-critical tasks — verify the function identifies them as levelling candidates
- AC7.2: Verify the suggested date equals the task's late start (ls) from CPM results, and slackAvailable matches CPM slack
- AC7.4: Include a critical path task (slack === 0, isCritical === true) assigned to an overallocated member — verify it is NOT included in suggestions
- AC7.5: Create a scenario where no member is overallocated — verify function returns empty array
- Edge: Member with one critical task and one non-critical task — only non-critical appears
- Edge: Multiple overallocated members — suggestions cover tasks for all of them
- Edge: Task with no CPM result (not in the CPM graph) — skip gracefully

Use `describe`/`it` pattern consistent with existing test files in the helpers directory. No mocking — these are pure function tests with constructed input data.

**Verification:**
Run: Test runner for frontend helper tests (check existing test config — likely Vitest)
Expected: All tests pass

**Commit:** `test(hw): add unit tests for analyzeLevelling`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Timeline store levelling computed values

**Verifies:** resource-workload.AC7.1, resource-workload.AC7.3

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`
- Modify: `apps/web/ce/store/timeline/base-timeline.store.ts`

**Implementation:**

Add to the HW `BaseTimelineStore`, following the `getDependencyConflicts` pattern at line 848:

**`allLevellingSuggestions: Map<string, LevellingSuggestion[]>`** (computed, not computedFn)

- A single `computed` property that calls `analyzeLevelling()` once with the full data set
- If CPM not enabled or workload data not loaded, returns empty Map
- Calls `analyzeLevelling()` with `this.cpmResults`, `this.rootStore.workloadStore.memberAllocations`, `this.blocksMap`
- Groups the returned suggestions by `issueId` into a `Map<string, LevellingSuggestion[]>`
- MobX recomputes this once when any input changes, not per-block

**`getLevellingSuggestions(blockId: string): LevellingSuggestion[]`**

- Uses `computedFn` (imported from `mobx-utils`)
- Returns `this.allLevellingSuggestions.get(blockId) ?? []`
- Cheap lookup — the expensive analysis runs once in `allLevellingSuggestions`

**`hasLevellingSuggestion(blockId: string): boolean`**

- `computedFn` — returns `this.getLevellingSuggestions(blockId).length > 0`

**CE stubs**:

- `getLevellingSuggestions(blockId: string): []` — always returns empty array
- `hasLevellingSuggestion(blockId: string): false` — always returns false

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add levelling suggestion computed values to timeline store`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->

### Task 4: Levelling suggestion indicator on Gantt blocks

**Verifies:** resource-workload.AC7.3

**Files:**

- Create: `apps/web/hw/components/gantt-chart/blocks/levelling-indicator.tsx`
- Create: `apps/web/ce/components/gantt-chart/blocks/levelling-indicator.tsx`
- Modify: Core block renderer to include indicator

**Implementation:**

**HW component** following `conflict-indicator.tsx` pattern:

`LevellingIndicator` is an `observer` component:

- Props: `blockId: string`
- Gets timeline store, calls `store.hasLevellingSuggestion(blockId)`
- If no suggestion, renders nothing
- If suggestion exists, renders a small indicator icon (e.g., a small arrow or clock icon) with a distinct colour (e.g., blue/purple to distinguish from allocation red/amber/green)
- Tooltip on hover shows: "This task can be delayed by [N] days to relieve overallocation"
- Click opens detail showing the full suggestion (member name, suggested date, slack available)

**CE stub**: Returns `null`.

**Integration**: In `apps/web/core/components/gantt-chart/blocks/block.tsx`, import `LevellingIndicator` from `@/plane-web/components/gantt-chart/blocks/levelling-indicator` and render alongside existing indicators.

**Verification:**
Run: `pnpm check:types` from repo root
Expected: TypeScript compilation succeeds

**Commit:** `feat(hw): add LevellingIndicator to Gantt blocks with CE stub`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Run full checks

**Files:** None (verification only)

**Implementation:**

```bash
pnpm check:types
pnpm check:lint
pnpm check:format
```

Also run the helper tests:

```bash
# Run allocation analyzer tests (check exact test runner command for frontend)
pnpm turbo run test --filter=web
```

**Verification:**
Expected: All checks pass, all tests pass

**Commit:** No commit — verification only.

<!-- END_TASK_5 -->
