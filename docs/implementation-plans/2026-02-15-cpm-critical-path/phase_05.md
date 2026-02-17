# CPM Critical Path — Phase 5: Slack Visualization and Tooltip Enrichment

**Goal:** Show available float for non-critical tasks as extension bars and enrich tooltips with CPM data.

**Architecture:** Add a `SlackBar` overlay component rendered via `GanttAdditionalLayers`, and a `CpmTooltipContent` component integrated into the existing `Popover.Panel` on `IssueGanttBlock`. Slack bar position is calculated from CPM results and chart data using `getPositionFromDate`. CE stubs return null.

**Tech Stack:** TypeScript, React, MobX (`observer`), Vitest

**Scope:** 7 phases from original design (phase 5 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC5: Slack visualization and tooltips

- **cpm-critical-path.AC5.1 Success:** Non-critical tasks show light-coloured extension bar from EF to LF
- **cpm-critical-path.AC5.2 Success:** Slack bar renders at ~30% opacity, same height as task bar
- **cpm-critical-path.AC5.3 Success:** Hovering a block with CPM active shows ES, EF, LS, LF, and total float in tooltip
- **cpm-critical-path.AC5.4 Success:** Critical tasks show "On critical path — zero slack" in tooltip
- **cpm-critical-path.AC5.5 Edge:** Slack bars only render when CPM is enabled
- **cpm-critical-path.AC5.6 Edge:** Tasks with zero slack show no extension bar (critical path, no slack to display)

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **GanttAdditionalLayers (HW):** `apps/web/hw/components/gantt-chart/layers/additional-layers.tsx` — currently a no-op stub (`() => null`). Props: `itemsContainerWidth: number`, `blockCount: number`. This is where the slack bar overlay is implemented.
- **GanttAdditionalLayers (CE):** `apps/web/ce/components/gantt-chart/layers/additional-layers.tsx` — CE stub, same no-op pattern.
- **Main content rendering order:** `apps/web/core/components/gantt-chart/chart/main-content.tsx:222-225` — `GanttAdditionalLayers` renders between `TimelineDraggablePath` and `GanttChartBlocksList`. Slack bars render BEHIND blocks (correct z-order).
- **IssueGanttBlock:** `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx:37-105` — existing block component with `Popover` tooltip showing `WorkItemPreviewCard`. The `Popover.Panel` (line 90-102) is where CPM tooltip enrichment goes.
- **Position calculation:** `apps/web/core/components/gantt-chart/views/helpers.ts:120-137` — `getPositionFromDate(chartData, date, offsetWidth)` converts a date string to a pixel x-position.
- **Chart data access:** `useTimeLineChartStore()` hook provides `currentViewData` (chart data), `blocksMap`, and CPM accessors.
- **Constants:** `apps/web/core/components/gantt-chart/constants.ts:7` — `BLOCK_HEIGHT = 44`.
- **CPM store accessors (from Phase 2):** `timelineStore.cpmEnabled`, `timelineStore.getSlack(blockId)`, `timelineStore.isCritical(blockId)`, `timelineStore.cpmResults`.
- **CpmResult type (from Phase 1):** `apps/web/hw/helpers/cpm-calculator.ts` — exports `CpmResult` with `{ es, ef, ls, lf, slack, isCritical }`.
- **Existing HW barrel export:** `apps/web/hw/components/gantt-chart/index.ts` — re-exports from `./dependency`, `./layers`, and `./cpm` (added in Phase 4).

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Create slack bar position helper

**Verifies:** cpm-critical-path.AC5.1

**Files:**

- Create: `apps/web/hw/helpers/slack-bar-position.ts`
- Create: `apps/web/ce/helpers/slack-bar-position.ts`

**Implementation:**

Create a pure helper that computes the pixel position and width of a slack bar from a CpmResult and chart data.

HW implementation in `apps/web/hw/helpers/slack-bar-position.ts`:

```typescript
import type { ChartDataType } from "@plane/types";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";
import { getPositionFromDate } from "@/components/gantt-chart/views/helpers";

type SlackBarPosition = {
  left: number;
  width: number;
};

export function getSlackBarPosition(
  cpmResult: Readonly<CpmResult>,
  chartData: ChartDataType,
  offsetWidth: number
): SlackBarPosition | null {
  if (cpmResult.isCritical || cpmResult.slack <= 0) return null;

  const efPosition = getPositionFromDate(chartData, cpmResult.ef, offsetWidth);
  const lfPosition = getPositionFromDate(chartData, cpmResult.lf, offsetWidth);
  const width = lfPosition - efPosition;

  if (width <= 0) return null;

  return { left: efPosition, width };
}
```

CE stub in `apps/web/ce/helpers/slack-bar-position.ts`:

```typescript
import type { ChartDataType } from "@plane/types";
import type { CpmResult } from "@/plane-web/helpers/cpm-calculator";

type SlackBarPosition = {
  left: number;
  width: number;
};

export function getSlackBarPosition(
  _cpmResult: Readonly<CpmResult>,
  _chartData: ChartDataType,
  _offsetWidth: number
): SlackBarPosition | null {
  return null;
}
```

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add slack bar position helper`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Tests for slack bar position helper

**Verifies:** cpm-critical-path.AC5.1, cpm-critical-path.AC5.6

**Files:**

- Create: `apps/web/hw/helpers/slack-bar-position.test.ts`

**Testing:**

Tests must verify:

- **cpm-critical-path.AC5.1:** Given a non-critical CpmResult with ef="2024-01-05" and lf="2024-01-08" and known chart data with dayWidth, returns `{ left, width }` where width equals `3 * dayWidth`.
- **cpm-critical-path.AC5.6:** Given a critical CpmResult (isCritical=true, slack=0), returns null.
- **Edge:** Given slack > 0 but ef === lf (shouldn't happen, but defensive), returns null because width would be 0.

Mock `getPositionFromDate` since it depends on chart state. Verify it's called with correct date strings.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/slack-bar-position.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add slack bar position helper tests`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Implement GanttAdditionalLayers with slack bars

**Verifies:** cpm-critical-path.AC5.1, cpm-critical-path.AC5.2, cpm-critical-path.AC5.5, cpm-critical-path.AC5.6

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/layers/additional-layers.tsx`

**Implementation:**

Replace the no-op stub with an `observer` component that renders slack extension bars for all visible blocks with positive slack.

The component:

1. Reads `timelineStore.cpmEnabled` — if false, returns null (AC5.5)
2. Reads `timelineStore.blocksMap` and `timelineStore.cpmResults`
3. Gets chart data from `useTimeLineChartStore()` for `currentViewData`
4. For each block, gets the `CpmResult` from `cpmResults`
5. Calls `getSlackBarPosition()` to get pixel position — null means no bar (AC5.6)
6. Renders a `div` positioned absolutely at the calculated left/width, at the block's row y-position
7. Style: `backgroundColor` matching the block's state colour at 30% opacity (AC5.2), same height as task bar (`BLOCK_HEIGHT` from constants minus vertical padding)

Row y-position calculation: each block occupies `BLOCK_HEIGHT` (44px). Block at index `i` has `top = i * BLOCK_HEIGHT`. Use the same block ordering as `GanttChartBlocksList` (which iterates `blockIds` from the store).

```typescript
import { observer } from "mobx-react";
import type { FC } from "react";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { getSlackBarPosition } from "@/plane-web/helpers/slack-bar-position";

type Props = {
  itemsContainerWidth: number;
  blockCount: number;
};

export const GanttAdditionalLayers: FC<Props> = observer(function GanttAdditionalLayers({
  itemsContainerWidth,
}: Props) {
  const timelineStore = useTimeLineChartStore();

  if (!timelineStore.cpmEnabled) return null;

  const chartData = timelineStore.currentViewData;
  if (!chartData) return null;

  const blockIds = timelineStore.blockIds;
  const blocksMap = timelineStore.blocksMap;
  const cpmResults = timelineStore.cpmResults;

  return (
    <div
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: itemsContainerWidth, height: blockIds.length * BLOCK_HEIGHT }}
    >
      {blockIds.map((blockId, index) => {
        const cpmResult = cpmResults.get(blockId);
        if (!cpmResult || cpmResult.isCritical) return null;

        const position = getSlackBarPosition(cpmResult, chartData, 0);
        if (!position) return null;

        return (
          <div
            key={`slack-${blockId}`}
            className="absolute rounded-sm"
            style={{
              left: position.left,
              width: position.width,
              top: index * BLOCK_HEIGHT + 4,
              height: BLOCK_HEIGHT - 8,
              backgroundColor: "rgba(60, 133, 217, 0.3)",
            }}
          />
        );
      })}
    </div>
  );
});
```

Note: The exact colour for slack bars should match the block's state colour at 30% opacity. The implementation above uses a generic primary colour. The implementor should check `getBlockViewDetails` and use the same state colour with `/ 0.3` opacity. If that proves complex, using a neutral colour like `var(--color-primary-100)` at 30% opacity is acceptable for the first pass.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): implement slack extension bars in GanttAdditionalLayers`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Create CPM tooltip content component

