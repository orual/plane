# CPM Critical Path — Phase 4: Critical Path Visualization

**Goal:** Add a CPM toggle to the gantt toolbar and highlight critical path tasks and connectors.

**Architecture:** HW components for the toggle button, critical block styling wrapper, and connector colour override. CE stubs return null. The toggle drives `cpmEnabled` in the timeline store (from Phase 2). Block styling and connector colour use `isCritical()` from the store.

**Tech Stack:** TypeScript, React, MobX, Vitest

**Scope:** 7 phases from original design (phase 4 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC4: Critical path visualization

- **cpm-critical-path.AC4.1 Success:** Toggle button appears in gantt toolbar and controls CPM state
- **cpm-critical-path.AC4.2 Success:** Zero-slack tasks display red/coral background when CPM is active
- **cpm-critical-path.AC4.3 Success:** Dependency connectors between critical path tasks render in red
- **cpm-critical-path.AC4.4 Success:** Non-critical tasks retain their default colour
- **cpm-critical-path.AC4.5 Success:** Critical + computed blocks show red fill with dashed border
- **cpm-critical-path.AC4.6 Edge:** Toggling CPM off restores all blocks and connectors to default appearance
- **cpm-critical-path.AC4.7 Edge:** CPM toggle is off by default on page load

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **Gantt toolbar:** `apps/web/core/components/gantt-chart/chart/header.tsx` — `GanttChartHeader` component. Toggle should be placed between the Today button and the fullscreen toggle. Uses `useTimeLineChartStore` hook.
- **Block styling:** `apps/web/core/components/issues/issue-layouts/utils.tsx:683-711` — `getBlockViewDetails()` returns `{ message, blockStyle }` where blockStyle has `backgroundColor`. Called at `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx:56`.
- **Block rendering:** `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx` — `IssueGanttBlock` component. Line 70 applies `blockStyle` to the block div. This is the component that needs a critical path style override.
- **Connector component:** `apps/web/hw/components/gantt-chart/dependency/connector.tsx` — `Connector` component. Line 91: `const connectorStyle = getConnectorStyle(relationType)`. Line 150: stroke uses `connectorStyle.stroke`. Must be extended to accept `isCritical` prop.
- **Connector style function:** `apps/web/hw/helpers/dependency-path-calculator.ts:178-221` — `getConnectorStyle()` returns `ConnectorStyle { strokeDasharray, stroke }` per relation type.
- **Dependency paths parent:** `apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx` — `TimelineDependencyPaths` renders `<Connector>` for each visible dependency. Has access to `timelineStore`.
- **CE stub pattern:** `apps/web/ce/components/gantt-chart/blocks/conflict-indicator.tsx` — returns null, matches HW prop signature.
- **HW/CE barrel:** `apps/web/hw/components/gantt-chart/index.ts` and `apps/web/ce/components/gantt-chart/index.ts` — both export from `./dependency`, `./layers`.
- **Timeline store (from Phase 2):** `apps/web/hw/store/timeline/base-timeline.store.ts` — provides `cpmEnabled`, `setCpmEnabled`, `isCritical(blockId)`.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Create CPM toggle component (HW + CE)

**Verifies:** cpm-critical-path.AC4.1, cpm-critical-path.AC4.7

**Files:**

- Create: `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx`
- Create: `apps/web/hw/components/gantt-chart/cpm/index.ts`
- Create: `apps/web/ce/components/gantt-chart/cpm/cpm-toggle.tsx`
- Create: `apps/web/ce/components/gantt-chart/cpm/index.ts`
- Modify: `apps/web/hw/components/gantt-chart/index.ts`
- Modify: `apps/web/ce/components/gantt-chart/index.ts`

**Implementation:**

1. **HW toggle** (`hw/components/gantt-chart/cpm/cpm-toggle.tsx`):

A small observer component that reads `cpmEnabled` from the timeline store and calls `setCpmEnabled` on click. Renders a button with a "Critical Path" label or icon. When active, show a visual indicator (e.g., a colored dot or highlighted state).

```typescript
import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

export const CpmToggle = observer(function CpmToggle() {
  const timelineStore = useTimeLineChartStore();
  const isActive = timelineStore.cpmEnabled;

  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
        isActive ? "bg-red-500/10 text-red-600" : "text-custom-text-300 hover:bg-custom-background-80"
      }`}
      onClick={() => timelineStore.setCpmEnabled(!isActive)}
    >
      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-red-500" : "bg-custom-text-400"}`} />
      Critical path
    </button>
  );
});
```

2. **CE stub** (`ce/components/gantt-chart/cpm/cpm-toggle.tsx`):

```typescript
export function CpmToggle() {
  return null;
}
```

3. **Barrel exports**: Create `index.ts` in both `hw/components/gantt-chart/cpm/` and `ce/components/gantt-chart/cpm/` exporting `CpmToggle`. Update both `hw/components/gantt-chart/index.ts` and `ce/components/gantt-chart/index.ts` to add `export * from "./cpm";`.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add CPM toggle component with CE stub`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Wire CPM toggle into gantt toolbar

