# Critical Path Method (CPM) Calculation and Visualization Design

## Summary

This feature brings Critical Path Method (CPM) scheduling to Plane's gantt charts, identifying which tasks are critical to project completion and allowing dateless tasks to be automatically positioned based on their dependencies. The implementation follows CPM's forward-backward pass algorithm: a forward pass computes the earliest start/finish times by walking the dependency graph from roots to leaves, a backward pass computes the latest start/finish times by walking backward from the project deadline, and the difference between these values reveals each task's slack (schedule flexibility). Tasks with zero slack form the critical path — any delay to these tasks delays the entire project.

The architecture is entirely client-side using MobX reactive patterns, with pure calculation functions feeding computed stores that drive UI rendering. When a user enables the CPM toggle, critical path tasks highlight in red, non-critical tasks show slack extension bars indicating available float, and dateless tasks with dependency relationships appear on the gantt at computed positions with dashed borders. The feature integrates with existing dependency visualization and conflict detection, reusing the same relation data structures and MobX reactivity patterns established in the dep-viz-propagation work. Cross-project mode allows the calculation to follow dependency chains across project boundaries, with phantom anchors marking external constraints at timeline edges.

## Definition of Done

When issues in a dependency graph have their critical path calculated via the Critical Path Method (forward/backward pass), zero-slack tasks are visually highlighted on the gantt timeline, and issues without explicit dates are positioned on the gantt based on their computed position in the dependency graph.

Specifically:

1. **CPM calculation engine** — forward/backward pass computes Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish (LF), and slack/float for all issues in a dependency graph. Per-project scope by default, with opt-in to follow cross-project dependency chains.

2. **Critical path visualization** — issues on the critical path (zero slack) are visually highlighted on the gantt timeline with a distinct colour/style. Non-critical tasks show their available slack.

3. **Virtual date positioning** — issues without explicit `start_date`/`target_date` but with dependency relationships get positioned on the gantt based on their computed position in the dependency graph (forward pass results). This effectively provides auto-scheduling for dateless tasks as a natural consequence of CPM calculation.

4. **Slack visualization** — non-critical tasks display their available float, giving users visibility into schedule flexibility.

**Out of scope:** lag/lead times on dependencies, resource leveling/workload tracking, Start-to-Finish dependency type, explicit duration fields (duration is computed as `target_date - start_date`).

## Acceptance Criteria

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

### cpm-critical-path.AC2: CPM store integration

- **cpm-critical-path.AC2.1 Success:** `cpmResults` recomputes when a block's dates change
- **cpm-critical-path.AC2.2 Success:** `cpmResults` recomputes when a relation is added or removed
- **cpm-critical-path.AC2.3 Success:** `isCritical(blockId)` returns true for zero-slack blocks and false otherwise
- **cpm-critical-path.AC2.4 Success:** `getSlack(blockId)` returns correct float in days
- **cpm-critical-path.AC2.5 Success:** When `cpmEnabled` is false, `cpmResults` returns empty map without computing
- **cpm-critical-path.AC2.6 Edge:** Changing a single block only re-renders blocks whose CPM values actually changed (memoisation)

### cpm-critical-path.AC3: Virtual date injection

- **cpm-critical-path.AC3.1 Success:** Dateless task with FS predecessor appears on gantt at computed position when CPM is enabled
- **cpm-critical-path.AC3.2 Success:** Injected block has `dateSource: 'computed'` flag
- **cpm-critical-path.AC3.3 Success:** Computed-date blocks render with dashed border and reduced opacity
- **cpm-critical-path.AC3.4 Success:** Dragging a computed-date block sets real dates, converting `dateSource` to `'manual'`
- **cpm-critical-path.AC3.5 Failure:** Computed-date blocks cannot be resized (no drag handles for resize)
- **cpm-critical-path.AC3.6 Edge:** Dateless tasks with no dependency chain membership remain hidden (no virtual date assigned)
- **cpm-critical-path.AC3.7 Edge:** Toggling CPM off removes computed-date blocks from the gantt (they return to hidden state)

### cpm-critical-path.AC4: Critical path visualization