**Verifies:** cpm-critical-path.AC5.3, cpm-critical-path.AC5.4

**Files:**

- Create: `apps/web/hw/components/gantt-chart/cpm/cpm-tooltip-content.tsx`
- Create: `apps/web/ce/components/gantt-chart/cpm/cpm-tooltip-content.tsx`

**Implementation:**

Create a component that displays CPM data below the existing `WorkItemPreviewCard` in the block's Popover.

HW implementation:

```typescript
import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type Props = {
  blockId: string;
};

export const CpmTooltipContent = observer(function CpmTooltipContent({ blockId }: Props) {
  const timelineStore = useTimeLineChartStore();

  if (!timelineStore.cpmEnabled) return null;

  const cpmResult = timelineStore.cpmResults.get(blockId);
  if (!cpmResult) return null;

  if (cpmResult.isCritical) {
    return (
      <div className="px-3 py-2 text-xs text-red-500 border-t border-custom-border-200">
        On critical path — zero slack
      </div>
    );
  }

  return (
    <div className="px-3 py-2 text-xs border-t border-custom-border-200 space-y-1">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-custom-text-300">Early start</span>
        <span>{cpmResult.es}</span>
        <span className="text-custom-text-300">Early finish</span>
        <span>{cpmResult.ef}</span>
        <span className="text-custom-text-300">Late start</span>
        <span>{cpmResult.ls}</span>
        <span className="text-custom-text-300">Late finish</span>
        <span>{cpmResult.lf}</span>
      </div>
      <div className="pt-1 text-custom-text-300">Total float: {cpmResult.slack.toFixed(1)} days</div>
    </div>
  );
});
```