**Verifies:** cpm-critical-path.AC4.1, cpm-critical-path.AC4.7

**Files:**

- Modify: `apps/web/core/components/gantt-chart/chart/header.tsx`

**Implementation:**

Import `CpmToggle` from `@/plane-web/components/gantt-chart` and render it in the header. Place it between the "Today" button and the fullscreen toggle button.

In `header.tsx`, locate the `<Row>` containing the toolbar buttons. After the Today button (`<button ... onClick={handleToday}>`) and before the fullscreen toggle, add:

```typescript
<CpmToggle />
```

Import at top of file:

```typescript
import { CpmToggle } from "@/plane-web/components/gantt-chart";
```

The toggle is off by default because `cpmEnabled` defaults to `false` in the store (Phase 2). This satisfies AC4.7.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): wire CPM toggle into gantt toolbar`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Add critical path block styling

**Verifies:** cpm-critical-path.AC4.2, cpm-critical-path.AC4.4, cpm-critical-path.AC4.5, cpm-critical-path.AC4.6

**Files:**

- Create: `apps/web/hw/components/gantt-chart/blocks/critical-block-style.tsx`
- Create: `apps/web/ce/components/gantt-chart/blocks/critical-block-style.tsx`

**Implementation:**

1. **HW component** (`hw/components/gantt-chart/blocks/critical-block-style.tsx`):

An observer component that wraps a block's content div and applies critical path styling. It reads `isCritical(blockId)` and `getComputedDates(blockId)` from the timeline store.

```typescript
import type { CSSProperties } from "react";
import { observer } from "mobx-react";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";

type Props = {
  blockId: string;
  baseStyle: CSSProperties;
  children: React.ReactNode;
};

const CRITICAL_COLOR = "rgb(239 68 68)"; // red-500

export const CriticalBlockStyle = observer(function CriticalBlockStyle({ blockId, baseStyle, children }: Props) {
  const timelineStore = useTimeLineChartStore();

  if (!timelineStore.cpmEnabled) {
    return <div style={baseStyle}>{children}</div>;
  }

  const isCritical = timelineStore.isCritical(blockId);
  const computedDates = timelineStore.getComputedDates(blockId);
  const isComputed = computedDates !== null;

  if (!isCritical) {
    return <div style={baseStyle}>{children}</div>;
  }

  const criticalStyle: CSSProperties = {
    ...baseStyle,
    backgroundColor: CRITICAL_COLOR,
    ...(isComputed ? { borderStyle: "dashed", borderWidth: "1.5px", borderColor: CRITICAL_COLOR } : {}),
  };

  return <div style={criticalStyle}>{children}</div>;
});
```

2. **CE stub** (`ce/components/gantt-chart/blocks/critical-block-style.tsx`):

```typescript
import type { CSSProperties } from "react";

type Props = {
  blockId: string;
  baseStyle: CSSProperties;
  children: React.ReactNode;
};

export function CriticalBlockStyle({ baseStyle, children }: Props) {
  return <div style={baseStyle}>{children}</div>;
}
```

**How this integrates:** The `IssueGanttBlock` component in `blocks.tsx:70` currently renders `<div style={blockStyle}>`. The consumer of `IssueGanttBlock` (or the component itself) should wrap the block div with `CriticalBlockStyle` instead, passing `blockStyle` as `baseStyle` and the block ID. The exact integration point depends on how `blocks.tsx` is structured — the task implementor should:

- Import `CriticalBlockStyle` from `@/plane-web/components/gantt-chart`
- In `IssueGanttBlock`, replace the `<div style={blockStyle}>` wrapper with `<CriticalBlockStyle blockId={block.id} baseStyle={blockStyle}>`

This ensures:

- AC4.2: Critical blocks get red background
- AC4.4: Non-critical blocks pass through with unchanged `baseStyle`
- AC4.5: Critical + computed blocks get red fill + dashed border
- AC4.6: When CPM is off, all blocks render with their base style

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add critical path block styling with CE stub`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Integrate CriticalBlockStyle into IssueGanttBlock

