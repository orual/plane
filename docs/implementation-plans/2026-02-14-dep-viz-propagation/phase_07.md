# Dependency Visualization and Date Propagation — Phase 7: Conflict Visualization

**Goal:** Show visual warnings when issue dates violate dependency constraints, on both the gantt timeline and the issue detail sidebar.

**Architecture:** A conflict detection helper computes whether an issue's dates violate any FS/SS/FF constraints from its predecessors. The timeline store exposes a `computedFn` that checks each block's conflict status reactively. Gantt blocks with conflicts render an `AlertTriangle` warning icon with a tooltip explaining the violation. The issue detail sidebar's relation list items show an inline warning badge for conflicting dependencies. All warnings are informational — users can still override dates manually.

**Tech Stack:** TypeScript, React, MobX, SVG, lucide-react icons

**Scope:** 7 phases from original design (phase 7 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC7: Conflict visualization

- **dep-viz-propagation.AC7.1 Success:** Issue with `start_date` before FS predecessor's `target_date` shows warning icon on gantt block
- **dep-viz-propagation.AC7.2 Success:** Gantt block border shifts to orange when dependency constraint is violated
- **dep-viz-propagation.AC7.3 Success:** Tooltip on warning icon explains the violation (e.g., "Start date is before predecessor [ISSUE-ID] finishes")
- **dep-viz-propagation.AC7.4 Success:** Issue detail sidebar shows warning badge on the conflicting relation entry
- **dep-viz-propagation.AC7.5 Success:** Manual date override is allowed — warning is informational, not blocking
- **dep-viz-propagation.AC7.6 Edge:** Conflict flags update reactively when dates or relations change (no page reload needed)
- **dep-viz-propagation.AC7.7 Edge:** An issue with no dates shows no conflict warnings regardless of dependency relationships

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Create conflict detection helper

**Verifies:** dep-viz-propagation.AC7.1, dep-viz-propagation.AC7.5, dep-viz-propagation.AC7.7

**Files:**

- Create: `apps/web/hw/helpers/dependency-conflict.ts`

**Implementation:**

A set of pure functions that determine whether an issue's dates violate any dependency constraints from its predecessors. These are pure functions operating on plain data — no MobX, no stores.

Key types:

```typescript
type ConflictInfo = {
  predecessorIssueId: string;
  relationType: TIssueRelationTypes;
  message: string;
};
```

Key function:

`detectDependencyConflicts(issueId, issueDates, relationMap, getIssueDates)` — Given:

- `issueId: string` — the issue to check
- `issueDates: { start_date: string | null; target_date: string | null }` — the issue's dates
- `relationMap: TIssueRelationMap` — the full relation map from the store
- `getIssueDates: (id: string) => { start_date: string | null; target_date: string | null } | undefined` — lookup function for predecessor dates

Returns `ConflictInfo[]` — empty array if no conflicts.

Algorithm:

1. If `issueDates.start_date` is null and `issueDates.target_date` is null, return `[]` (dep-viz-propagation.AC7.7)
2. Look up the issue's relations from `relationMap[issueId]`
3. For each predecessor relation:
   - **`blocked_by` (FS):** Check if issue's `start_date` < predecessor's `target_date` + 1 day. If so, conflict.
   - **`start_after` (SS):** Check if issue's `start_date` < predecessor's `start_date`. If so, conflict.
   - **`finish_after` (FF):** Check if issue's `target_date` < predecessor's `target_date`. If so, conflict.
4. Skip predecessors that have no dates (null start_date/target_date)
5. Return all violations found. The function does not block anything (dep-viz-propagation.AC7.5) — it only reports.

Generate human-readable conflict messages using issue IDs (the UI component can resolve to full identifiers).

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(web): add dependency conflict detection helper`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add conflict detection to timeline store

**Verifies:** dep-viz-propagation.AC7.1, dep-viz-propagation.AC7.6, dep-viz-propagation.AC7.7

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts` (add conflict-related computed method)

**Implementation:**

Add a new `computedFn` method to the timeline store:

```typescript
getDependencyConflicts = computedFn((blockId: string): ConflictInfo[] => { ... });
```

This method:

1. Gets the block from `blocksMap[blockId]`
2. If the block has no `start_date` and no `target_date`, return `[]` (dep-viz-propagation.AC7.7)
3. Gets the relation map from `this.rootStore.issueDetail.relation.relationMap`
4. Calls `detectDependencyConflicts` with the block's dates, the relation map, and a lookup function that reads dates from `blocksMap` or from the issue store
5. Returns the `ConflictInfo[]`

Because `computedFn` is MobX-reactive, the result updates automatically when dates or relations change in the store (dep-viz-propagation.AC7.6).

Add a convenience computed:

```typescript
hasConflict = computedFn((blockId: string): boolean => this.getDependencyConflicts(blockId).length > 0);
```

Import `detectDependencyConflicts` and `ConflictInfo` from `@/plane-web/helpers/dependency-conflict`.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add reactive conflict detection to timeline store`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Tests for conflict detection helper

**Verifies:** dep-viz-propagation.AC7.1, dep-viz-propagation.AC7.5, dep-viz-propagation.AC7.7

**Files:**

- Create: `apps/web/hw/helpers/dependency-conflict.test.ts`

**Testing:**

Tests for `detectDependencyConflicts`:

- **dep-viz-propagation.AC7.1 (FS conflict):** Issue B has `start_date=Jan 10`, predecessor A has `target_date=Jan 12` via `blocked_by`. Expect conflict: B starts before A finishes.
- **SS conflict:** Issue B has `start_date=Jan 5`, predecessor A has `start_date=Jan 8` via `start_after`. Expect conflict: B starts before A starts.
- **FF conflict:** Issue B has `target_date=Jan 10`, predecessor A has `target_date=Jan 12` via `finish_after`. Expect conflict: B finishes before A finishes.
- **No conflict:** Issue B has `start_date=Jan 14`, predecessor A has `target_date=Jan 12` via `blocked_by`. Expect no conflict.
- **dep-viz-propagation.AC7.7 (no dates):** Issue B has `start_date=null, target_date=null`. Expect empty array regardless of relations.
- **Predecessor has no dates:** Issue B has dates, predecessor A has `start_date=null`. Expect no conflict from that predecessor.
- **Multiple predecessors:** Issue C depends on A (conflict) and B (no conflict). Expect exactly one conflict entry.
- **dep-viz-propagation.AC7.5 (informational):** Verify function returns conflicts but does not throw or reject — it's advisory only.

Use vitest `describe`/`it`/`expect`. No mocking needed — pure function.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(web): add tests for dependency conflict detection`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: Add warning icon overlay to gantt blocks

**Verifies:** dep-viz-propagation.AC7.1, dep-viz-propagation.AC7.2, dep-viz-propagation.AC7.3

**Files:**

- Create: `apps/web/hw/components/gantt-chart/blocks/conflict-indicator.tsx`
- Modify: `apps/web/core/components/gantt-chart/blocks/block.tsx:66-109` (add conflict indicator rendering)

**Why this modifies a core file:** Core gantt block files already import from the HW-resolved timeline store via `useTimeLineChartStore()` (line 16 of block.tsx). The `ConflictIndicator` is imported from `@/plane-web/` which resolves to CE or HW. The CE stub (Task 6) returns `null`. The `hasConflict` method must be present on both CE and HW timeline stores — the CE version returns `false` (no conflicts possible without dependency features). See Task 6 for the CE timeline store stub requirement.

**Implementation:**

Create `conflict-indicator.tsx` — a small component that renders the warning icon with tooltip:

Props:

```typescript
type ConflictIndicatorProps = {
  blockId: string;
};
```

The component:

1. Reads `getDependencyConflicts(blockId)` from the timeline store via `useTimeLineChartStore()`
2. If no conflicts, returns `null`
3. Renders an `AlertTriangle` icon (from `lucide-react`) with:
   - Size: 14px
   - Colour: `text-orange-500`
   - Positioned absolutely at the top-right corner of the block: `absolute -top-1 -right-1 z-10`
   - Wrapped in a `Tooltip` (from `@plane/propel/tooltip`) showing the conflict message(s) (dep-viz-propagation.AC7.3)
4. The tooltip content lists each conflict: e.g., "Start date is before [ISSUE-ID] finishes (blocking)"

Modify `block.tsx` to:

1. Import `ConflictIndicator` from `@/plane-web/components/gantt-chart/blocks/conflict-indicator`
2. Import `hasConflict` from the timeline store (already using `useTimeLineChartStore`)
3. Inside the block's wrapper div (line 67), add `<ConflictIndicator blockId={blockId} />` as a sibling to the existing content
4. Apply conditional orange border when `hasConflict(blockId)` is true (dep-viz-propagation.AC7.2):
   - Add `ring-1 ring-orange-500` classes to the block wrapper div when conflict is detected

The `ConflictIndicator` is imported from the HW path (`@/plane-web/`). The CE version doesn't need this component — the import path via `@/plane-web/` handles the resolution. If a CE stub is needed for the import, create an empty one.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add warning icon and orange border for dependency conflicts`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Add warning badge to relation list items in issue detail sidebar

**Verifies:** dep-viz-propagation.AC7.4, dep-viz-propagation.AC7.6

**Files:**

- Create: `apps/web/hw/components/relations/conflict-badge.tsx`
- Modify: `apps/web/core/components/issues/relations/issue-list-item.tsx:123-208` (add conflict badge)

**Implementation:**

Create `conflict-badge.tsx` — a component that shows an inline warning for a conflicting relation:

Props:

```typescript
type ConflictBadgeProps = {
  issueId: string;
  relationIssueId: string;
  relationType: TIssueRelationTypes;
};
```

The component:

1. Gets dates for both `issueId` and `relationIssueId` from the issue store (`useIssueDetail().issue.getIssueById`)
2. Checks if this specific relation has a conflict using `detectDependencyConflicts` — filtering the result to only the relevant `predecessorIssueId` and `relationType`
3. If no conflict for this relation, returns `null`
4. Renders an inline `AlertTriangle` icon (14px, `text-orange-500`) with a `Tooltip` explaining the violation
5. Reactivity is automatic — reading issue dates from MobX store means the badge updates when dates change (dep-viz-propagation.AC7.6)

Modify `issue-list-item.tsx`:

1. Import `ConflictBadge` from `@/plane-web/components/relations/conflict-badge`
2. After the issue name tooltip (line 148-150), add `<ConflictBadge issueId={issueId} relationIssueId={relationIssueId} relationType={relationKey} />` as a flex-shrink-0 element

**Why this modifies a core file:** The `@/plane-web/` import resolves to CE or HW at build time. The CE stub (Task 6) returns `null`, so the badge never renders in CE mode. This follows the same pattern as existing `@/plane-web/` imports already present in core files (e.g., `IssueIdentifier` import at line 24 of the same file).

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(web): add conflict warning badge to relation list items in sidebar`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 6-7) -->

<!-- START_TASK_6 -->

### Task 6: Create CE stubs for conflict components

**Verifies:** No regressions in CE mode

**Files:**

- Create: `apps/web/ce/components/gantt-chart/blocks/conflict-indicator.tsx` (empty stub)
- Create: `apps/web/ce/components/relations/conflict-badge.tsx` (empty stub)

**Implementation:**

CE versions render nothing — these are HW-only features.

`conflict-indicator.tsx`:

```typescript
type ConflictIndicatorProps = {
  blockId: string;
};

export function ConflictIndicator(_props: ConflictIndicatorProps) {
  return null;
}
```

`conflict-badge.tsx`:

```typescript
import type { TIssueRelationTypes } from "@/plane-web/types";

type ConflictBadgeProps = {
  issueId: string;
  relationIssueId: string;
  relationType: TIssueRelationTypes;
};

export function ConflictBadge(_props: ConflictBadgeProps) {
  return null;
}
```

Verify the CE stubs match the HW component prop signatures exactly.

**Also verify:** The CE timeline store (`apps/web/ce/store/timeline/base-timeline.store.ts`) must have no-op stubs for the methods added in Phase 7:

- `getDependencyConflicts = computedFn((_blockId: string): ConflictInfo[] => [])` (Phase 7)
- `hasConflict = computedFn((_blockId: string): boolean => false)` (Phase 7)

Note: Phase 6 Task 6 already added the `previewBlockIds`, `computePreviewPositions`, and `clearPreviewPositions` stubs.

These stubs ensure that core files (block.tsx) can call these methods without runtime errors in CE mode.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors across both CE and HW.

**Commit:** `chore(web): add CE stubs for conflict visualization components and timeline store methods`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Tests for conflict visualization integration

**Verifies:** dep-viz-propagation.AC7.1, dep-viz-propagation.AC7.2, dep-viz-propagation.AC7.3, dep-viz-propagation.AC7.4, dep-viz-propagation.AC7.6, dep-viz-propagation.AC7.7

**Files:**

- Create: `apps/web/hw/store/timeline/conflict-detection.test.ts`

**Testing:**

Tests for the timeline store's conflict computed methods:

- **dep-viz-propagation.AC7.1 (hasConflict):** Set up a block B with `start_date=Jan 10` and a `blocked_by` relation to A with `target_date=Jan 12`. Verify `hasConflict("B")` returns `true`.
- **No conflict:** Set up block B with `start_date=Jan 14` and same relation. Verify `hasConflict("B")` returns `false`.
- **dep-viz-propagation.AC7.7 (no dates):** Set up block B with `start_date=null, target_date=null`. Verify `hasConflict("B")` returns `false`.
- **dep-viz-propagation.AC7.6 (reactivity):** Set up a conflict, verify `hasConflict` is true. Then update the block's `start_date` to resolve the conflict. Verify `hasConflict` becomes false (MobX reactivity).
- **getDependencyConflicts messages:** Verify the conflict messages include the predecessor issue ID and relation type description.
- **Multiple relation types:** Test SS and FF conflicts in addition to FS, verify each produces the correct conflict info.

Use MobX observable setup with mock blocks and relations. Use `vi.mock` for services.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(gantt): add tests for conflict detection integration in timeline store`

<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_C -->
