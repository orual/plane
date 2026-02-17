# CPM Critical Path — Phase 6: Cross-Project CPM

**Goal:** Allow CPM calculation to follow dependency chains across project boundaries with an opt-in toggle, phantom anchor markers for external constraints, and respect for MAX_PROPAGATION_DEPTH.

**Architecture:** Extend the CPM toggle with a cross-project sub-toggle. When enabled, fetch relations for external issues referenced in the current project's dependency graph, cache them in the timeline store, and pass them to `computeCpm`. Render phantom anchor markers at timeline edges for external constraints. Default mode treats cross-project predecessors as fixed inputs (their actual dates, no graph traversal beyond).

**Tech Stack:** TypeScript, React, MobX, Vitest

**Scope:** 7 phases from original design (phase 6 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC6: Cross-project CPM

- **cpm-critical-path.AC6.1 Success:** Cross-project toggle appears when CPM is enabled
- **cpm-critical-path.AC6.2 Success:** Enabling cross-project mode fetches relations for external issues
- **cpm-critical-path.AC6.3 Success:** CPM calculation follows dependency chains across project boundaries
- **cpm-critical-path.AC6.4 Success:** Phantom anchors render at timeline edges for external constraints
- **cpm-critical-path.AC6.5 Success:** Phantom anchor tooltip shows external issue identifier, project name, and dates
- **cpm-critical-path.AC6.6 Edge:** Per-project mode (default) uses cross-project predecessor actual dates as fixed inputs without walking further
- **cpm-critical-path.AC6.7 Edge:** Cross-project traversal respects MAX_PROPAGATION_DEPTH = 100

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **Timeline store (HW):** `apps/web/hw/store/timeline/base-timeline.store.ts` — `crossProjectCpmEnabled` observable and `setCrossProjectCpmEnabled` action (added in Phase 2). `cpmResults` computed property calls `computeCpm`.
- **CPM calculator (from Phase 1):** `apps/web/hw/helpers/cpm-calculator.ts` — `computeCpm(relationMap, getIssueDates)` takes a relation map and a date-lookup function.
- **Relation store:** `this.rootStore.issue.issueDetail.relation.relationMap` — `TIssueRelationMap` type: `{ [issue_id: string]: Record<TIssueRelationTypes, string[]> }`. Only stores issue IDs — issue data comes from the issue store.
- **Relation service:** `apps/web/core/services/issue/issue_relation.service.ts` — `IssueRelationService.listIssueRelations(workspaceSlug, projectId, issueId)` fetches relations for a single issue.
- **Cross-project property fetch pattern:** `apps/web/core/store/issue/issue-details/sub_issues.store.ts:337-342` — `fetchOtherProjectProperties(workspaceSlug, projectIds)` fetches states and members for other projects. Follow this pattern.
- **CPM toggle (from Phase 4):** `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx` — toggle component in gantt toolbar. Extend with cross-project sub-toggle.
- **MAX_PROPAGATION_DEPTH:** `apps/web/hw/helpers/cpm-calculator.ts` — exports `MAX_PROPAGATION_DEPTH = 100` (created in Phase 1).
- **CE stub pattern:** `apps/web/ce/components/gantt-chart/blocks/conflict-indicator.tsx` — returns null.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Add cross-project relation fetching to timeline store

**Verifies:** cpm-critical-path.AC6.2, cpm-critical-path.AC6.6

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts`

**Implementation:**

Add cross-project relation fetching logic to the HW `BaseTimeLineStore`:

1. **New observable map** for cached external relations:

```typescript
crossProjectRelationCache: Record<string, Record<TIssueRelationTypes, string[]>> = {};
```

Register in `makeObservable`:

```typescript
crossProjectRelationCache: observable,
```

2. **New action** to fetch external relations:

```typescript
fetchCrossProjectRelations = async (workspaceSlug: string): Promise<void> => {
  // Collect all issue IDs referenced in the current project's relation map
  // that are NOT in the current project's blocksMap (they're external)
  const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;
  const localBlockIds = new Set(Object.keys(this.blocksMap));
  const externalIds = new Set<string>();

  for (const [issueId, relations] of Object.entries(relationMap)) {
    if (!localBlockIds.has(issueId)) continue;
    for (const relType of Object.keys(relations) as TIssueRelationTypes[]) {
      for (const targetId of relations[relType]) {
        if (!localBlockIds.has(targetId)) {
          externalIds.add(targetId);
        }
      }
    }
  }

  // Fetch relations for each external issue. The relation store's fetchRelations
  // also populates the issue store with full issue objects (including dates) for
  // the related issues, so external issue data becomes available for CPM lookup.
  const issueDetailStore = this.rootStore.issue.issueDetail;

  for (const externalId of externalIds) {
    try {
      // Look up the external issue to get its project_id. The issue data is
      // already in the store because the local relation fetch (fetchRelations)
      // calls addIssue() with full issue objects for all related issues.
      const externalIssue = issueDetailStore.issue.getIssueById(externalId);
      if (!externalIssue?.project_id) continue;

      // Fetch the external issue's own relations — this populates relationMap
      // for the external issue and also adds its related issues to the store
      await issueDetailStore.relation.fetchRelations(workspaceSlug, externalIssue.project_id, externalId);

      // Cache external issue's relations for CPM graph traversal
      const externalRelations = issueDetailStore.relation.relationMap[externalId];
      if (externalRelations) {
        runInAction(() => {
          this.crossProjectRelationCache[externalId] = externalRelations;
        });
      }
    } catch {
      // Skip external issues that fail to fetch (permissions, deleted, etc.)
    }
  }
};
```

Register in `makeObservable`:

```typescript
fetchCrossProjectRelations: action,
```

3. **Modify `cpmResults` computed** to merge external relations when `crossProjectCpmEnabled` is true:

```typescript
get cpmResults(): CpmResultMap {
  if (!this.cpmEnabled) return new Map();

  const relationMap = this.rootStore.issue.issueDetail.relation.relationMap;

  // Merge cross-project relations when enabled
  const effectiveRelationMap = this.crossProjectCpmEnabled
    ? { ...relationMap, ...this.crossProjectRelationCache }
    : relationMap;

  const getIssueDates = (id: string) => {
    // Check local blocks first, then fall back to issue store for external issues
    const block = this.blocksMap[id];
    if (block) {
      return { start_date: block.start_date, target_date: block.target_date };
    }
    // For external issues: look up in root issue store
    const issue = this.rootStore.issue.issueDetail.issue.getIssueById(id);
    if (issue) {
      return { start_date: issue.start_date ?? undefined, target_date: issue.target_date ?? undefined };
    }
    return undefined;
  };

  return computeCpm(effectiveRelationMap, getIssueDates);
}
```

4. **Update the interface** to include new properties.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add cross-project relation fetching to timeline store`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: CE stubs for cross-project store properties

**Verifies:** None (infrastructure)

**Files:**

- Modify: `apps/web/ce/store/timeline/base-timeline.store.ts`

**Implementation:**

Add matching stubs to the CE `BaseTimeLineStore`:

```typescript
crossProjectRelationCache: Record<string, Record<TIssueRelationTypes, string[]>> = {};

fetchCrossProjectRelations = async (_workspaceSlug: string): Promise<void> => {
  // CE: cross-project CPM not available
};
```

Register `crossProjectRelationCache: observable` and `fetchCrossProjectRelations: action` in `makeObservable`.

Update CE interface to match HW.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CE stubs for cross-project CPM store`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Extend CPM toggle with cross-project sub-toggle

**Verifies:** cpm-critical-path.AC6.1

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx`

**Implementation:**

When `cpmEnabled` is true, show a secondary checkbox/toggle for cross-project mode:

```typescript
// Inside the CpmToggle component, after the main CPM toggle:
{
  timelineStore.cpmEnabled && (
    <label className="flex items-center gap-1.5 text-xs text-custom-text-300 cursor-pointer">
      <input
        type="checkbox"
        checked={timelineStore.crossProjectCpmEnabled}
        onChange={(e) => {
          timelineStore.setCrossProjectCpmEnabled(e.target.checked);
          if (e.target.checked) {
            // Trigger fetch of cross-project relations
            timelineStore.fetchCrossProjectRelations(workspaceSlug);
          }
        }}
        className="h-3 w-3"
      />
      Cross-project
    </label>
  );
}
```

The component needs access to `workspaceSlug` from router params (`useParams`).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add cross-project sub-toggle to CPM toggle`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Create phantom anchor component

**Verifies:** cpm-critical-path.AC6.4, cpm-critical-path.AC6.5

**Files:**

- Create: `apps/web/hw/components/gantt-chart/cpm/phantom-anchor.tsx`
- Create: `apps/web/ce/components/gantt-chart/cpm/phantom-anchor.tsx`

**Implementation:**

HW phantom anchor — a small marker at the left or right edge of the timeline representing an external issue constraint:

```typescript
import { observer } from "mobx-react";
import { Tooltip } from "@plane/propel/tooltip";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  issueId: string;
  side: "left" | "right";
  top: number;
};