- **cpm-critical-path.AC4.1 Success:** Toggle button appears in gantt toolbar and controls CPM state
- **cpm-critical-path.AC4.2 Success:** Zero-slack tasks display red/coral background when CPM is active
- **cpm-critical-path.AC4.3 Success:** Dependency connectors between critical path tasks render in red
- **cpm-critical-path.AC4.4 Success:** Non-critical tasks retain their default colour
- **cpm-critical-path.AC4.5 Success:** Critical + computed blocks show red fill with dashed border
- **cpm-critical-path.AC4.6 Edge:** Toggling CPM off restores all blocks and connectors to default appearance
- **cpm-critical-path.AC4.7 Edge:** CPM toggle is off by default on page load

### cpm-critical-path.AC5: Slack visualization and tooltips

- **cpm-critical-path.AC5.1 Success:** Non-critical tasks show light-coloured extension bar from EF to LF
- **cpm-critical-path.AC5.2 Success:** Slack bar renders at ~30% opacity, same height as task bar
- **cpm-critical-path.AC5.3 Success:** Hovering a block with CPM active shows ES, EF, LS, LF, and total float in tooltip
- **cpm-critical-path.AC5.4 Success:** Critical tasks show "On critical path — zero slack" in tooltip
- **cpm-critical-path.AC5.5 Edge:** Slack bars only render when CPM is enabled
- **cpm-critical-path.AC5.6 Edge:** Tasks with zero slack show no extension bar (critical path, no slack to display)

### cpm-critical-path.AC6: Cross-project CPM

- **cpm-critical-path.AC6.1 Success:** Cross-project toggle appears when CPM is enabled
- **cpm-critical-path.AC6.2 Success:** Enabling cross-project mode fetches relations for external issues
- **cpm-critical-path.AC6.3 Success:** CPM calculation follows dependency chains across project boundaries
- **cpm-critical-path.AC6.4 Success:** Phantom anchors render at timeline edges for external constraints
- **cpm-critical-path.AC6.5 Success:** Phantom anchor tooltip shows external issue identifier, project name, and dates
- **cpm-critical-path.AC6.6 Edge:** Per-project mode (default) uses cross-project predecessor actual dates as fixed inputs without walking further
- **cpm-critical-path.AC6.7 Edge:** Cross-project traversal respects MAX_PROPAGATION_DEPTH = 100

### cpm-critical-path.AC7: E2E tests

- **cpm-critical-path.AC7.1 Success:** Toggling CPM on for a project with dependencies shows critical path highlights on the gantt
- **cpm-critical-path.AC7.2 Success:** A dependency chain (A→B→C) correctly identifies and highlights the critical tasks
- **cpm-critical-path.AC7.3 Success:** A dateless task with a dependency appears on the gantt at its computed position when CPM is enabled
- **cpm-critical-path.AC7.4 Success:** Dragging a computed-date block converts it to manual dates that persist after CPM is toggled off
- **cpm-critical-path.AC7.5 Success:** Slack extension bars appear for non-critical tasks and are absent for critical tasks
- **cpm-critical-path.AC7.6 Success:** Enabling cross-project mode shows phantom anchors at timeline edges for external dependencies

## Glossary

- **Critical Path Method (CPM)**: A project scheduling algorithm that identifies the longest sequence of dependent tasks from project start to finish. Tasks on this path have zero schedule flexibility — any delay directly impacts project completion.
- **Forward pass**: The first phase of CPM calculation that walks the dependency graph from root tasks to leaf tasks, computing the earliest possible start and finish dates for each task based on its predecessors.
- **Backward pass**: The second phase of CPM calculation that walks the dependency graph in reverse (from leaf tasks to roots), computing the latest allowable start and finish dates for each task without delaying project completion.
- **Early Start (ES) / Early Finish (EF)**: The earliest dates a task can start and finish based on when its predecessor tasks complete.
- **Late Start (LS) / Late Finish (LF)**: The latest dates a task can start and finish without delaying the project's overall completion.
- **Slack / Float**: The amount of time a task can be delayed without affecting the project deadline or dependent tasks. Calculated as `LS - ES`. Zero slack indicates a critical path task.
- **Finish-to-Start (FS)**: A dependency type where task B cannot start until task A finishes. The most common dependency relationship (corresponds to `blocking`/`blocked_by` relations).
- **Start-to-Start (SS)**: A dependency type where task B cannot start until task A starts (corresponds to `start_before`/`start_after` relations).
- **Finish-to-Finish (FF)**: A dependency type where task B cannot finish until task A finishes (corresponds to `finish_before`/`finish_after` relations).
- **Topological sort**: An ordering of graph nodes such that for every directed edge from node A to node B, A comes before B in the ordering. Essential for CPM calculation to ensure predecessors are processed before successors.
- **Phantom anchor**: A visual marker on the gantt timeline representing an external (cross-project) dependency that constrains the current project but doesn't appear as a full block.
- **Virtual date / Computed date**: Dates automatically calculated for dateless tasks based on their position in the dependency graph, allowing them to appear on the gantt without explicit user-assigned start/target dates.
- **HW/CE overlay pattern**: Plane's architecture for enterprise (HW) features where full implementations live in `hw/` and no-op stubs in `ce/` (community edition), resolved via build-time aliasing.
- **`computedFn`**: A MobX utility that memoises computed functions per-argument, ensuring only blocks whose CPM values changed trigger re-renders.
- **Adjacency list**: A graph representation where each node stores a list of its connected nodes. The backend's `dependency_graph.py` uses `{ predecessor_id: [(successor_id, relation_type)] }`.
- **Drag debouncing**: Performance optimisation where expensive computations (like CPM recalculation) are suppressed during drag operations and only run once when the drag completes.
- **SVG overlay**: Graphical elements rendered on top of the gantt chart using SVG, such as dependency connectors and slack bars.

