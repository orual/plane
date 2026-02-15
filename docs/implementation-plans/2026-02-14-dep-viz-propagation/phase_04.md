# Dependency Visualization and Date Propagation — Phase 4: Drag-to-Create Dependencies

**Goal:** Allow users to create dependency relations by dragging from one gantt block's edge handle to another block's edge, with real-time visual feedback and validation.

**Architecture:** The existing `LeftDependencyDraggable` and `RightDependencyDraggable` stubs on each `ChartDraggable` block are implemented to show circular handles on hover and initiate drag operations. A rubber-band SVG line (`TimelineDraggablePath`) follows the cursor during drag. Block hit detection determines the target, and the drag endpoint combination determines the relation type (right→left = FS/blocking, left→left = SS/start_before, right→right = FF/finish_before). The frontend cycle detection helper (from Phase 2) validates targets before the API call. Drag state is managed in the timeline store.

**Tech Stack:** React, SVG, MobX, TypeScript, native mouse events

**Scope:** 7 phases from original design (phase 4 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC4: Drag-to-create dependencies

- **dep-viz-propagation.AC4.1 Success:** Hovering a gantt block reveals circular handles at left and right edges
- **dep-viz-propagation.AC4.2 Success:** Dragging from right handle to another block's left edge creates a Finish-to-Start (blocking) relation
- **dep-viz-propagation.AC4.3 Success:** Dragging from left handle to another block's left edge creates a Start-to-Start (start_before) relation
- **dep-viz-propagation.AC4.4 Success:** Dragging from right handle to another block's right edge creates a Finish-to-Finish (finish_before) relation
- **dep-viz-propagation.AC4.5 Success:** Rubber-band SVG line follows cursor during drag, snapping to target block on hover
- **dep-viz-propagation.AC4.6 Success:** Valid drop targets highlight green, invalid targets (same issue, would-create-cycle) highlight red
- **dep-viz-propagation.AC4.7 Failure:** Dropping on empty space (no target block) cancels the drag — no relation created, no error
- **dep-viz-propagation.AC4.8 Edge:** Created dependency renders as a connector line immediately after drop (no page reload needed)

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Add dependency drag state to timeline store

**Verifies:** dep-viz-propagation.AC4.5, dep-viz-propagation.AC4.6 (state needed for visual feedback)

**Files:**

- Modify: `apps/web/hw/store/timeline/base-timeline.store.ts` (add dependency drag observables and actions)

**Implementation:**

Add new observable state and actions to the timeline store for tracking dependency drag operations. The store already has `isDependencyEnabled` (line 85) and a stub method `getIsCurrentDependencyDragging` (line 345).

New observables to add:

```typescript
dependencyDragState: {
  isDragging: boolean;
  sourceBlockId: string | null;
  sourceEndpoint: "left" | "right" | null;
  cursorX: number;
  cursorY: number;
  hoveredTargetBlockId: string | null;
  hoveredTargetEndpoint: "left" | "right" | null;
  isValidTarget: boolean;
} = {
  isDragging: false,
  sourceBlockId: null,
  sourceEndpoint: null,
  cursorX: 0,
  cursorY: 0,
  hoveredTargetBlockId: null,
  hoveredTargetEndpoint: null,
  isValidTarget: false,
};
```

New actions:

- `startDependencyDrag(blockId: string, endpoint: "left" | "right")` — sets drag state
- `updateDependencyDragCursor(x: number, y: number)` — updates cursor position during mousemove
- `setDependencyDragTarget(blockId: string | null, endpoint: "left" | "right" | null, isValid: boolean)` — updates hover target
- `endDependencyDrag()` — resets all drag state
- Update `getIsCurrentDependencyDragging(blockId)` to return `this.dependencyDragState.isDragging && this.dependencyDragState.sourceBlockId === blockId`

Make `dependencyDragState` observable with `observable.deep` and all new methods as `action`.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): add dependency drag state management to timeline store`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Implement dependency type inference helper

**Verifies:** dep-viz-propagation.AC4.2, dep-viz-propagation.AC4.3, dep-viz-propagation.AC4.4

**Files:**

- Modify: `apps/web/hw/helpers/dependency-validation.ts` (add type inference function alongside existing cycle detection)

**Implementation:**

Add a function to infer the relation type from the source and target drag endpoints:

```typescript
function inferRelationType(sourceEndpoint: "left" | "right", targetEndpoint: "left" | "right"): TIssueRelationTypes;
```

Mapping:

- `right` → `left` = `"blocking"` (Finish-to-Start)
- `left` → `left` = `"start_before"` (Start-to-Start)
- `right` → `right` = `"finish_before"` (Finish-to-Finish)
- `left` → `right` = `"finish_before"` (treated as FF — left-to-right drags are unusual in project scheduling; there is no Start-to-Finish type in the backend model, so we map this to the closest logical match)

This function is pure and testable.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(web): add dependency type inference from drag endpoints`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->