CE stub:

```typescript
type Props = {
  blockId: string;
};

export function CpmTooltipContent(_props: Props) {
  return null;
}
```

Then integrate into `IssueGanttBlock`. In `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx`, add the `CpmTooltipContent` inside the `Popover.Panel`, after `WorkItemPreviewCard`:

```typescript
// Add import at top
import { CpmTooltipContent } from "@/plane-web/components/gantt-chart";

// In the Popover.Panel (around line 90-102), add after WorkItemPreviewCard:
<Popover.Panel side="bottom" align="start">
  <>
    {issueDetails && issueDetails?.project_id && (
      <WorkItemPreviewCard
        projectId={issueDetails.project_id}
        stateDetails={{
          id: issueDetails.state_id ?? undefined,
        }}
        workItem={issueDetails}
      />
    )}
    <CpmTooltipContent blockId={issueId} />
  </>
</Popover.Panel>;
```

Export `CpmTooltipContent` from the HW and CE barrel files (`apps/web/hw/components/gantt-chart/cpm/index.ts` and `apps/web/ce/components/gantt-chart/cpm/index.ts`).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CPM tooltip content with ES/EF/LS/LF and slack`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Tests for slack visualization and tooltip

**Verifies:** cpm-critical-path.AC5.1, cpm-critical-path.AC5.2, cpm-critical-path.AC5.3, cpm-critical-path.AC5.4, cpm-critical-path.AC5.5, cpm-critical-path.AC5.6

**Files:**

- Create: `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts`

**Testing:**

Since these are React components requiring store context, write focused tests:

- **cpm-critical-path.AC5.5:** When `cpmEnabled` is false, `GanttAdditionalLayers` returns null.
- **cpm-critical-path.AC5.1 + AC5.2:** When `cpmEnabled` is true and a block has positive slack, a slack bar div is rendered with correct left/width and opacity style.
- **cpm-critical-path.AC5.6:** When a block has zero slack (isCritical), no slack bar div is rendered for it.
- **cpm-critical-path.AC5.3:** `CpmTooltipContent` with a non-critical CpmResult renders ES, EF, LS, LF, and total float text.
- **cpm-critical-path.AC5.4:** `CpmTooltipContent` with a critical CpmResult renders "On critical path — zero slack".

Use React Testing Library with a mock store provider if needed, or test the pure logic portions in isolation.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/components/gantt-chart/cpm/slack-tooltip.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add slack visualization and tooltip tests`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC5.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run slack/tooltip tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/components/gantt-chart/cpm/slack-tooltip.test.ts

# Run slack position helper tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/slack-bar-position.test.ts

# Run all CPM-related tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts

# Type check
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
