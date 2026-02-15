# Dependency Visualization and Date Propagation — Phase 1: Relation Type Expansion

**Goal:** Expose all temporal and structural relation types in the frontend, matching the backend's existing support for `start_before`, `finish_before`, and `implemented_by` relations.

**Architecture:** The backend already defines all relation types (`start_before`/`start_after`, `finish_before`/`finish_after`, `implemented_by`/`implements`) in `IssueRelationChoices` and handles bidirectional storage. The frontend currently only exposes 4 types (`blocking`, `blocked_by`, `duplicate`, `relates_to`). This phase adds the remaining 6 types to the frontend type system, constants, UI options, i18n labels, and activity messages. The relation store already handles bidirectional updates generically via `REVERSE_RELATIONS` — adding new entries is the only store-adjacent change.

**Tech Stack:** TypeScript, React, MobX, i18n, lucide-react icons

**Scope:** 7 phases from original design (phase 1 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC1: Temporal relation types exposed in frontend

- **dep-viz-propagation.AC1.1 Success:** User can create a `start_before` relation from the issue detail sidebar relation picker
- **dep-viz-propagation.AC1.2 Success:** User can create a `finish_before` relation from the issue detail sidebar relation picker
- **dep-viz-propagation.AC1.3 Success:** Creating a `start_before` relation shows as `start_after` on the related issue's side (bidirectional mapping)
- **dep-viz-propagation.AC1.4 Success:** Relation picker groups types into "Scheduling" (blocking, start_before, finish_before) and "Other" (relates_to, duplicate) sections
- **dep-viz-propagation.AC1.5 Success:** All 8 relation types round-trip through the API — create via POST, visible in GET response under correct key _(Note: the design specifies 8 types; this implementation extends to 10 by adding `implemented_by`/`implements` which the backend already supports. All 10 types are verified.)_
- **dep-viz-propagation.AC1.6 Failure:** Removing a temporal relation removes both sides (forward and reverse) — no orphaned relations
- **dep-viz-propagation.AC1.7 Edge:** Existing `blocking`/`blocked_by`/`relates_to`/`duplicate` relations continue to work identically after type expansion

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Expand shared type definition and HW type override

**Verifies:** dep-viz-propagation.AC1.7 (existing types preserved), dep-viz-propagation.AC1.1, dep-viz-propagation.AC1.2 (new types available in type system)

**Files:**

- Modify: `packages/types/src/issues/issue_relation.ts` (replace the `TIssueRelationTypes` union type definition, currently at line 17)
- Modify: `apps/web/hw/types/gantt-chart.ts` (replace the `TIssueRelationTypes` union type definition, currently at line 7)

**Implementation:**

In `packages/types/src/issues/issue_relation.ts`, find the `TIssueRelationTypes` union type and replace it:

```typescript
export type TIssueRelationTypes =
  | "blocking"
  | "blocked_by"
  | "duplicate"
  | "relates_to"
  | "start_before"
  | "start_after"
  | "finish_before"
  | "finish_after"
  | "implemented_by"
  | "implements";
```

In `apps/web/hw/types/gantt-chart.ts`, replace line 7 with the same union type (this file re-exports the type for the HW overlay):

```typescript
export type TIssueRelationTypes =
  | "blocking"
  | "blocked_by"
  | "duplicate"
  | "relates_to"
  | "start_before"
  | "start_after"
  | "finish_before"
  | "finish_after"
  | "implemented_by"
  | "implements";
```

**Verification:**

Run: `pnpm check:types`
Expected: No type errors. The `REVERSE_RELATIONS` constant and `ISSUE_RELATION_OPTIONS` record will fail type checking because they don't cover the new union members yet — that's expected and fixed in Tasks 2 and 3.

Note: Type errors in `REVERSE_RELATIONS` and `ISSUE_RELATION_OPTIONS` are expected at this point since they use `[key in TIssueRelationTypes]` mapped types. Task 2 fixes them.

**Commit:** `feat(types): expand TIssueRelationTypes with temporal and structural relation types`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Update REVERSE_RELATIONS constant

**Verifies:** dep-viz-propagation.AC1.3 (bidirectional mapping), dep-viz-propagation.AC1.7 (existing mappings preserved)

**Files:**

- Modify: `apps/web/core/constants/gantt-chart.ts:9-14` (add new relation pairs to `REVERSE_RELATIONS`)

**Implementation:**

Replace the entire `REVERSE_RELATIONS` constant in `apps/web/core/constants/gantt-chart.ts`:

```typescript
export const REVERSE_RELATIONS: { [key in TIssueRelationTypes]: TIssueRelationTypes } = {
  blocked_by: "blocking",
  blocking: "blocked_by",
  relates_to: "relates_to",
  duplicate: "duplicate",
  start_before: "start_after",
  start_after: "start_before",
  finish_before: "finish_after",
  finish_after: "finish_before",
  implemented_by: "implements",
  implements: "implemented_by",
};
```

This is the only change needed for the relation store (`core/store/issue/issue-details/relation.store.ts`) to handle bidirectional updates for the new types. The store already uses `REVERSE_RELATIONS` generically in `createRelation` (line 147), `createCurrentRelation` (line 185), `removeRelation` (line 252), and `extractRelationsFromIssues` (line 298).

**Verification:**

Run: `pnpm check:types`
Expected: `REVERSE_RELATIONS` type error resolves. `ISSUE_RELATION_OPTIONS` will still have a type error (fixed in Task 3).

**Commit:** `feat(constants): add temporal and structural relation pairs to REVERSE_RELATIONS`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Add new relation options to ISSUE_RELATION_OPTIONS with grouping

**Verifies:** dep-viz-propagation.AC1.1 (start_before in picker), dep-viz-propagation.AC1.2 (finish_before in picker), dep-viz-propagation.AC1.4 (grouped into Scheduling/Other)

**Files:**

- Modify: `apps/web/hw/components/relations/index.tsx` (add 6 new entries to `ISSUE_RELATION_OPTIONS`, add grouping export)

**Implementation:**

Replace the full content of `apps/web/hw/components/relations/index.tsx`. The key changes:

1. Add entries for all 6 new relation types using appropriate lucide-react icons
2. Export a `RELATION_GROUPS` constant that groups types into "Scheduling" and "Other" for the picker UI (dep-viz-propagation.AC1.4)

```typescript
import { ArrowRightToLine, ArrowLeftToLine, CircleDot, XCircle, Wrench, Puzzle } from "lucide-react";
import { RelatedIcon, DuplicatePropertyIcon } from "@plane/propel/icons";
import type { TRelationObject } from "@/components/issues/issue-detail-widgets/relations";
import type { TIssueRelationTypes } from "../../types";

export * from "./activity";

export const ISSUE_RELATION_OPTIONS: Record<TIssueRelationTypes, TRelationObject> = {
  relates_to: {
    key: "relates_to",
    i18n_label: "issue.relation.relates_to",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "Add related work items",
  },
  duplicate: {
    key: "duplicate",
    i18n_label: "issue.relation.duplicate",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <DuplicatePropertyIcon width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocked_by: {
    key: "blocked_by",
    i18n_label: "issue.relation.blocked_by",
    className: "bg-danger-subtle text-danger-primary",
    icon: (size) => <CircleDot size={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocking: {
    key: "blocking",
    i18n_label: "issue.relation.blocking",
    className: "bg-yellow-500/20 text-yellow-700",
    icon: (size) => <XCircle size={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_before: {
    key: "start_before",
    i18n_label: "issue.relation.start_before",
    className: "bg-blue-500/20 text-blue-700",
    icon: (size) => <ArrowRightToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_after: {
    key: "start_after",
    i18n_label: "issue.relation.start_after",
    className: "bg-blue-500/20 text-blue-700",
    icon: (size) => <ArrowLeftToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_before: {
    key: "finish_before",
    i18n_label: "issue.relation.finish_before",
    className: "bg-purple-500/20 text-purple-700",
    icon: (size) => <ArrowRightToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_after: {
    key: "finish_after",
    i18n_label: "issue.relation.finish_after",
    className: "bg-purple-500/20 text-purple-700",
    icon: (size) => <ArrowLeftToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  implemented_by: {
    key: "implemented_by",
    i18n_label: "issue.relation.implemented_by",
    className: "bg-green-500/20 text-green-700",
    icon: (size) => <Wrench size={size} className="text-secondary" />,
    placeholder: "None",
  },
  implements: {
    key: "implements",
    i18n_label: "issue.relation.implements",
    className: "bg-green-500/20 text-green-700",
    icon: (size) => <Puzzle size={size} className="text-secondary" />,
    placeholder: "None",
  },
};

export type TRelationGroupKey = "scheduling" | "structural" | "other";

export const RELATION_GROUPS: { key: TRelationGroupKey; i18n_label: string; types: TIssueRelationTypes[] }[] = [
  {
    key: "scheduling",
    i18n_label: "issue.relation.group.scheduling",
    types: ["blocking", "blocked_by", "start_before", "start_after", "finish_before", "finish_after"],
  },
  {
    key: "structural",
    i18n_label: "issue.relation.group.structural",
    types: ["implemented_by", "implements"],
  },
  {
    key: "other",
    i18n_label: "issue.relation.group.other",
    types: ["relates_to", "duplicate"],
  },
];

export const useTimeLineRelationOptions = () => ISSUE_RELATION_OPTIONS;
```

Additionally, export `RELATION_GROUPS` and `TRelationGroupKey` from this file so the relation picker can consume them.

**Also modify:** `apps/web/core/components/issues/issue-detail-widgets/relations/quick-action-button.tsx` (lines 46-71) — update the `RelationActionButton` component to render grouped relation options using `RELATION_GROUPS` instead of flat-listing all options. This satisfies dep-viz-propagation.AC1.4 (grouped sections).

The current code iterates `Object.values(ISSUE_RELATION_OPTIONS)` and renders flat menu items. Replace with iteration over `RELATION_GROUPS`:

1. Import `RELATION_GROUPS` from `@/plane-web/components/relations`
2. For each group, render a `CustomMenu.MenuItem` header with the group's i18n label (non-clickable, styled as a section header)
3. For each type in the group, render the existing `CustomMenu.MenuItem` with the icon and label

Task 6 syncs the CE version to match HW exactly, including the full `RELATION_GROUPS` constant.

**Verification:**

Run: `pnpm check:types`
Expected: All type errors resolve. The `Record<TIssueRelationTypes, TRelationObject>` now has entries for all 10 union members.

**Commit:** `feat(relations): add temporal and structural relation options with grouped picker`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Add i18n translations for new relation types

**Verifies:** dep-viz-propagation.AC1.1, dep-viz-propagation.AC1.2, dep-viz-propagation.AC1.4 (labels render correctly)

**Files:**

- Modify: `packages/i18n/src/locales/en/translations.ts:955-960` (add new relation labels under `issue.relation`)

**Implementation:**

In the English translations file, find the `relation` object inside the `issue` namespace (around line 955) and add the new entries. The existing entries must be preserved:

```typescript
relation: {
  relates_to: "Relates to",
  duplicate: "Duplicate of",
  blocked_by: "Blocked by",
  blocking: "Blocking",
  start_before: "Starts before",
  start_after: "Starts after",
  finish_before: "Finishes before",
  finish_after: "Finishes after",
  implemented_by: "Implemented by",
  implements: "Implements",
  group: {
    scheduling: "Scheduling",
    structural: "Structural",
    other: "Other",
  },
},
```

Note: Only update the English translations file. Other locales (ja, de, tr-TR, etc.) should be handled in a separate i18n pass. The i18n library will fall back to English for missing translations.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors from i18n changes.

**Commit:** `feat(i18n): add English translations for temporal and structural relation types`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Update activity handler for new relation types

**Verifies:** dep-viz-propagation.AC1.1, dep-viz-propagation.AC1.2 (activity log shows correct messages when relations are created/removed)

**Files:**

- Modify: `apps/web/hw/components/relations/activity.ts:12-27` (add cases for new relation types)

**Implementation:**

Add switch cases to `getRelationActivityContent` in `apps/web/hw/components/relations/activity.ts` for each new relation type. Add the new cases before the closing `return;`:

```typescript
case "start_before":
  return activity.old_value === ""
    ? `marked this work item starts before `
    : `removed the starts before relation from `;
case "start_after":
  return activity.old_value === ""
    ? `marked this work item starts after `
    : `removed the starts after relation from `;
case "finish_before":
  return activity.old_value === ""
    ? `marked this work item finishes before `
    : `removed the finishes before relation from `;
case "finish_after":
  return activity.old_value === ""
    ? `marked this work item finishes after `
    : `removed the finishes after relation from `;
case "implemented_by":
  return activity.old_value === ""
    ? `marked this work item is implemented by `
    : `removed the implemented by relation from `;
case "implements":
  return activity.old_value === ""
    ? `marked this work item implements `
    : `removed the implements relation from `;
```

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(relations): add activity messages for temporal and structural relation types`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Update CE type definition to match HW

**Verifies:** dep-viz-propagation.AC1.7 (CE code doesn't break)

**Files:**

- Modify: `apps/web/ce/types/gantt-chart.ts` (update `TIssueRelationTypes` to match the HW override)
- Modify: `apps/web/ce/components/relations/index.tsx` (update to match HW version)
- Modify: `apps/web/ce/components/relations/activity.ts` (update to match HW version)

**Implementation:**

The CE versions need to stay in sync with HW. Update:

1. `apps/web/ce/types/gantt-chart.ts` — same union type as HW (Task 1)
2. `apps/web/ce/components/relations/index.tsx` — same content as HW (Task 3)
3. `apps/web/ce/components/relations/activity.ts` — same content as HW (Task 5)

These files must be identical to their HW counterparts. The HW overlay pattern in this codebase keeps CE and HW in sync for shared features.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors across the full project.

Run: `pnpm check:lint`
Expected: No lint errors.

**Commit:** `feat(relations): sync CE type definitions and relation options with HW`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 7-9) -->

<!-- START_TASK_7 -->

### Task 7: Add implemented_by/implements support to backend relation API

**Verifies:** dep-viz-propagation.AC1.5 (all 10 types round-trip through API)

**Files:**

- Modify: `apps/api/plane/app/views/issue/relation.py:42-260` (add implemented_by/implements to list and create endpoints)

**Implementation:**

The list endpoint (`list` method, lines 42-207) currently queries for 8 relation types but is missing `implemented_by`/`implements`. The create endpoint (line 223) has a swap list that is missing `"implements"`. The utility functions in `apps/api/plane/utils/issue_relation_mapper.py` already handle `implemented_by`↔`implements` mapping correctly — only the view needs changes.

**List endpoint changes:**

After the `finish_before_issues` query (around line 98-100), add two new queries following the exact same pattern as `start_before`/`start_after`:

```python
# get all implements issues (issues that this issue implements)
implements_issues = issue_relations.filter(
    relation_type="implemented_by", related_issue_id=issue_id
).values_list("issue_id", flat=True)

# get all implemented_by issues (issues that implement this issue)
implemented_by_issues_list = issue_relations.filter(
    relation_type="implemented_by", issue_id=issue_id
).values_list("related_issue_id", flat=True)
```

The naming follows the same pattern as `blocking_issues`/`blocked_by_issues`: `implemented_by` is the stored type, so:

- `filter(related_issue_id=issue_id)` finds relations where issue_id is the related_issue (i.e., other issues are `implemented_by` issue_id → from issue_id's perspective, it "implements" them)
- `filter(issue_id=issue_id)` finds relations where issue_id is the issue (i.e., issue_id is `implemented_by` other issues)

In the `response_data` dict (around line 174-205), add two new entries after `finish_before`:

```python
"implements": queryset.filter(pk__in=implements_issues)
.annotate(relation_type=Value("implements", output_field=CharField()))
.values(*fields),
"implemented_by": queryset.filter(pk__in=implemented_by_issues_list)
.annotate(relation_type=Value("implemented_by", output_field=CharField()))
.values(*fields),
```

**Create endpoint changes:**

Update the swap list at line 223 to include `"implements"`:

```python
issue_id=(issue if relation_type in ["blocking", "start_after", "finish_after", "implements"] else issue_id),
related_issue_id=(
    issue_id if relation_type in ["blocking", "start_after", "finish_after", "implements"] else issue
),
```

And the same swap list check at line 251 for the response serializer:

```python
if relation_type in ["blocking", "start_after", "finish_after", "implements"]:
```

The `get_actual_relation("implements")` call at line 227 already returns `"implemented_by"` correctly.

**Verification:**

Run: `cd apps/api && python -c "from plane.app.views.issue.relation import IssueRelationViewSet; print('Import OK')"`
Expected: Import succeeds.

**Commit:** `feat(api): add implemented_by/implements support to relation list and create endpoints`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Backend contract tests for temporal relation types

**Verifies:** dep-viz-propagation.AC1.5 (all 10 types round-trip through API — 8 from design + `implemented_by`/`implements`), dep-viz-propagation.AC1.6 (removing relation removes both sides), dep-viz-propagation.AC1.3 (bidirectional mapping)

**Files:**

- Create: `apps/api/plane/tests/contract/hw/test_issue_relations.py`

**Testing:**

Create a contract test class that verifies the API handles all relation types. Tests should follow existing patterns in `apps/api/plane/tests/contract/hw/test_issue_types.py` (use `@pytest.mark.contract`, `@pytest.mark.django_db`, `session_client` fixture, URL helper methods).

Tests must verify:

- **dep-viz-propagation.AC1.5:** Create a `start_before` relation via POST, then GET the issue's relations and confirm it appears under the `start_before` key. Repeat for `finish_before`, `blocking`, and `implemented_by`. Verify the related issue shows the reverse key (`start_after`, `finish_after`, `blocked_by`, `implements`). All 10 relation types (5 forward + 5 reverse) must round-trip correctly.
- **dep-viz-propagation.AC1.3:** Create a `start_before` relation from issue A to issue B. GET issue B's relations and confirm issue A appears under `start_after`.
- **dep-viz-propagation.AC1.6:** Create a `start_before` relation, then DELETE it. Verify both the forward (`start_before` on source) and reverse (`start_after` on target) are gone.
- **dep-viz-propagation.AC1.7:** Create a `blocking` relation. Verify it still works identically (existing behaviour not broken).

Use `IssueFactory` to create test issues. The test needs a `project` fixture — follow the pattern in existing hw contract tests for fixture setup.

**Verification:**

Run: `cd apps/api && python run_tests.py -c`
Expected: All contract tests pass, including the new relation tests.

**Commit:** `test(relations): add contract tests for temporal and structural relation types`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Frontend unit tests for relation type expansion

**Verifies:** dep-viz-propagation.AC1.3 (REVERSE_RELATIONS mapping), dep-viz-propagation.AC1.4 (grouping), dep-viz-propagation.AC1.7 (existing types preserved)

**Files:**

- Create: `apps/web/hw/components/relations/relations.test.ts`

**Testing:**

Create a vitest test file following the pattern in `apps/web/hw/store/issue-property.store.test.ts`. Tests must verify:

- **dep-viz-propagation.AC1.3 (REVERSE_RELATIONS):** Import `REVERSE_RELATIONS` from `@/constants/gantt-chart`. Verify each relation type maps to its correct reverse: `start_before` → `start_after`, `finish_before` → `finish_after`, `implemented_by` → `implements`, and all original mappings still hold.
- **dep-viz-propagation.AC1.4 (RELATION_GROUPS):** Import `RELATION_GROUPS` from the relations component. Verify the "scheduling" group contains `blocking`, `blocked_by`, `start_before`, `start_after`, `finish_before`, `finish_after`. Verify "structural" contains `implemented_by`, `implements`. Verify "other" contains `relates_to`, `duplicate`.
- **dep-viz-propagation.AC1.7 (ISSUE_RELATION_OPTIONS completeness):** Import `ISSUE_RELATION_OPTIONS`. Verify it has entries for all 10 `TIssueRelationTypes` values. Verify each entry has `key`, `i18n_label`, `className`, `icon`, and `placeholder` properties.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(relations): add unit tests for relation type expansion and grouping`

<!-- END_TASK_9 -->

<!-- END_SUBCOMPONENT_D -->