### Task 3: Implement LeftDependencyDraggable and RightDependencyDraggable

**Verifies:** dep-viz-propagation.AC4.1, dep-viz-propagation.AC4.7

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/dependency/blockDraggables/left-draggable.tsx` (replace stub)
- Modify: `apps/web/hw/components/gantt-chart/dependency/blockDraggables/right-draggable.tsx` (replace stub)

**Implementation:**

Both components follow the same pattern (mirrored for left/right). Replace the empty stubs.

Each component renders a circular handle (8px diameter) at the respective block edge. The handle:

- Is invisible by default (`opacity-0`)
- Becomes visible on parent block hover via CSS group (`group-hover:opacity-100`)
- Uses `cursor: crosshair` to indicate drag action

On `mousedown` on the handle:

1. Call `startDependencyDrag(block.id, "left" | "right")` on the timeline store
2. Attach `mousemove` and `mouseup` listeners to `document` (same pattern as `use-gantt-resizable.ts` line 141)
3. On `mousemove`: call `updateDependencyDragCursor(x, y)` with coordinates relative to the gantt container
4. On `mouseup`: call the completion handler (determine target, infer type, create relation or cancel)

For target detection during mousemove:

- Calculate which row the cursor is over: `Math.floor(cursorY / BLOCK_HEIGHT)` gives the `blockIds` index
- Determine if cursor is on the left or right half of the target block
- Call `setDependencyDragTarget(targetBlockId, endpoint, isValid)` with cycle detection validation using `detectCycleInMemory` from Phase 2

The handle positioning:

- Left handle: positioned at `left: -4px`, vertically centered on the block
- Right handle: positioned at `right: -4px`, vertically centered on the block
- Both use `position: absolute` and `z-index: 10` to sit above block content

On `mouseup`:

- If `hoveredTargetBlockId` is null or `!isValidTarget`, call `endDependencyDrag()` and return (dep-viz-propagation.AC4.7)
- Otherwise, infer relation type via `inferRelationType`, call `createCurrentRelation` on the relation store, then call `endDependencyDrag()`

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): implement dependency drag handles on block edges`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Implement TimelineDraggablePath rubber-band line

**Verifies:** dep-viz-propagation.AC4.5, dep-viz-propagation.AC4.6

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/dependency/draggable-dependency-path.tsx` (replace stub)

**Implementation:**

Replace the empty stub with an SVG component that renders the rubber-band line during dependency drag. The component:

1. Reads `dependencyDragState` from the timeline store (observer component)
2. If `!dependencyDragState.isDragging`, returns `null`
3. Renders an SVG element (same positioning as `TimelineDependencyPaths` — absolute, pointer-events: none)
4. Draws a line from the source block's edge to:
   - The cursor position (when no target is hovered)
   - The target block's snapped edge (when hovering a valid target — dep-viz-propagation.AC4.5)
5. Line colour:
   - Grey when hovering empty space
   - Green when hovering a valid target (dep-viz-propagation.AC4.6)
   - Red when hovering an invalid target (same issue, would-create-cycle — dep-viz-propagation.AC4.6)

The source point is calculated from the source block's position in `blocksMap`:

- Left endpoint: `(block.position.marginLeft, rowIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2)`
- Right endpoint: `(block.position.marginLeft + block.position.width, rowIndex * BLOCK_HEIGHT + BLOCK_HEIGHT / 2)`

When a valid target is hovered, snap the endpoint to the target block's appropriate edge.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(gantt): implement rubber-band SVG line for dependency drag`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Wire up dependency creation on drop