export const PhantomAnchor = observer(function PhantomAnchor({ issueId, side, top }: Props) {
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProjectIdentifierById } = useProject();

  const issue = getIssueById(issueId);
  if (!issue) return null;

  const projectIdentifier = getProjectIdentifierById(issue.project_id);
  const tooltipContent = `${projectIdentifier}-${issue.sequence_id}: ${issue.name}\n${issue.start_date ?? "No start"} → ${issue.target_date ?? "No end"}`;

  return (
    <Tooltip tooltipContent={tooltipContent}>
      <div
        className="absolute flex items-center justify-center w-4 h-4 rounded-full bg-custom-primary-100/20 border border-custom-primary-100/50 cursor-help z-10"
        style={{
          [side]: 4,
          top: top + 14,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-custom-primary-100" />
      </div>
    </Tooltip>
  );
});
```

CE stub:

```typescript
type Props = {
  issueId: string;
  side: "left" | "right";
  top: number;
};

export function PhantomAnchor(_props: Props) {
  return null;
}
```

Integrate phantom anchors into `GanttAdditionalLayers` (from Phase 5). When `crossProjectCpmEnabled` is true, identify external issue IDs and render `PhantomAnchor` for each at the appropriate timeline edge.

Export from both HW and CE barrel files.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add phantom anchor component for cross-project constraints`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Tests for cross-project CPM

**Verifies:** cpm-critical-path.AC6.2, cpm-critical-path.AC6.3, cpm-critical-path.AC6.6, cpm-critical-path.AC6.7

**Files:**

- Create: `apps/web/hw/store/timeline/cross-project-cpm.test.ts`

**Testing:**

Tests focus on the store logic since it's where the cross-project merging happens:

- **cpm-critical-path.AC6.6:** With `crossProjectCpmEnabled = false`, `cpmResults` uses only the local relation map. External issue IDs in the relation map should use their actual dates as fixed inputs (the `getIssueDates` lookup falls through to the issue store).
- **cpm-critical-path.AC6.3:** With `crossProjectCpmEnabled = true` and `crossProjectRelationCache` populated with external relations, `cpmResults` includes external issues in the CPM graph and correctly propagates dates through cross-project chains.
- **cpm-critical-path.AC6.7:** Verify that `computeCpm` respects `MAX_PROPAGATION_DEPTH` by constructing a chain longer than 100 and confirming it doesn't process beyond the limit. (This may already be tested in Phase 1 — verify and add if missing.)
- **cpm-critical-path.AC6.2:** The `fetchCrossProjectRelations` action correctly identifies external issue IDs from the relation map (IDs not in `blocksMap`).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cross-project-cpm.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add cross-project CPM tests`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC6.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run cross-project tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cross-project-cpm.test.ts

# Run all CPM-related tests (no regressions)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/slack-bar-position.test.ts

# Type check
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