**Verifies:** cpm-critical-path.AC4.2, cpm-critical-path.AC4.5

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/gantt/blocks.tsx`

**Implementation:**

In `IssueGanttBlock` (blocks.tsx):

1. Import `CriticalBlockStyle`:

```typescript
import { CriticalBlockStyle } from "@/plane-web/components/gantt-chart";
```

2. Find the block div that uses `style={blockStyle}` (line ~70). Replace the plain `<div style={blockStyle}>` with `<CriticalBlockStyle blockId={issueId} baseStyle={blockStyle}>`. Ensure the children remain the same.

The `issueId` prop is received directly by `IssueGanttBlock` and provides the issue ID needed for `isCritical()` lookup.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): integrate critical block styling into issue gantt blocks`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Add critical path connector styling

**Verifies:** cpm-critical-path.AC4.3, cpm-critical-path.AC4.6

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/dependency/connector.tsx`
- Modify: `apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx`

**Implementation:**

1. **Extend `ConnectorProps`** in `connector.tsx` to accept an optional `isCriticalPath` boolean:

```typescript
type ConnectorProps = {
  sourceBlock: IGanttBlock;
  targetBlock: IGanttBlock;
  sourceRowIndex: number;
  targetRowIndex: number;
  relationType: TIssueRelationTypes;
  isCriticalPath?: boolean;
};
```

2. **Override connector style** in the `Connector` component when `isCriticalPath` is true. After line 91 (`const connectorStyle = getConnectorStyle(relationType);`), add:

```typescript
const effectiveStyle = isCriticalPath ? { stroke: "rgb(239 68 68)", strokeDasharray: "" } : connectorStyle;
```

Then replace all references to `connectorStyle` in the JSX with `effectiveStyle` (the visible path stroke, the tooltip rect stroke).

3. **Pass `isCriticalPath`** from `TimelineDependencyPaths` in `dependency-paths.tsx`. The component already has access to `timelineStore`. For each dependency in the map, check if both source and target are critical:

```typescript
const isCriticalPath =
  timelineStore.cpmEnabled &&
  timelineStore.isCritical(dep.sourceBlockId) &&
  timelineStore.isCritical(dep.targetBlockId);
```

Pass this as a prop to `<Connector>`:

```typescript
<Connector
  key={`${dep.sourceBlockId}-${dep.targetBlockId}-${dep.relationType}`}
  sourceBlock={blocksMap[dep.sourceBlockId]}
  targetBlock={blocksMap[dep.targetBlockId]}
  sourceRowIndex={dep.sourceRowIndex}
  targetRowIndex={dep.targetRowIndex}
  relationType={dep.relationType}
  isCriticalPath={isCriticalPath}
/>
```

This ensures:

- AC4.3: Connectors between two critical tasks render red
- AC4.6: When CPM is off, `isCriticalPath` is always false, restoring default appearance

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add critical path connector styling`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Tests for critical path visualization

**Verifies:** cpm-critical-path.AC4.1, cpm-critical-path.AC4.2, cpm-critical-path.AC4.3, cpm-critical-path.AC4.4, cpm-critical-path.AC4.5, cpm-critical-path.AC4.6, cpm-critical-path.AC4.7

**Files:**

- Create: `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts`

**Testing:**

Since the UI components rely on MobX stores and React rendering, focus tests on the logic that determines styling rather than full React rendering:

Tests must verify each AC:

- **cpm-critical-path.AC4.1:** Verify `CpmToggle` calls `setCpmEnabled` when clicked (unit test with mock store).
- **cpm-critical-path.AC4.2:** With `isCritical(id)` returning true and `cpmEnabled` true, `CriticalBlockStyle` applies red background.
- **cpm-critical-path.AC4.3:** When both source and target are critical and `cpmEnabled` is true, the `isCriticalPath` logic evaluates to true (unit test on the boolean expression).
- **cpm-critical-path.AC4.4:** With `isCritical(id)` returning false and `cpmEnabled` true, `CriticalBlockStyle` passes through the base style unchanged.
- **cpm-critical-path.AC4.5:** With `isCritical(id)` true AND `getComputedDates(id)` returning non-null, `CriticalBlockStyle` applies both red fill and dashed border.
- **cpm-critical-path.AC4.6:** With `cpmEnabled` false, `CriticalBlockStyle` passes through base style unchanged regardless of `isCritical` result.
- **cpm-critical-path.AC4.7:** Verify `cpmEnabled` defaults to false in a fresh store instance.

Follow existing test patterns from `hw/helpers/dependency-conflict.test.ts` and `hw/store/timeline/cpm-store.test.ts` (from Phase 2).

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/components/gantt-chart/cpm/cpm-visualization.test.ts
```

Expected: All tests pass

**Commit:** `test(gantt): add critical path visualization tests`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_TASK_7 -->

### Task 7: Run full test suite and verify clean state

**Verifies:** All cpm-critical-path.AC4.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run Phase 4 tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/components/gantt-chart/cpm/

# Run Phase 2 store tests (verify no regressions)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts

# Run Phase 1 calculator tests (verify no regressions)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts

# Type check
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_7 -->