## Architecture

The CPM engine lives entirely client-side as MobX computed values in the timeline store, following
the same reactive pattern as existing dependency conflict detection (`getDependencyConflicts`,
`hasConflict`). Zero new API endpoints. When the CPM toggle is off, computations short-circuit
to an empty map with zero performance cost.

### Three components

**1. CPM calculator (pure functions)**

A set of pure functions in `apps/web/hw/helpers/cpm-calculator.ts` that take a dependency graph
and block date data as inputs and return CPM results. No side effects, no store access — purely
functional, easily testable.

- **Graph transposition:** converts `relationMap` (issue-centric: `Record<issueId, Record<relationType, string[]>>`)
  into a predecessor→successors adjacency list matching the backend's `dependency_graph.py` shape.
  Only scheduling relation types participate (`blocking`/`blocked_by`, `start_before`/`start_after`,
  `finish_before`/`finish_after`).
- **Forward pass:** for each root issue (no predecessors), `ES = start_date`, `EF = target_date`.
  For each successor in topological order, `ES = max(predecessor constraints based on dependency type)`,
  `EF = ES + duration`. Duration is `target_date - start_date` for dated issues, 1 day for dateless
  issues in dependency chains.
- **Backward pass:** anchor is `max(EF)` across all leaf nodes (issues with no successors). Walk
  backward in reverse topological order: `LF = min(successor constraints based on dependency type)`,
  `LS = LF - duration`.
- **Slack calculation:** `Total Float = LS - ES`. Critical path = issues where float is zero.

Dependency type constraint rules (matching dep-viz-propagation semantics):

| Type                             | Forward pass rule                     | Backward pass rule                    |
| -------------------------------- | ------------------------------------- | ------------------------------------- |
| Finish-to-Start (blocking)       | Successor ES = Predecessor EF + 1 day | Predecessor LF = Successor LS - 1 day |
| Start-to-Start (start_before)    | Successor ES = Predecessor ES         | Predecessor LS = Successor LS         |
| Finish-to-Finish (finish_before) | Successor EF = Predecessor EF         | Predecessor LF = Successor LF         |

Output contract:

```typescript
interface CpmResult {
  es: string; // Early Start (ISO date)
  ef: string; // Early Finish (ISO date)
  ls: string; // Late Start (ISO date)
  lf: string; // Late Finish (ISO date)
  slack: number; // Total float in days
  isCritical: boolean; // slack === 0
}

type CpmResultMap = Map<string, CpmResult>; // issueId → CpmResult
```

**2. CPM store layer (MobX computed values)**

Computed values added to the existing timeline store in `apps/web/hw/store/timeline/`:

- `cpmEnabled: boolean` — toggle state, defaults to `false`.
- `crossProjectCpmEnabled: boolean` — secondary toggle, defaults to `false`.
- `cpmResults: CpmResultMap` — the core computed value. Reacts to `blocksMap` and `relationMap`.
  When `cpmEnabled` is false, returns empty map immediately.
- `isCritical(blockId): boolean` — per-block computed, reads from `cpmResults`.
- `getSlack(blockId): number` — per-block computed.
- `getComputedDates(blockId): { start_date: string, target_date: string } | null` — returns
  virtual dates for dateless blocks, `null` for dated blocks.

