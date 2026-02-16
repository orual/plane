# CPM Critical Path — Phase 1: CPM Calculation Engine

**Goal:** Implement the core CPM algorithm as pure functions with comprehensive tests.

**Architecture:** Pure functional module with graph transposition, topological sort, forward pass, backward pass, and slack calculation. No store dependencies, no side effects. Follows the same pattern as `dependency-conflict.ts` and `dependency-validation.ts`.

**Tech Stack:** TypeScript, Vitest

**Scope:** 7 phases from original design (phase 1 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC1: CPM calculation engine

- **cpm-critical-path.AC1.1 Success:** Forward pass computes ES and EF for a linear FS chain (A→B→C) with correct date cascading
- **cpm-critical-path.AC1.2 Success:** Forward pass handles SS dependencies — successor ES matches predecessor ES
- **cpm-critical-path.AC1.3 Success:** Forward pass handles FF dependencies — successor EF matches predecessor EF
- **cpm-critical-path.AC1.4 Success:** Multi-predecessor resolution takes latest (max) constraint when multiple predecessors feed one successor
- **cpm-critical-path.AC1.5 Success:** Backward pass computes LS and LF with anchor derived from max(EF) across all leaf nodes
- **cpm-critical-path.AC1.6 Success:** Slack calculation returns zero for tasks on the critical path and positive values for non-critical tasks
- **cpm-critical-path.AC1.7 Success:** Dateless tasks in dependency chains receive 1-day duration in forward/backward pass
- **cpm-critical-path.AC1.8 Edge:** Graph with no dependencies returns empty CpmResultMap
- **cpm-critical-path.AC1.9 Edge:** Graph traversal stops at MAX_PROPAGATION_DEPTH (100 levels)
- **cpm-critical-path.AC1.10 Edge:** Issues with only one date (start or target, not both) use available date and compute the other from duration or default to 1 day

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **Existing helper pattern:** `apps/web/hw/helpers/dependency-conflict.ts` — pure function taking relation map and date lookup, same structure CPM calculator will follow
- **CE stub pattern:** `apps/web/ce/helpers/dependency-conflict.ts` — type-only exports, no implementation
- **Relation types:** `packages/types/src/issues/issue_relation.ts` — `TIssueRelationTypes`, `TIssueRelationMap`
- **Block types:** `packages/types/src/layout/gantt.ts` — `IGanttBlock` with `start_date: string | undefined`, `target_date: string | undefined`
- **Existing test pattern:** `apps/web/hw/helpers/dependency-conflict.test.ts` — Vitest, colocated, factory functions for test data, AC references in describe blocks
- **Test config:** `apps/web/vitest.config.ts` — jsdom, globals, path aliases configured
- **Depth limit pattern:** `apps/web/hw/helpers/dependency-validation.ts` line 48 — `const MAX_DEPTH = 100`. Our constant is named `MAX_PROPAGATION_DEPTH` for clarity; same value, different scope.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Create `cpm-calculator.ts` with types, graph transposition, and topological sort

**Verifies:** None (infrastructure for subsequent tasks)

**Files:**

- Create: `apps/web/hw/helpers/cpm-calculator.ts`

**Implementation:**

Create the CPM calculator module following the same pure-function pattern as `dependency-conflict.ts`. This task creates the foundational types, graph transposition utility, and topological sort.

The module needs:

1. **Output types:**

```typescript
type CpmResult = {
  es: string; // Early Start (ISO date string YYYY-MM-DD)
  ef: string; // Early Finish (ISO date string YYYY-MM-DD)
  ls: string; // Late Start (ISO date string YYYY-MM-DD)
  lf: string; // Late Finish (ISO date string YYYY-MM-DD)
  slack: number; // Total float in days
  isCritical: boolean; // slack === 0
};

type CpmResultMap = Map<string, CpmResult>;
```

2. **Input types:**

```typescript
type CpmIssueDates = {
  start_date: string | undefined;
  target_date: string | undefined;
};

// Adjacency list matching backend's dependency_graph.py shape
// predecessor_id -> [(successor_id, relation_type)]
type SchedulingEdge = {
  successorId: string;
  relationType: "blocking" | "start_before" | "finish_before";
};

type AdjacencyList = Map<string, Array<SchedulingEdge>>;
```

3. **Constants:**

```typescript
const MAX_PROPAGATION_DEPTH = 100;
const DEFAULT_DURATION_DAYS = 1;
```

4. **`buildAdjacencyList` function** — converts `TIssueRelationMap` into the `AdjacencyList`. Only scheduling relations participate:
   - `blocking` → FS edge from blocker to blocked issue
   - `blocked_by` → FS edge (reverse: the predecessor blocks the current issue)
   - `start_before` → SS edge
   - `start_after` → SS edge (reverse direction)
   - `finish_before` → FF edge
   - `finish_after` → FF edge (reverse direction)

   The tricky part: `TIssueRelationMap` is issue-centric (`{ issueA: { blocking: [issueB] } }` means A blocks B). We need predecessor→successor edges. So:
   - `issueA.blocking = [issueB]` means A is predecessor, B is successor (FS). Edge: A → B with type `blocking`.
   - `issueA.blocked_by = [issueB]` means B is predecessor, A is successor (FS). Edge: B → A with type `blocking`.
   - `issueA.start_before = [issueB]` means A starts before B (SS). Edge: A → B with type `start_before`.
   - `issueA.start_after = [issueB]` means B starts before A (SS). Edge: B → A with type `start_before`.
   - `issueA.finish_before = [issueB]` means A finishes before B (FF). Edge: A → B with type `finish_before`.
   - `issueA.finish_after = [issueB]` means B finishes before A (FF). Edge: B → A with type `finish_before`.

   Also build a reverse adjacency list (successor → predecessors) needed for backward pass and topological sort in-degree calculation.

5. **`topologicalSort` function** — Kahn's algorithm using in-degree counts. Takes the adjacency list and set of all issue IDs. Returns ordered array of issue IDs. If a cycle is detected (remaining nodes with non-zero in-degree), return only the acyclic portion (cycle detection is handled elsewhere by `dependency-validation.ts`).

All functions are pure — import types from `@plane/types`, export types and functions as named exports.

**Verification:**

```bash
cd apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors in cpm-calculator.ts

**Commit:** `feat(gantt): add CPM calculator types, graph transposition, and topological sort`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Tests for graph transposition and topological sort

**Verifies:** cpm-critical-path.AC1.8, cpm-critical-path.AC1.9

**Files:**

- Create: `apps/web/hw/helpers/cpm-calculator.test.ts`

**Testing:**

Create tests following the pattern in `dependency-conflict.test.ts`. Use factory functions for building test relation maps.

Tests must verify:

- **cpm-critical-path.AC1.8:** `buildAdjacencyList` with an empty relation map returns an empty adjacency list. `computeCpm` (when it exists) with no dependencies returns an empty `CpmResultMap`.
- **cpm-critical-path.AC1.9:** `topologicalSort` with a chain deeper than 100 levels stops processing at `MAX_PROPAGATION_DEPTH`.

Additional tests for `buildAdjacencyList`:

- FS relation (`blocking`/`blocked_by`) produces correct predecessor→successor edge
- SS relation (`start_before`/`start_after`) produces correct edge
- FF relation (`finish_before`/`finish_after`) produces correct edge
- Non-scheduling relations (`duplicate`, `relates_to`, `implemented_by`, `implements`) are excluded
- Multiple relations on a single issue produce multiple edges

Additional tests for `topologicalSort`:

- Linear chain A→B→C produces [A, B, C] order
- Diamond graph (A→B, A→C, B→D, C→D) produces valid topological order
- Graph with no edges returns all nodes (any order)

**Verification:**

```bash
cd apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add tests for CPM graph transposition and topological sort`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Forward pass implementation

**Verifies:** cpm-critical-path.AC1.1, cpm-critical-path.AC1.2, cpm-critical-path.AC1.3, cpm-critical-path.AC1.4, cpm-critical-path.AC1.7, cpm-critical-path.AC1.10

**Files:**

- Modify: `apps/web/hw/helpers/cpm-calculator.ts`

**Implementation:**

Add the `forwardPass` function. It takes:

- `sortedIds: ReadonlyArray<string>` — topologically sorted issue IDs
- `adjacencyList: AdjacencyList` — predecessor→successor edges
- `getIssueDates: (id: string) => CpmIssueDates | undefined` — date lookup
- Returns: `Map<string, { es: string; ef: string; duration: number }>` — early start, early finish, and computed duration for each issue

Algorithm:

1. For each issue in topological order:
   - Look up dates. Compute duration:
     - Both dates present: `duration = daysBetween(start_date, target_date)` (inclusive, so add 1)
     - Only start_date: `duration = DEFAULT_DURATION_DAYS`, `target_date = start_date + duration - 1`
     - Only target_date: `duration = DEFAULT_DURATION_DAYS`, `start_date = target_date - duration + 1`
     - Neither date: `duration = DEFAULT_DURATION_DAYS` (dates computed from predecessors)
   - Compute ES:
     - If issue has predecessors with edges into it, ES = max constraint across all predecessors based on edge type:
       - FS (`blocking`): predecessor EF + 1 day
       - SS (`start_before`): predecessor ES
       - FF (`finish_before`): predecessor EF - successor's duration + 1 (so successor EF aligns with predecessor EF)
     - If no predecessors: ES = issue's `start_date` (or computed start from target_date)
     - If dateless with no predecessors: skip (no anchor point — this issue won't be in CPM results)
   - ES must not be earlier than the issue's own `start_date` if it has one (explicit dates are minimum constraints)
   - Compute EF: `ES + duration - 1`
2. Store `{ es, ef, duration }` for each processed issue

Date arithmetic helper functions needed:

- `addDays(dateStr: string, days: number): string` — already exists in `dependency-conflict.ts` as a local; create a shared version
- `daysBetween(dateA: string, dateB: string): number` — returns number of days from A to B inclusive
- `maxDate(...dates: Array<string>): string` — returns the latest date
- `minDate(...dates: Array<string>): string` — returns the earliest date

**Verification:**

```bash
cd apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): implement CPM forward pass`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Forward pass tests

**Verifies:** cpm-critical-path.AC1.1, cpm-critical-path.AC1.2, cpm-critical-path.AC1.3, cpm-critical-path.AC1.4, cpm-critical-path.AC1.7, cpm-critical-path.AC1.10

**Files:**

- Modify: `apps/web/hw/helpers/cpm-calculator.test.ts`

**Testing:**

Add a `describe("forwardPass")` block. Tests must verify:

- **cpm-critical-path.AC1.1:** Linear FS chain A(Jan 1-3)→B(Jan 6-8)→C(Jan 10-12). Forward pass computes:
  - A: ES=Jan 1, EF=Jan 3
  - B: ES=Jan 4 (A.EF + 1), EF=Jan 6
  - C: ES=Jan 7 (B.EF + 1), EF=Jan 9
    Note: When predecessor constraint (Jan 4) is earlier than explicit date (Jan 6), use the explicit date as a minimum. The test should verify both cases.

- **cpm-critical-path.AC1.2:** SS chain: A(Jan 1-5) start_before B(Jan 1-3). B's ES = A's ES = Jan 1.

- **cpm-critical-path.AC1.3:** FF chain: A(Jan 1-5) finish_before B(Jan 1-3). B's EF = A's EF = Jan 5. B's ES = Jan 5 - duration(3) + 1 = Jan 3.

- **cpm-critical-path.AC1.4:** Multi-predecessor: A(Jan 1-5) and B(Jan 1-8) both block C. C's ES = max(A.EF + 1, B.EF + 1) = Jan 9 + 1 = Jan 10. Verify the latest constraint wins.

- **cpm-critical-path.AC1.7:** Dateless task D has a blocking predecessor A(Jan 1-3). D gets duration=1, ES=Jan 4 (A.EF + 1), EF=Jan 4.

- **cpm-critical-path.AC1.10:**
  - Issue with only start_date (Jan 5): duration=1, EF=Jan 5
  - Issue with only target_date (Jan 10): duration=1, ES=Jan 10

**Verification:**

```bash
cd apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add CPM forward pass tests`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Backward pass and slack calculation

**Verifies:** cpm-critical-path.AC1.5, cpm-critical-path.AC1.6

**Files:**

- Modify: `apps/web/hw/helpers/cpm-calculator.ts`

**Implementation:**

Add the `backwardPass` function. It takes:

- `sortedIds: ReadonlyArray<string>` — topologically sorted issue IDs (will be reversed)
- `adjacencyList: AdjacencyList` — predecessor→successor edges
- `reverseAdjacencyList: Map<string, Array<{ predecessorId: string; relationType: string }>>` — successor→predecessor edges (built alongside adjacency list in task 1)
- `forwardResults: Map<string, { es: string; ef: string; duration: number }>` — from forward pass
- Returns: `Map<string, { ls: string; lf: string }>`

Algorithm:

1. Determine the project deadline anchor: `max(EF)` across all leaf nodes (issues with no successors in the adjacency list).
2. Walk backward through `sortedIds` in reverse order:
   - For each issue, compute LF:
     - If issue has successors, LF = min constraint across all successors based on edge type:
       - FS (`blocking`): successor LS - 1 day
       - SS (`start_before`): successor LS
       - FF (`finish_before`): successor LF
     - If no successors (leaf node): LF = project deadline anchor
   - Compute LS: `LF - duration + 1`

Then add the `computeCpm` function — the main entry point that orchestrates everything:

1. Call `buildAdjacencyList` to get adjacency list + reverse adjacency list
2. Collect all issue IDs that appear in the graph
3. Call `topologicalSort`
4. Call `forwardPass`
5. Call `backwardPass`
6. Compute slack for each issue: `slack = daysBetween(es, ls)` (LS - ES in days). If `slack === 0`, `isCritical = true`.
7. Return `CpmResultMap`

Export `computeCpm` as the main public API alongside the types.

**Verification:**

```bash
cd apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): implement CPM backward pass and slack calculation`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Backward pass, slack, and full CPM integration tests

**Verifies:** cpm-critical-path.AC1.1, cpm-critical-path.AC1.2, cpm-critical-path.AC1.3, cpm-critical-path.AC1.4, cpm-critical-path.AC1.5, cpm-critical-path.AC1.6, cpm-critical-path.AC1.7, cpm-critical-path.AC1.8, cpm-critical-path.AC1.9, cpm-critical-path.AC1.10

**Files:**

- Modify: `apps/web/hw/helpers/cpm-calculator.test.ts`

**Testing:**

Add `describe("backwardPass")` and `describe("computeCpm")` blocks. Tests must verify:

**Backward pass specific:**

- **cpm-critical-path.AC1.5:** Linear chain A→B→C. Project deadline = C.EF. Backward pass: C.LF = C.EF, C.LS = C.LF - duration + 1. B.LF = C.LS - 1, B.LS = B.LF - duration + 1. A.LF = B.LS - 1, A.LS = A.LF - duration + 1.

**Full `computeCpm` integration:**

- **cpm-critical-path.AC1.6:** Linear chain A→B→C (all on critical path, slack=0 for all). Add parallel branch A→D where D has shorter duration. D should have positive slack. A, B, C should have slack=0 and isCritical=true. D should have slack>0 and isCritical=false.
- **cpm-critical-path.AC1.8:** Empty relation map → `computeCpm` returns empty `CpmResultMap` (size 0).
- **cpm-critical-path.AC1.9:** Chain of 101+ issues → only first 100 levels processed.
- **Mixed dependency types:** Graph with FS, SS, and FF edges in a single computation — verify all constraints applied correctly.
- **Diamond with slack:** A→B→D and A→C→D where B path is longer. C should have positive slack.

**Verification:**

```bash
cd apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add CPM backward pass, slack, and integration tests`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 7-8) -->

<!-- START_TASK_7 -->

### Task 7: CE stub for cpm-calculator

**Verifies:** None (infrastructure)

**Files:**

- Create: `apps/web/ce/helpers/cpm-calculator.ts`

**Implementation:**

Create CE stub following the pattern of `apps/web/ce/helpers/dependency-conflict.ts`. Export the same types as the HW version. Export a no-op `computeCpm` function that returns an empty `Map`.

```typescript
/**
 * CE stub: CPM types matching the HW version.
 * computeCpm returns empty results — CPM calculation is HW-only.
 */

export type CpmResult = {
  es: string;
  ef: string;
  ls: string;
  lf: string;
  slack: number;
  isCritical: boolean;
};

export type CpmResultMap = Map<string, CpmResult>;

export function computeCpm(): CpmResultMap {
  return new Map();
}
```

**Verification:**

```bash
cd apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CE stub for CPM calculator`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC1.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run CPM calculator tests
cd apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts

# Run all existing dependency helper tests to verify no regressions
cd apps/web && pnpm exec vitest run hw/helpers/

# Type check the web app
cd apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions in existing helper tests.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_D -->
