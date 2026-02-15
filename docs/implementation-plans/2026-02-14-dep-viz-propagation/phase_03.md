# Dependency Visualization and Date Propagation — Phase 3: Dependency Visualization on Gantt

**Goal:** Render SVG connector lines between dependent blocks on the gantt timeline, showing blocking, start_before, and finish_before relationships as styled arrows.

**Architecture:** An SVG overlay rendered by `TimelineDependencyPaths` (currently an empty stub) draws right-angle connector paths between related blocks. Each dependency is an SVG `<path>` from the source block's edge to the target block's edge, with an arrowhead marker. Connectors are styled by type: solid for blocking, dashed for temporal. The SVG layer sits between the row backgrounds and the blocks in the rendering order (line 222 of `main-content.tsx`). Block positions come from the timeline store's `blocksMap`, and vertical position is derived from the block's index in `blockIds` multiplied by `BLOCK_HEIGHT` (44px).

**Tech Stack:** React, SVG, MobX, TypeScript

**Scope:** 7 phases from original design (phase 3 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC3: Dependency connector lines on gantt

- **dep-viz-propagation.AC3.1 Success:** SVG right-angle connector line renders between a blocking issue and its dependent on the gantt timeline
- **dep-viz-propagation.AC3.2 Success:** Connectors for `start_before`/`finish_before` render with dashed line style, `blocking` with solid line
- **dep-viz-propagation.AC3.3 Success:** Arrowhead marker renders at the target end of each connector
- **dep-viz-propagation.AC3.4 Success:** Connectors update position when scrolling the gantt horizontally or vertically
- **dep-viz-propagation.AC3.5 Success:** Connectors render correctly across all three view modes (week, month, quarter)
- **dep-viz-propagation.AC3.6 Edge:** Connectors only render when both source and target blocks are in the visible viewport (performance: no offscreen rendering)
- **dep-viz-propagation.AC3.7 Edge:** When either the source or target issue has no dates (no gantt block), no connector renders (no errors)

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Create dependency path calculator utility

**Verifies:** dep-viz-propagation.AC3.1 (right-angle path), dep-viz-propagation.AC3.2 (connector styling by type)

**Files:**

- Create: `apps/web/hw/helpers/dependency-path-calculator.ts`

**Implementation:**

A set of pure functions for calculating SVG path data for right-angle connectors between two gantt blocks.

Given source and target block positions (each with `marginLeft`, `width`, and `rowIndex`), the calculator produces an SVG path string (`d` attribute) for a right-angle connector.

Key functions:

```typescript
type BlockRect = {
  left: number; // marginLeft from block.position.marginLeft
  width: number; // from block.position.width
  top: number; // rowIndex * BLOCK_HEIGHT
  height: number; // BLOCK_HEIGHT constant (44)
};

type ConnectorEndpoint = "left" | "right";

type ConnectorPath = {
  d: string; // SVG path d attribute
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
};
```

1. `calculateConnectorPath(source: BlockRect, target: BlockRect, sourceEndpoint: ConnectorEndpoint, targetEndpoint: ConnectorEndpoint): ConnectorPath` — Calculates a right-angle SVG path between two blocks. The path exits the source horizontally, makes a right-angle turn, then enters the target horizontally. Uses a midpoint offset of 20px for the vertical segment.

2. `getConnectorEndpoints(relationType: TIssueRelationTypes): { sourceEndpoint: ConnectorEndpoint; targetEndpoint: ConnectorEndpoint }` — Maps relation type to which edges to connect:
   - `blocking`/`blocked_by` (Finish-to-Start): source right → target left
   - `start_before`/`start_after` (Start-to-Start): source left → target left
   - `finish_before`/`finish_after` (Finish-to-Finish): source right → target right
   - `implemented_by`/`implements`: source right → target left

3. `getConnectorStyle(relationType: TIssueRelationTypes): { strokeDasharray: string; stroke: string }` — Returns CSS properties:
   - `blocking`/`blocked_by`: solid line, `stroke: "var(--color-text-tertiary)"`
   - `start_before`/`start_after`: dashed `"6 3"`, `stroke: "var(--color-blue-500)"`
   - `finish_before`/`finish_after`: dashed `"6 3"`, `stroke: "var(--color-purple-500)"`
   - `implemented_by`/`implements`: dashed `"6 3"`, `stroke: "var(--color-green-500)"`

These are pure functions — no React, no MobX, fully testable.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add dependency path calculator utility`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Tests for dependency path calculator

**Verifies:** dep-viz-propagation.AC3.1, dep-viz-propagation.AC3.2

**Files:**

- Create: `apps/web/hw/helpers/dependency-path-calculator.test.ts`

**Testing:**

Tests for the pure functions:

- **dep-viz-propagation.AC3.1 (right-angle path):** Given two blocks (source at row 0, target at row 2), verify the path string contains the expected SVG commands (M for move, L for line segments forming a right-angle route).
- **dep-viz-propagation.AC3.2 (connector styling):** Verify `getConnectorStyle("blocking")` returns no dasharray (solid), `getConnectorStyle("start_before")` returns dasharray `"6 3"` (dashed).
- **Endpoint mapping:** Verify `getConnectorEndpoints("blocking")` returns `{ sourceEndpoint: "right", targetEndpoint: "left" }` (FS), `getConnectorEndpoints("start_before")` returns `{ sourceEndpoint: "left", targetEndpoint: "left" }` (SS), `getConnectorEndpoints("finish_before")` returns `{ sourceEndpoint: "right", targetEndpoint: "right" }` (FF).
- **Source below target:** Verify path renders correctly when source block is below the target (connector goes upward).
- **Same row:** Verify path renders correctly when source and target are on the same row.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(gantt): add tests for dependency path calculator`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Create individual connector component

**Verifies:** dep-viz-propagation.AC3.1, dep-viz-propagation.AC3.2, dep-viz-propagation.AC3.3

**Files:**

- Create: `apps/web/hw/components/gantt-chart/dependency/connector.tsx`

**Implementation:**

A memoised React component that renders a single dependency connector as an SVG `<path>` element.

Props:

```typescript
type ConnectorProps = {
  sourceBlock: IGanttBlock;
  targetBlock: IGanttBlock;
  sourceRowIndex: number;
  targetRowIndex: number;
  relationType: TIssueRelationTypes;
};
```

The component:

1. Checks that both blocks have `position` data (marginLeft, width). If either is missing, returns `null` (dep-viz-propagation.AC3.7).
2. Builds `BlockRect` objects from block positions and row indices using `BLOCK_HEIGHT`.
3. Calls `calculateConnectorPath` and `getConnectorStyle` from the path calculator.
4. Renders an SVG `<path>` element with the computed `d` attribute, stroke styles, and an arrowhead marker reference (`marker-end="url(#arrowhead)"`).

Wrap with `React.memo` to prevent re-renders when props haven't changed.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add memoised dependency connector component`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Implement TimelineDependencyPaths SVG overlay

**Verifies:** dep-viz-propagation.AC3.1, dep-viz-propagation.AC3.3, dep-viz-propagation.AC3.4, dep-viz-propagation.AC3.5, dep-viz-propagation.AC3.6, dep-viz-propagation.AC3.7

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx` (replace empty stub with full implementation)
- Modify: `apps/web/hw/components/gantt-chart/dependency/index.ts` (ensure connector is exported if needed)

**Implementation:**

Replace the empty stub with a full SVG overlay component. Note: the existing stub imports `FC` from React but doesn't use it — remove the unused `FC` import when replacing the stub.

The component:

1. **Reads block data** from the timeline store (`blocksMap`, `blockIds`).
2. **Reads relation data** from the issue detail relation store (`relationMap`).
3. **Computes visible dependencies** by iterating through `blockIds` and checking which blocks have scheduling dependencies where both endpoints are visible.
4. **Renders an SVG element** positioned absolutely over the blocks container, with:
   - An SVG `<defs>` section defining the arrowhead marker (dep-viz-propagation.AC3.3)
   - A `<g>` element for the group of connectors
   - One `<Connector>` component per visible dependency
5. **Viewport filtering** (dep-viz-propagation.AC3.6): Only render connectors where both source and target blocks are in `blockIds` and have valid `position` data (non-null `start_date` and `target_date`).
6. **No-date handling** (dep-viz-propagation.AC3.7): Skip any dependency where source or target has no position.

The SVG element needs:

- `position: absolute`, `top: 0`, `left: 0`
- `width` and `height` matching the container
- `pointer-events: none` so it doesn't interfere with block interactions
- `overflow: visible` for paths extending beyond the SVG bounds

The arrowhead marker definition:

```svg
<defs>
  <marker id="dep-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="currentColor" />
  </marker>
</defs>
```

The `blockIds` array provides the rendering order, which directly maps to row indices: `blockIds.indexOf(issueId)` gives the row index, and `rowIndex * BLOCK_HEIGHT` gives the vertical position.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

Run: `pnpm check:lint`
Expected: No lint errors.

**Commit:** `feat(gantt): implement TimelineDependencyPaths SVG overlay with connector rendering`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 5-6) -->

<!-- START_TASK_5 -->

### Task 5: Update CE dependency-paths stub to match HW

**Verifies:** dep-viz-propagation.AC3.7 (no errors in CE mode)

**Files:**

- Modify: `apps/web/ce/components/gantt-chart/dependency/dependency-paths.tsx` (keep as stub or sync)

**Implementation:**

The CE version should remain a no-op stub. Verify the CE stub still returns an empty fragment:

```typescript
export function TimelineDependencyPaths(props: Props) {
  return <></>;
}
```

The CE version intentionally does NOT render dependency paths — this is an HW-only feature. No changes needed if it's already an empty stub, but verify the props type still matches the HW version.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors across both CE and HW.

**Commit:** `chore(gantt): verify CE dependency-paths stub compatibility`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Tests for connector rendering and visibility filtering

**Verifies:** dep-viz-propagation.AC3.1, dep-viz-propagation.AC3.2, dep-viz-propagation.AC3.3, dep-viz-propagation.AC3.6, dep-viz-propagation.AC3.7

**Files:**

- Create: `apps/web/hw/components/gantt-chart/dependency/dependency-paths.test.ts`

**Testing:**

This test file should test the visibility/filtering logic extracted as a helper function from the component (not the rendering itself, which requires a full DOM environment). Test:

- **dep-viz-propagation.AC3.6 (visibility filtering):** Given a set of blocks and relations, the filtering function should return only dependencies where both source and target are in the visible block list.
- **dep-viz-propagation.AC3.7 (no-date blocks):** Given a block without `position` data (no dates), the filtering should exclude any dependency involving that block.
- **Multiple dependency types:** Given blocks with `blocking`, `start_before`, and `finish_before` relations, all three should appear in the filtered list.
- **No dependencies:** Given blocks with no scheduling relations, the filtered list should be empty.
- **Non-scheduling relations ignored:** `relates_to` and `duplicate` relations should not produce connectors.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(gantt): add tests for dependency visibility filtering`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