Per-block values use `computedFn` for memoisation — MobX only re-renders blocks whose CPM values
actually changed, not all blocks on every recalculation.

**3. Virtual date injection**

Before position calculation in the block update pipeline, a reactive layer checks each block:
if `start_date` and `target_date` are both null but `getComputedDates(blockId)` returns values,
the computed dates are injected into the block and `dateSource` is set to `'computed'`.

Block type extension:

```typescript
// Added to IGanttBlock
dateSource?: "manual" | "computed";
```

Blocks with `dateSource: 'manual'` (or undefined for backward compatibility) behave identically
to current behaviour. Blocks with `dateSource: 'computed'` go through the same positioning pipeline
but render with distinct styling. Dateless issues not in any dependency chain remain unchanged.

Interaction rules for computed-date blocks:

- **Not resizable** — no user-set dates to stretch/shrink.
- **Drag-movable** — dragging a computed block sets real dates on it, converting `dateSource`
  to `'manual'` and triggering the normal propagation flow.

### Cross-project mode

**Default (per-project):** CPM calculation only considers issues and relations within the current
project. Cross-project predecessors are treated as fixed external constraints — their actual dates
are used as inputs but the calculation does not walk further up the chain.

**Opt-in (cross-project):** When enabled via a secondary toggle, the calculation follows dependency
chains across project boundaries. This requires fetching relations for issues outside the current
project via the existing relation API. Fetched data is cached in the store and invalidated when
relations change.

Cross-project issues do not appear as blocks on the current project's gantt. Instead, they render
as "phantom anchors" — small markers at the timeline edges showing the external constraint. Tooltip
on the anchor displays the external issue identifier, project name, and its dates.

### Visualization

**Critical path toggle:** button in the gantt toolbar/view options area, near the existing
week/month/quarter switcher. Not default-on.

**Critical path highlighting:**

- Zero-slack tasks: gantt block background shifts to red/coral.
- Dependency connector lines between critical path tasks also shift to red.
- Non-critical tasks retain their current colour.

**Slack visualization:**

- Non-critical tasks show a light-coloured extension bar (~30% opacity) extending from the
  task's Early Finish to its Late Finish, following the ClickUp pattern.
- Same height as the task bar, clearly "extra time" rather than task duration.
- No numeric values on the bar — slack days shown in tooltip on hover.

**Computed-date block styling:**

- Dashed border and ~80% opacity to distinguish from manually-dated blocks.
- Small "auto" badge icon in the task row indicating scheduling mode.
- When both critical AND computed: red fill with dashed border.

**Tooltip enrichment:** hovering any block while CPM is active shows ES, EF, LS, LF, and total
float. Critical tasks note "On critical path — zero slack."

### Performance

- Forward+backward pass is O(V+E), sub-millisecond for typical projects (<500 issues).
- **Drag debouncing:** during gantt block drag, CPM recomputation is suppressed. Compute once at
  drag start (for visual context), suppress during drag frames, recompute on drop.
- **Per-block memoisation:** `computedFn` ensures only blocks whose CPM values changed trigger
  re-renders.
- **Toggle off = zero cost:** `cpmResults` short-circuits to empty map.
- **Depth limit:** graph traversal respects `MAX_PROPAGATION_DEPTH = 100`.

## Existing Patterns

This design follows patterns established in the dep-viz-propagation implementation:

- **Computed conflict detection** — `getDependencyConflicts(blockId)` and `hasConflict(blockId)`
  in `apps/web/hw/store/timeline/base-timeline.store.ts` provide the exact pattern for per-block
  MobX computed values that derive from blocks and relations. CPM adds `isCritical(blockId)`,
  `getSlack(blockId)`, and `getComputedDates(blockId)` following the same shape.

- **Pure calculation helpers** — `apps/web/hw/helpers/dependency-path-calculator.ts` and
  `apps/web/hw/helpers/dependency-conflict.ts` establish the pattern of pure functions for
  dependency graph calculations. `cpm-calculator.ts` follows this pattern.

- **SVG overlay rendering** — `TimelineDependencyPaths` and `GanttAdditionalLayers` demonstrate
  how visual overlays are integrated into the gantt render tree. Critical path highlighting
  and slack bars follow this integration pattern.

- **Relation map access** — the timeline store accesses relation data via
  `this.rootStore.issue.issueDetail.relation.relationMap`. The CPM engine uses the same access
  path and the same relation types.

