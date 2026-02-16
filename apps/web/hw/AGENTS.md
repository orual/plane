# HW web overlay (hardware/enterprise features)

Last verified: 2026-02-16 <!-- cpm-critical-path -->

## Purpose

Provides hardware/enterprise-edition features that extend the community edition
(CE) frontend. Uses the HW/CE overlay pattern: feature implementations live here
with matching CE stubs in `apps/web/ce/`.

## Contracts

- **Exposes** (via `IBaseTimelineStore` interface):
  - Dependency drag: `startDependencyDrag`, `updateDependencyDragCursor`,
    `setDependencyDragTarget`, `endDependencyDrag`, `dependencyDragState`
  - Preview positions: `computePreviewPositions`, `clearPreviewPositions`,
    `previewBlockIds`
  - Conflict detection: `getDependencyConflicts`, `hasConflict`
  - CPM (Critical Path Method): `cpmEnabled`, `crossProjectCpmEnabled`,
    `setCpmEnabled`, `setCrossProjectCpmEnabled`, `cpmResults` (computed
    `CpmResultMap`), `isCritical(blockId)`, `getSlack(blockId)`,
    `getComputedDates(blockId)`, `setDraggingBlock`, `isDraggingBlock`,
    `fetchCrossProjectRelations`, `crossProjectRelationCache`
- **Exposes** (via HW/CE overlay components, imported by `core/` through
  `@/plane-web/` alias):
  - `TimelineDependencyPaths` -- SVG overlay rendering dependency connectors
  - `ConflictIndicator` -- visual indicator on gantt blocks with constraint
    violations
  - `ConflictBadge` -- badge component for relation UI showing conflict count
  - `DependencyLeftDraggable`, `DependencyRightDraggable` -- drag handles on
    block edges for creating dependencies
  - `CpmToggle` -- toolbar toggle for CPM mode (with cross-project sub-toggle)
  - `CpmTooltipContent` -- tooltip showing ES/EF/LS/LF and slack values
  - `PhantomAnchor` -- visual indicator for cross-project dependency anchors
  - `CriticalBlockStyle` -- wrapper applying red styling to critical-path blocks
  - `ComputedDateIndicator` -- "auto" badge on blocks with CPM-computed dates
  - `GanttAdditionalLayers` -- overlay layer rendering slack extension bars and
    phantom anchors
- **Exposes** (via HW/CE overlay helpers, imported through `@/plane-web/`
  alias):
  - `computeCpm(relationMap, getIssueDates)` -- pure functional CPM engine
    returning `CpmResultMap` with ES/EF/LS/LF/slack/isCritical per issue
  - `getSlackBarPosition(cpmResult, chartData, offsetWidth)` -- pixel position
    calculator for slack extension bars
- **Guarantees**:
  - Every method on `IBaseTimelineStore` has a CE stub in
    `apps/web/ce/store/timeline/base-timeline.store.ts` (stubs are no-ops or
    return empty/false).
  - Conflict detection returns `ConflictInfo[]` (never throws).
  - Dependency validation detects cycles client-side before server round-trip.
  - Preview positions update in-place on `blocksMap` during drag, then
    `clearPreviewPositions` restores via next `updateBlocks` call.
  - `computeCpm` is pure functional (no side effects, no store access). It
    accepts a relation map and a date-lookup function, returns a `CpmResultMap`.
  - CPM results are cached during block drag (`isDraggingBlock`) to avoid
    expensive recomputation on every pixel move.
  - When `crossProjectCpmEnabled` is true, external issue relations are merged
    into the CPM graph via `crossProjectRelationCache`.
  - Dateless blocks with CPM predecessors receive virtual computed dates
    (`dateSource: "computed"` on `IGanttBlock`). Dragging a computed-date block
    converts it to manual dates (both start and target are set).
- **Expects**: `rootStore.issue.issueDetail.relation.relationMap` populated.
  `blocksMap` populated with current gantt blocks. For cross-project CPM,
  `fetchCrossProjectRelations` must be called to populate
  `crossProjectRelationCache`.

## Dependencies

- **Uses**: `@plane/types` (relation types), MobX stores (relation map, issue
  detail), gantt chart helpers (position/date conversion)
- **Used by**: `apps/web/core/components/gantt-chart/` (block component,
  resizable hooks), `apps/web/core/components/issues/` (relation widgets)
- **Boundary**: HW code must never be imported directly by `core/` or `ce/`.
  The CE stubs in `apps/web/ce/` provide the interface contract.

## HW/CE overlay pattern

When adding a new HW feature:

1. Define the interface method on `IBaseTimelineStore` (or relevant interface).
2. Implement in `apps/web/hw/` with full logic.
3. Add a matching stub in `apps/web/ce/` that is a no-op or returns a safe
   default (empty array, false, undefined).
4. Both files must satisfy the same TypeScript interface.

## Key decisions

- Client-side cycle detection mirrors the backend algorithm (DFS, depth limit 100) to provide instant feedback before server round-trip.
- Drag endpoint mapping: right-to-left = blocking (FS), left-to-left =
  start_before (SS), right-to-right/left-to-right = finish_before (FF).
- Preview positions are computed from the in-memory relation graph during drag,
  then reconciled with the server response after drop.
- Server reconciliation: `base-issues.store.ts` processes the
  `updated_dependents` array from the API response to update dependent issue
  dates in the MobX store, ensuring client state matches server state.
- CPM calculation is purely client-side (no backend changes). It reuses the
  existing `TIssueRelationMap` from the store and builds its own adjacency
  lists, topological sort, forward/backward passes.
- CPM supports three edge types: FS (blocking), SS (start_before), FF
  (finish_before), matching the dependency drag endpoint mapping.
- Dateless issues in the dependency graph receive virtual computed dates from
  the CPM forward pass (ES/EF). The `dateSource` field on `IGanttBlock`
  distinguishes manual from computed dates.
- Dragging a computed-date block converts it to manual: both `start_date` and
  `target_date` are set in the update payload, removing the "computed" status.
- Cross-project CPM fetches external issue relations lazily and caches them in
  `crossProjectRelationCache`. The merged relation map is passed to `computeCpm`
  only when `crossProjectCpmEnabled` is true.
- Slack extension bars render from EF to LF position. Critical tasks (slack=0)
  get no bar; instead their block wrapper turns red via `CriticalBlockStyle`.

## Key files

- `store/timeline/base-timeline.store.ts` -- full HW implementation of timeline
  store with dependency drag, preview, conflict detection, and CPM
- `helpers/dependency-validation.ts` -- client-side cycle detection and relation
  type inference from drag endpoints
- `helpers/dependency-conflict.ts` -- conflict detection comparing issue dates
  against predecessor constraints
- `helpers/dependency-path-calculator.ts` -- SVG path geometry for connector
  lines between gantt blocks
- `helpers/cpm-calculator.ts` -- pure functional CPM engine (graph building,
  topological sort, forward/backward passes, slack calculation)
- `helpers/slack-bar-position.ts` -- pixel position helper for slack extension
  bars (EF to LF)
- `components/gantt-chart/dependency/` -- SVG overlay components for dependency
  visualization (connectors, draggable paths, visibility filtering)
- `components/gantt-chart/cpm/` -- CPM visualization components (toggle,
  tooltip, phantom anchor for cross-project)
- `components/gantt-chart/blocks/` -- block styling wrappers (critical path
  red styling, computed-date "auto" indicator)
- `components/gantt-chart/layers/` -- additional gantt layers (slack extension
  bars, phantom anchors for external issues)
- `components/relations/` -- relation UI components (conflict badge, activity)