**Verifies:** dep-viz-propagation.AC4.2, dep-viz-propagation.AC4.3, dep-viz-propagation.AC4.4, dep-viz-propagation.AC4.7, dep-viz-propagation.AC4.8

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/dependency/blockDraggables/left-draggable.tsx` (add drop handler)
- Modify: `apps/web/hw/components/gantt-chart/dependency/blockDraggables/right-draggable.tsx` (add drop handler)

**Implementation:**

In the mouseup handler of both draggable components, add the relation creation logic:

1. Read drag state from timeline store
2. If no valid target, call `endDependencyDrag()` and return (dep-viz-propagation.AC4.7)
3. Infer relation type from `inferRelationType(sourceEndpoint, targetEndpoint)`
4. Call `createCurrentRelation(sourceBlockId, relationType, targetBlockId)` on the relation store
   - This uses optimistic update — the relation appears in the store immediately
   - The connector line from Phase 3 renders automatically (dep-viz-propagation.AC4.8)
5. Call `endDependencyDrag()` to clean up

Error handling:

- If `createCurrentRelation` fails (e.g., cycle detected by server), the optimistic update rolls back automatically (see `relation.store.ts` lines 211-224)
- Show a toast notification on error using the existing `setToast` pattern

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

Run: `pnpm check:lint`
Expected: No lint errors.

**Commit:** `feat(gantt): wire up dependency creation on drag-and-drop completion`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 6-7) -->

<!-- START_TASK_6 -->

### Task 6: Update CE stubs for consistency

**Verifies:** No regressions in CE mode

**Files:**

- Verify: `apps/web/ce/components/gantt-chart/dependency/blockDraggables/left-draggable.tsx` (keep as stub)
- Verify: `apps/web/ce/components/gantt-chart/dependency/blockDraggables/right-draggable.tsx` (keep as stub)
- Verify: `apps/web/ce/components/gantt-chart/dependency/draggable-dependency-path.tsx` (keep as stub)

**Implementation:**

CE versions remain as empty stubs. Verify prop types still match HW versions. CE does not support dependency drag — this is HW-only.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `chore(gantt): verify CE dependency drag stubs compatibility`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Tests for drag-to-create logic

**Verifies:** dep-viz-propagation.AC4.2, dep-viz-propagation.AC4.3, dep-viz-propagation.AC4.4, dep-viz-propagation.AC4.6, dep-viz-propagation.AC4.7

**Files:**

- Create: `apps/web/hw/helpers/dependency-validation.test.ts` (extend existing test file from Phase 2)
- Create: `apps/web/hw/store/timeline/dependency-drag.test.ts`

**Testing:**

**dependency-validation.test.ts** — Add tests for `inferRelationType`:

- **dep-viz-propagation.AC4.2:** `inferRelationType("right", "left")` returns `"blocking"`
- **dep-viz-propagation.AC4.3:** `inferRelationType("left", "left")` returns `"start_before"`
- **dep-viz-propagation.AC4.4:** `inferRelationType("right", "right")` returns `"finish_before"`

**dependency-drag.test.ts** — Tests for the drag state management:

- **Store state transitions:** Calling `startDependencyDrag` sets `isDragging: true` and source info. Calling `endDependencyDrag` resets all state.
- **Target validation:** Setting a target with `isValid: true` stores it correctly. Setting `isValid: false` stores it with invalid flag.
- **dep-viz-propagation.AC4.7 (empty space drop):** When `hoveredTargetBlockId` is null and drag ends, no relation creation should be triggered.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(gantt): add tests for dependency drag-to-create logic`

<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_C -->