- **HW/CE overlay** — all new components and helpers go in `hw/` with parallel no-op stubs in
  `ce/`. Core gantt components remain untouched. Import resolution via `@/plane-web/` alias.

- **Backend graph shape** — the backend's `dependency_graph.py` uses a
  `{ predecessor_id: [(successor_id, relation_type), ...] }` adjacency list. The frontend graph
  transposition produces the same shape for consistency.

- **Safety limits** — `MAX_PROPAGATION_DEPTH = 100` is reused from the propagation engine.

No new patterns are introduced.

## Implementation Phases

<!-- START_PHASE_1 -->

### Phase 1: CPM calculation engine

**Goal:** Implement the core CPM algorithm as pure functions with comprehensive tests.

**Components:**

- `apps/web/hw/helpers/cpm-calculator.ts` — graph transposition, topological sort, forward pass,
  backward pass, slack calculation. Pure functions, no store dependencies.
- `apps/web/ce/helpers/cpm-calculator.ts` — CE stub exporting the same interface with functions
  that return empty results.

**Dependencies:** None (first phase). Depends on the existing `relationMap` shape and
`IssueRelation` types from dep-viz-propagation, which are already implemented.

**Done when:** Forward and backward pass correctly compute ES, EF, LS, LF, and slack for
dependency graphs with all three dependency types (FS, SS, FF). Multi-predecessor resolution
takes latest constraint. Dateless tasks in chains get 1-day duration. Graphs with no dependencies
return empty results. All tests pass. Covers `cpm-critical-path.AC1.*`.

<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->

### Phase 2: CPM store integration

**Goal:** Wire the CPM calculator into the MobX timeline store as reactive computed values.

**Components:**

- `apps/web/hw/store/timeline/` — add `cpmEnabled`, `crossProjectCpmEnabled`, `cpmResults`,
  `isCritical(blockId)`, `getSlack(blockId)`, `getComputedDates(blockId)` computed values
  to the existing timeline store.
- `apps/web/ce/store/timeline/` — CE stub equivalents returning false/0/null/empty map.

**Dependencies:** Phase 1 (CPM calculator functions).

**Done when:** CPM results recompute reactively when blocks or relations change. Per-block
accessors return correct values. Toggle off returns empty results with no computation. Tests
verify reactivity and memoisation behaviour. Covers `cpm-critical-path.AC2.*`.

<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->

### Phase 3: Virtual date injection

**Goal:** Position dateless tasks on the gantt based on their CPM-computed dates.

**Components:**

- `apps/web/hw/store/timeline/base-timeline.store.ts` — extend the block update pipeline to
  inject computed dates into dateless blocks when CPM is enabled. Add `dateSource` flag to
  block objects.
- `apps/web/hw/components/gantt-chart/blocks/` — computed-date block styling (dashed border,
  reduced opacity, "auto" badge icon).
- `apps/web/core/components/gantt-chart/blocks/block.tsx` — minor adjustment to allow
  computed-date blocks through the visibility filter when CPM is enabled.

**Dependencies:** Phase 2 (CPM store provides `getComputedDates`).

**Done when:** Dateless tasks with dependencies appear on the gantt at their CPM-computed
positions when CPM is enabled. They render with distinct styling. Dragging a computed block
converts it to manual dates. Dateless tasks without dependencies remain unchanged. Tests
verify injection, styling, and drag-to-manual conversion. Covers `cpm-critical-path.AC3.*`.

<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->

### Phase 4: Critical path visualization

**Goal:** Highlight critical path tasks and dependency connectors on the gantt.

**Components:**

- `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx` — toggle button for the gantt
  toolbar. Controls `cpmEnabled` store value.
- `apps/web/hw/components/gantt-chart/blocks/` — red/coral background for critical blocks,
  combined red+dashed styling for critical computed blocks.
- `apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx` — extend connector
  rendering to use red colour for connectors between critical path tasks.
- `apps/web/ce/components/gantt-chart/cpm/cpm-toggle.tsx` — CE stub rendering nothing.

**Dependencies:** Phase 2 (CPM store provides `isCritical`), Phase 3 (computed blocks
render on the gantt).

**Done when:** Toggle enables/disables critical path highlighting. Zero-slack tasks render
with red background. Connectors between critical tasks render red. Toggle off restores
normal appearance. Tests verify toggle behaviour and visual state. Covers
`cpm-critical-path.AC4.*`.

<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->

### Phase 5: Slack visualization and tooltip enrichment

**Goal:** Show available float for non-critical tasks and enrich tooltips with CPM data.

**Components:**

- `apps/web/hw/components/gantt-chart/blocks/` — slack extension bar rendering (light-coloured
  bar from EF to LF, ~30% opacity, same height as task bar).
- `apps/web/hw/components/gantt-chart/blocks/` — tooltip enrichment showing ES, EF, LS, LF,
  total float when CPM is active. Critical path note for zero-slack tasks.
- `apps/web/hw/helpers/cpm-calculator.ts` — utility to compute slack bar position/width from
  CPM results and chart data.

**Dependencies:** Phase 4 (critical path toggle and block styling in place).

**Done when:** Non-critical tasks show slack extension bars with correct width. Tooltips
display CPM values when hovering any block with CPM active. Slack bars only render when
CPM is enabled. Tests verify slack bar positioning and tooltip content. Covers
`cpm-critical-path.AC5.*`.

<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->

### Phase 6: Cross-project CPM

**Goal:** Allow CPM calculation to follow dependency chains across project boundaries.

**Components:**

- `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx` — extend with cross-project
  sub-toggle (checkbox or dropdown appearing when CPM is enabled).
- `apps/web/hw/store/timeline/` — cross-project relation fetching and caching logic.
  Fetch relations for external issues on toggle-on, cache in store, invalidate on
  relation changes.
- `apps/web/hw/components/gantt-chart/cpm/phantom-anchor.tsx` — small marker components
  at timeline edges representing external issue constraints, with tooltip showing issue
  identifier, project name, and dates.
- `apps/web/ce/components/gantt-chart/cpm/phantom-anchor.tsx` — CE stub rendering nothing.

**Dependencies:** Phase 4 (CPM toggle exists), Phase 2 (CPM store supports cross-project flag).

**Done when:** Cross-project toggle fetches external relations and includes them in CPM
calculation. Phantom anchors render for external constraints. Per-project mode treats
cross-project predecessors as fixed inputs. Tests verify cross-project graph traversal,
phantom anchor rendering, and cache invalidation. Covers `cpm-critical-path.AC6.*`.

<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->

### Phase 7: E2E tests

**Goal:** End-to-end test coverage for the full CPM feature across all user-facing flows.

**Components:**

- `apps/web/hw/tests/e2e/cpm/` — Playwright E2E tests covering:
  - **Smoke:** toggle CPM on for a project with dependencies, verify critical path
    highlights appear on the gantt.
  - **Critical path identification:** create a dependency chain (A→B→C), toggle CPM,
    verify the correct tasks are highlighted as critical (zero slack).
  - **Virtual dates:** create a dateless task with a dependency, toggle CPM, verify it
    appears on the gantt at a computed position with dashed border styling.
  - **Drag-to-manual:** drag a computed-date block, verify it converts to manual dates
    and retains position after CPM is toggled off.
  - **Slack visualization:** verify slack extension bars appear for non-critical tasks
    and do not appear for critical tasks.
  - **Cross-project:** enable cross-project mode, verify phantom anchors appear at
    timeline edges for external dependencies.

**Dependencies:** Phases 1-6 (all CPM functionality implemented).

**Done when:** All six E2E scenarios pass. Tests exercise the gantt UI directly via
Playwright, creating issues, dependencies, and toggling CPM controls. Covers
`cpm-critical-path.AC7.*`.

<!-- END_PHASE_7 -->

## Additional Considerations

**Interaction with dep-viz-propagation conflict detection:** when CPM is active and a task has
a dependency conflict (dates violate constraints), both the conflict warning (orange border)
and critical path highlighting (red background) may apply to the same block. Critical path
styling takes precedence for the background colour; the conflict warning icon remains visible
alongside it. This ensures users see both signals without visual ambiguity.

**Dateless task duration assumption:** the 1-day minimum duration for dateless tasks in
dependency chains is a pragmatic default. If a user later assigns real dates with a longer
duration, the CPM recalculates automatically. The 1-day assumption prevents zero-duration
tasks from collapsing the critical path calculation.

**Future CPM enhancements:** the pure-function architecture of `cpm-calculator.ts` supports
adding lag/lead times and resource constraints without architectural changes — these would
be additional parameters to the forward/backward pass functions. The current design
intentionally excludes them to keep scope tight.
