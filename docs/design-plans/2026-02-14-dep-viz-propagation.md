# Dependency Visualization and Date Propagation Design

## Summary

This design adds visual dependency management to Plane's gantt/timeline view, bringing hardware project management capabilities in line with industry-standard tools like Microsoft Project. Users will be able to create scheduling dependencies between issues (blocking/Finish-to-Start, start_before/Start-to-Start, finish_before/Finish-to-Finish) by dragging connectors between gantt blocks, see those dependencies rendered as SVG arrows, and have date changes automatically cascade through dependency chains. When a predecessor task's dates shift, all dependent tasks update automatically to maintain schedule coherence.

The implementation uses a hybrid client-server architecture: the server provides authoritative date propagation calculations using topological sort and constraint resolution, while the client renders real-time visual feedback during interactive drag operations. Cycle detection prevents circular dependencies at both API and frontend levels. Conflict visualization alerts users when manual date overrides violate dependency constraints, though overrides remain permitted. The design builds exclusively on existing infrastructure — filling in stub components explicitly designed for this feature — and follows the established HW overlay pattern to avoid modifying core codebase.

## Definition of Done

When issues have dependency relationships (blocking, start_before, finish_before), those dependencies are visually rendered as SVG connector lines on the gantt/timeline view, and changing a predecessor's dates automatically cascades date adjustments to dependent tasks.

Specifically:

1. **Dependency visualization on the gantt/timeline** — SVG connector lines drawn between related task blocks, showing blocking, start_before, and finish_before relationships. Users can create dependencies by dragging from block edges.

2. **All temporal relation types exposed in frontend** — `TIssueRelationTypes` expanded to include `start_before`/`start_after`, `finish_before`/`finish_after` alongside the existing `blocking`/`blocked_by`. Relation type picker updated in the issue detail relation UI.

3. **Automatic date propagation** — when a predecessor task's dates change, dependent tasks' dates cascade forward automatically via server-side calculation on save. Supports Finish-to-Start (blocking), Start-to-Start (start_before), and Finish-to-Finish (finish_before) dependency semantics with zero lag.

4. **Conflict visualization** — if a user manually sets a date that violates a dependency constraint, the task shows a visual warning indicator but the override is allowed.

5. **Cycle detection** — prevent circular dependency creation at both API and frontend levels.

**Out of scope:** CPM/critical path calculation (separate future design doc), lag/lead times on dependencies, resource/workload tracking, Start-to-Finish dependency type (not present in backend model).

## Acceptance Criteria

### dep-viz-propagation.AC1: Temporal relation types exposed in frontend

- **dep-viz-propagation.AC1.1 Success:** User can create a `start_before` relation from the issue detail sidebar relation picker
- **dep-viz-propagation.AC1.2 Success:** User can create a `finish_before` relation from the issue detail sidebar relation picker
- **dep-viz-propagation.AC1.3 Success:** Creating a `start_before` relation shows as `start_after` on the related issue's side (bidirectional mapping)
- **dep-viz-propagation.AC1.4 Success:** Relation picker groups types into "Scheduling" (blocking, start_before, finish_before) and "Other" (relates_to, duplicate) sections
- **dep-viz-propagation.AC1.5 Success:** All 8 relation types round-trip through the API — create via POST, visible in GET response under correct key
- **dep-viz-propagation.AC1.6 Failure:** Removing a temporal relation removes both sides (forward and reverse) — no orphaned relations
- **dep-viz-propagation.AC1.7 Edge:** Existing `blocking`/`blocked_by`/`relates_to`/`duplicate` relations continue to work identically after type expansion

### dep-viz-propagation.AC2: Cycle detection

- **dep-viz-propagation.AC2.1 Success:** API returns HTTP 400 with `cycle_detected` error when creating A→B→A direct cycle
- **dep-viz-propagation.AC2.2 Success:** API returns HTTP 400 with cycle path when creating A→B→C→A transitive cycle
- **dep-viz-propagation.AC2.3 Success:** Frontend pre-check detects cycle from in-memory relation graph and marks target as invalid before API call
- **dep-viz-propagation.AC2.4 Success:** Cycle detection works across project boundaries (A in Project 1, B in Project 2, C in Project 1)
- **dep-viz-propagation.AC2.5 Failure:** API error response includes the cycle path (list of issue IDs forming the cycle) for debugging
- **dep-viz-propagation.AC2.6 Edge:** Non-scheduling relations (`relates_to`, `duplicate`) do not participate in cycle detection — only dependency types (blocking, start_before, finish_before)
- **dep-viz-propagation.AC2.7 Edge:** Self-referencing relation (A→A) is rejected

### dep-viz-propagation.AC3: Dependency connector lines on gantt

- **dep-viz-propagation.AC3.1 Success:** SVG right-angle connector line renders between a blocking issue and its dependent on the gantt timeline
- **dep-viz-propagation.AC3.2 Success:** Connectors for `start_before`/`finish_before` render with dashed line style, `blocking` with solid line
- **dep-viz-propagation.AC3.3 Success:** Arrowhead marker renders at the target end of each connector
- **dep-viz-propagation.AC3.4 Success:** Connectors update position when scrolling the gantt horizontally or vertically
- **dep-viz-propagation.AC3.5 Success:** Connectors render correctly across all three view modes (week, month, quarter)
- **dep-viz-propagation.AC3.6 Edge:** Connectors only render when both source and target blocks are in the visible viewport (performance: no offscreen rendering)
- **dep-viz-propagation.AC3.7 Edge:** When either the source or target issue has no dates (no gantt block), no connector renders (no errors)

### dep-viz-propagation.AC4: Drag-to-create dependencies

- **dep-viz-propagation.AC4.1 Success:** Hovering a gantt block reveals circular handles at left and right edges
- **dep-viz-propagation.AC4.2 Success:** Dragging from right handle to another block's left edge creates a Finish-to-Start (blocking) relation
- **dep-viz-propagation.AC4.3 Success:** Dragging from left handle to another block's left edge creates a Start-to-Start (start_before) relation
- **dep-viz-propagation.AC4.4 Success:** Dragging from right handle to another block's right edge creates a Finish-to-Finish (finish_before) relation
- **dep-viz-propagation.AC4.5 Success:** Rubber-band SVG line follows cursor during drag, snapping to target block on hover
- **dep-viz-propagation.AC4.6 Success:** Valid drop targets highlight green, invalid targets (same issue, would-create-cycle) highlight red
- **dep-viz-propagation.AC4.7 Failure:** Dropping on empty space (no target block) cancels the drag — no relation created, no error
- **dep-viz-propagation.AC4.8 Edge:** Created dependency renders as a connector line immediately after drop (no page reload needed)

### dep-viz-propagation.AC5: Server-side date propagation

- **dep-viz-propagation.AC5.1 Success:** Moving predecessor's `target_date` forward by 3 days shifts FS-dependent successor's `start_date` forward by 3 days
- **dep-viz-propagation.AC5.2 Success:** Moving predecessor's `start_date` forward shifts SS-dependent successor's `start_date` to match
- **dep-viz-propagation.AC5.3 Success:** Moving predecessor's `target_date` forward shifts FF-dependent successor's `target_date` to match
- **dep-viz-propagation.AC5.4 Success:** Multi-hop propagation cascades: A→B→C chain, moving A shifts both B and C
- **dep-viz-propagation.AC5.5 Success:** Multi-predecessor resolution: if B depends on both A (FS) and C (FS), B's start_date = max(A.target_date, C.target_date) + 1
- **dep-viz-propagation.AC5.6 Success:** API response includes `updated_dependents` array with id, start_date, target_date for each affected issue
- **dep-viz-propagation.AC5.7 Success:** All propagated updates occur in a single database transaction (atomic)
- **dep-viz-propagation.AC5.8 Edge:** Issues without dates (`start_date = null`) are skipped — propagation does not assign dates to date-less issues
- **dep-viz-propagation.AC5.9 Edge:** Cross-project dependencies propagate correctly (predecessor in Project A, successor in Project B)
- **dep-viz-propagation.AC5.10 Edge:** Propagation depth capped at 100 levels — chains exceeding this stop and log a warning

### dep-viz-propagation.AC6: Client-side preview and reconciliation

- **dep-viz-propagation.AC6.1 Success:** During gantt block drag, downstream dependent blocks show preview positions (shifted) in real-time
- **dep-viz-propagation.AC6.2 Success:** Preview blocks render with reduced opacity to distinguish from committed state
- **dep-viz-propagation.AC6.3 Success:** Dependency connector lines update in real-time as the source block is dragged
- **dep-viz-propagation.AC6.4 Success:** On drop, server-authoritative dates replace preview positions — zero visual jank when server matches preview
- **dep-viz-propagation.AC6.5 Edge:** When server result differs from preview (concurrent edit changed the graph), blocks snap to server-authoritative positions
- **dep-viz-propagation.AC6.6 Edge:** If the dragged issue has no downstream dependents, drag works identically to current behaviour (no preview, no regression)

### dep-viz-propagation.AC7: Conflict visualization

- **dep-viz-propagation.AC7.1 Success:** Issue with `start_date` before FS predecessor's `target_date` shows warning icon on gantt block
- **dep-viz-propagation.AC7.2 Success:** Gantt block border shifts to orange when dependency constraint is violated
- **dep-viz-propagation.AC7.3 Success:** Tooltip on warning icon explains the violation (e.g., "Start date is before predecessor [ISSUE-ID] finishes")
- **dep-viz-propagation.AC7.4 Success:** Issue detail sidebar shows warning badge on the conflicting relation entry
- **dep-viz-propagation.AC7.5 Success:** Manual date override is allowed — warning is informational, not blocking
- **dep-viz-propagation.AC7.6 Edge:** Conflict flags update reactively when dates or relations change (no page reload needed)
- **dep-viz-propagation.AC7.7 Edge:** An issue with no dates shows no conflict warnings regardless of dependency relationships

## Glossary

- **Finish-to-Start (FS)**: A dependency type where the successor task cannot start until the predecessor task finishes. The most common scheduling relationship, also known as "blocking."
- **Start-to-Start (SS)**: A dependency type where the successor task's start date must align with or follow the predecessor's start date.
- **Finish-to-Finish (FF)**: A dependency type where the successor task's finish date must align with or follow the predecessor's finish date.
- **Topological sort**: A graph algorithm that orders nodes such that for every directed edge from node A to node B, A comes before B in the ordering. Used here to determine the sequence for propagating date changes through dependency chains.
- **DFS (Depth-First Search)**: A graph traversal algorithm that explores as far as possible along each branch before backtracking. Used for cycle detection and dependency graph traversal.
- **CPM (Critical Path Method)**: A project scheduling technique (mentioned as out-of-scope) that identifies the longest path of dependent tasks to determine minimum project duration.
- **MobX**: A reactive state management library used in Plane's frontend. Computed values automatically update when their dependencies change.
- **Gantt chart**: A horizontal bar chart used in project management showing tasks plotted against time. Each task is a bar positioned according to its start and end dates.
- **Predecessor/successor**: In dependency relationships, the predecessor is the task that must complete (or start/finish, depending on dependency type) before the successor task can proceed.
- **Lag/lead time**: Time delays or overlaps in dependency relationships (e.g., "successor starts 2 days after predecessor finishes"). Explicitly out of scope for this design.
- **SVG (Scalable Vector Graphics)**: An XML-based vector image format used to render the dependency connector lines as resolution-independent graphics.
- **Viewport**: The visible portion of a scrollable area. Connector lines only render for dependencies where both blocks are visible, for performance.
- **Atomic transaction**: A database operation where all changes either succeed together or fail together. Propagation updates occur in a single transaction.
- **Optimistic update**: A UI pattern where the interface updates immediately based on an expected result, then reconciles with the server's authoritative response.
- **Cycle/circular dependency**: A situation where a chain of dependencies loops back to the starting point (A→B→C→A), which is logically invalid and must be prevented.
- **Bidirectional relation**: Relations in Plane are stored as forward/reverse pairs (e.g., "blocking" ↔ "blocked_by"). Creating one side automatically creates the corresponding reverse.
- **HW overlay pattern**: The architecture pattern in this codebase where hardware-specific features live in `hw/` directories and override community edition (`ce/`) components via TypeScript path aliases.

## Architecture

The system uses a **hybrid client-server** pattern: the server is the authoritative source for
date propagation calculations, while the client provides real-time visual previews during
interactive gantt drag operations.

### Three layers

**1. Frontend dependency visualization (SVG overlay)**

An SVG layer rendered by `TimelineDependencyPaths` (currently an empty stub at
`apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx`) draws connector lines
between related blocks on the gantt timeline. Each dependency is a right-angle SVG `<path>`
from the source block's edge to the target block's edge, with an arrowhead marker at the
target end. Connectors are styled by relation type: solid for blocking, dashed for temporal
(start_before, finish_before).

Dependency creation uses `LeftDependencyDraggable` and `RightDependencyDraggable` (both
currently empty stubs on each `ChartDraggable` block). On hover, small circular handles
appear at block edges. Dragging from a handle shows a rubber-band SVG line to the cursor.
Dropping on a valid target block creates the relation via the existing relation API. The
drag endpoint determines the dependency type: right→left = Finish-to-Start, left→left =
Start-to-Start, right→right = Finish-to-Finish.

Performance: paths render only for dependencies where both source and target blocks are in
the visible viewport. `React.memo` per connector component, `useMemo` for path calculation.
SVG `<g>` transform handles scroll offset without recalculating paths.

**2. Server-side date propagation engine**

A new Django service at `apps/api/plane/hw/services/propagation.py` handles authoritative
date cascading. When an issue's `start_date` or `target_date` changes (via the issue update
API), the service:

1. Fetches all downstream dependents via topological sort (DFS from the changed issue,
   following blocking/start_before/finish_before relations forward).
2. For each dependent issue, computes new dates:
   - **Finish-to-Start (blocking):** successor `start_date` = predecessor `target_date` + 1 day
   - **Start-to-Start (start_before):** successor `start_date` = predecessor `start_date`
   - **Finish-to-Finish (finish_before):** successor `target_date` = predecessor `target_date`
3. When multiple predecessors affect the same successor, takes the latest (max) computed
   date — the successor cannot start/finish until all constraints are satisfied.
4. Updates all affected issues in a single database transaction (bulk update).
5. Returns the list of updated issue IDs and their new dates in the API response
   (`updated_dependents` field).

Issues without dates are skipped — propagation only shifts dates that already exist.
Cross-project dependencies are followed (the relation model's `related_issue` FK is to
Issue, not scoped to a single project).

**3. Client-side preview during drag**

During gantt block drag, the frontend computes a preview of cascading date changes using
the same FS/SS/FF rules against in-memory block positions in the MobX store. This extends
`getUpdatedPositionAfterDrag` in `base-timeline.store.ts` to walk the dependency graph and
return position updates for all downstream dependents.

Preview blocks render with reduced opacity and a subtle shift animation. Dependency
connector lines update in real-time as the source block moves. On drop, the frontend sends
only the primary change to the server. The server returns authoritative propagated dates,
and the frontend reconciles — replacing preview positions with server results. If the
server result matches the preview, there is zero visual jank.

### Relation type expansion

`TIssueRelationTypes` in `apps/web/hw/types/gantt-chart.ts` expands from 4 types to 8:

```
blocking | blocked_by | start_before | start_after | finish_before | finish_after | duplicate | relates_to
```

`REVERSE_RELATIONS` in `core/constants/gantt-chart.ts` adds the new pairs:
`start_before ↔ start_after`, `finish_before ↔ finish_after`.

`ISSUE_RELATION_OPTIONS` in the HW overlay adds entries for the four temporal types with
appropriate icons and colour coding. The relation picker in the issue detail sidebar groups
types: "Scheduling" (blocking, start_before, finish_before) and "Other" (relates_to,
duplicate).

The backend already supports all these relation types — no backend model or API changes are
needed for type expansion. The relation store (`core/store/issue/issue-details/relation.store.ts`)
already handles bidirectional updates generically via the `REVERSE_RELATIONS` mapping. Once
the new entries are added, the store works without code changes.

### Cycle detection

**Backend (authoritative):** added to the relation create endpoint in
`apps/api/plane/app/views/issue/relation.py`. Before creating a dependency relation, a DFS
runs from the proposed target issue through all downstream dependents. If the source issue
is reachable, the API returns HTTP 400 with
`{"error": "cycle_detected", "detail": "...chain description..."}`.

**Frontend (fast feedback):** before making the API call, the frontend checks the in-memory
relation graph. If a cycle is detected locally, the drag-to-create interaction shows the
target as invalid (red indicator, disabled drop). The server check is the authoritative
backstop for concurrent edits.

### Conflict visualization

When an issue's dates violate a dependency constraint, two indicators appear:

- **Gantt block:** warning icon on the block, border colour shifts to orange. Tooltip
  explains the violation (e.g., "Start date is before predecessor [ISSUE-ID] finishes").
- **Issue detail sidebar:** conflicting dependencies get a warning badge in the relations
  section.

Conflicts are computed reactively in the MobX store (not persisted). For each issue with
dependencies, the store checks whether current dates satisfy the constraint rules. Violated
constraints set a derived `has_dependency_conflict` flag.

### Propagation trigger and API response

The propagation service is called from `IssueViewSet.partial_update` when `start_date` or
`target_date` is in the changed fields. The API response includes an `updated_dependents`
array:

```typescript
interface PropagationResult {
  id: string;
  start_date: string | null;
  target_date: string | null;
}

// API response shape (added to issue update response)
{
  ...issueFields,
  updated_dependents: PropagationResult[]
}
```

The frontend issue store processes `updated_dependents` to update all affected blocks in a
single MobX action, ensuring the gantt re-renders atomically.

## Existing Patterns

This design follows and extends several patterns already present in the Plane codebase:

- **Issue relation model** — `IssueRelation` at `apps/api/plane/db/models/issue.py:287-312`
  already supports all needed relation types including temporal ones (`start_before`,
  `finish_before`). The `IssueRelationChoices._RELATION_PAIRS` mapping and
  `apps/api/plane/utils/issue_relation_mapper.py` utilities handle bidirectional storage.
  No schema changes needed.

- **Relation API** — full CRUD at `apps/api/plane/app/views/issue/relation.py` with list,
  create, and remove endpoints. The list response already groups by all relation types
  including temporal ones. The propagation service adds a new call path but does not change
  existing endpoints.

- **Frontend relation store** — `core/store/issue/issue-details/relation.store.ts` handles
  bidirectional updates via `REVERSE_RELATIONS` mapping, with optimistic updates and
  rollback. Adding new relation type entries to the mapping is the only change needed.

- **Gantt block positioning** — `base-timeline.store.ts` has complete block position
  calculation (`getItemPositionWidth`, `getPositionFromDateOnGantt`,
  `getDateFromPositionOnGantt`). Dependency visualization reads these existing position
  values. No changes to the positioning system.

- **Gantt stub components** — the codebase was explicitly designed for dependency
  visualization to be added. `TimelineDependencyPaths`, `TimelineDraggablePath`,
  `LeftDependencyDraggable`, `RightDependencyDraggable`, and `GanttAdditionalLayers` are
  all empty stubs with correct prop types, rendered in the correct layer order in
  `main-content.tsx`. This design fills in the stubs.

- **HW overlay pattern** — the fork's `hw/` directory overrides `ce/` components via
  TypeScript path aliases. All new components and type changes go in `hw/`, leaving core
  untouched. This matches the pattern established in Phases 1-2.

No new patterns are introduced. The propagation service is the only genuinely new backend
component; everything else extends existing infrastructure.

## Implementation Phases

<!-- START_PHASE_1 -->

### Phase 1: Relation type expansion

**Goal:** Expose all temporal relation types in the frontend and update the relation UI.

**Components:**

- `apps/web/hw/types/gantt-chart.ts` — expand `TIssueRelationTypes` to include
  `start_before`, `start_after`, `finish_before`, `finish_after`
- `apps/web/core/constants/gantt-chart.ts` — add `start_before ↔ start_after` and
  `finish_before ↔ finish_after` to `REVERSE_RELATIONS`
- `apps/web/hw/constants/` — updated `ISSUE_RELATION_OPTIONS` with entries for temporal
  types, grouped into "Scheduling" and "Other" sections
- `packages/types/src/issues/issue_relation.ts` — update shared `TIssueRelationTypes`
  and `TIssueRelation` types

**Dependencies:** None (first phase)

**Done when:** Users can create, view, and remove all temporal relation types
(start_before, start_after, finish_before, finish_after) from the issue detail sidebar
alongside existing blocking/relates_to/duplicate relations. All relation types round-trip
correctly through the API. Tests verify type expansion and UI rendering. Covers
`dep-viz-propagation.AC1.*`.

<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->

### Phase 2: Cycle detection

**Goal:** Prevent circular dependency creation at both API and frontend levels.

**Components:**

- `apps/api/plane/hw/services/cycle_detection.py` — DFS-based cycle detection utility
  that takes a proposed source/target issue pair and returns whether creating the relation
  would form a cycle
- `apps/api/plane/app/views/issue/relation.py` — integrate cycle detection into the
  relation create endpoint, returning HTTP 400 with cycle path on detection
- `apps/web/hw/helpers/dependency-validation.ts` — frontend cycle detection using
  in-memory relation graph from the MobX store

**Dependencies:** Phase 1 (temporal relation types must be in the frontend type system)

**Done when:** Creating a relation that would form a circular dependency chain is rejected
by the API with a descriptive error. Frontend pre-checks the local relation graph and
prevents invalid drag-to-create drops. Tests verify cycle detection for direct cycles,
transitive chains, and cross-project dependencies. Covers `dep-viz-propagation.AC2.*`.

<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->

### Phase 3: Dependency visualization on gantt

**Goal:** Render SVG connector lines between dependent blocks on the gantt timeline.

**Components:**

- `apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx` — implement
  `TimelineDependencyPaths` with SVG overlay rendering right-angle connector paths,
  arrowhead markers, and per-type styling (solid/dashed, colour coding)
- `apps/web/hw/components/gantt-chart/dependency/connector.tsx` — memoised individual
  connector component with path calculation
- `apps/web/hw/helpers/dependency-path-calculator.ts` — pure functions for right-angle
  path calculation between source and target block positions
- `apps/web/hw/store/timeline/` — extend timeline store with dependency-aware computed
  values (visible dependencies, conflict flags)

**Dependencies:** Phase 1 (relation types available in frontend)

**Done when:** Dependency connector lines render on the gantt for all scheduling relation
types. Lines are styled by type, include arrowheads, and only render for visible blocks.
Lines update when blocks are scrolled or when view mode changes (week/month/quarter).
Tests verify path calculation, visibility filtering, and rendering across view modes.
Covers `dep-viz-propagation.AC3.*`.

<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->

### Phase 4: Drag-to-create dependencies

**Goal:** Allow users to create dependencies by dragging between blocks on the gantt.

**Components:**

- `apps/web/hw/components/gantt-chart/dependency/blockDraggables/left-draggable.tsx` —
  implement `LeftDependencyDraggable` with circular handle on hover, drag initiation,
  and target validation
- `apps/web/hw/components/gantt-chart/dependency/blockDraggables/right-draggable.tsx` —
  implement `RightDependencyDraggable` similarly
- `apps/web/hw/components/gantt-chart/dependency/draggable-dependency-path.tsx` —
  implement `TimelineDraggablePath` rendering the rubber-band SVG line during drag
- `apps/web/hw/store/timeline/` — drag state management (source block, endpoint,
  cursor position, hovered target, validity)

**Dependencies:** Phase 2 (cycle detection for target validation), Phase 3 (connector
rendering for the created dependency)

**Done when:** Users can drag from a block's edge handle to another block to create a
dependency. Drag endpoint determines dependency type (right→left = FS, left→left = SS,
right→right = FF). Valid targets highlight green, invalid targets (same issue, cycle)
show red. Created dependencies immediately render as connector lines. Tests verify drag
interaction, type inference, and cycle rejection during drag. Covers
`dep-viz-propagation.AC4.*`.

<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->

### Phase 5: Server-side date propagation

**Goal:** Automatically cascade date changes through dependency chains on the server.

**Components:**

- `apps/api/plane/hw/services/propagation.py` — propagation service: topological sort
  of downstream dependents, FS/SS/FF date calculation, multi-predecessor max-date
  resolution, bulk update in single transaction
- `apps/api/plane/app/views/issue/` — integrate propagation call into issue update view
  when date fields change, include `updated_dependents` in response
- `apps/api/plane/hw/services/` — shared graph utilities (topological sort, dependency
  graph construction) used by both propagation and cycle detection

**Dependencies:** Phase 2 (cycle detection utilities, shared graph code)

**Done when:** Changing a predecessor's dates via the API causes all downstream dependent
issues' dates to update in a single transaction. The API response includes the list of
propagated changes. Propagation handles FS, SS, and FF semantics correctly, resolves
multi-predecessor conflicts by taking the latest date, skips issues without dates, and
follows cross-project dependencies. Tests verify all propagation rules, multi-predecessor
scenarios, and transaction atomicity. Covers `dep-viz-propagation.AC5.*`.

<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->

### Phase 6: Client-side preview and reconciliation

**Goal:** Show real-time preview of cascading date changes during gantt drag, and
reconcile with server results on drop.

**Components:**

- `apps/web/hw/store/timeline/base-timeline.store.ts` — extend
  `getUpdatedPositionAfterDrag` to walk the dependency graph and return preview
  positions for all downstream dependents
- `apps/web/hw/components/gantt-chart/blocks/` — preview rendering for dependent
  blocks (reduced opacity, shift animation)
- `apps/web/hw/store/issue/` — reconciliation logic: process `updated_dependents`
  from API response, replace preview positions with authoritative server values

**Dependencies:** Phase 3 (dependency visualization updates during drag), Phase 5
(server propagation returns `updated_dependents`)

**Done when:** Dragging a predecessor block shows a real-time preview of how dependent
blocks would shift. On drop, preview is replaced by server-authoritative dates. If
server result differs from preview (concurrent edit), blocks snap to correct positions.
Tests verify preview calculation, visual treatment, and reconciliation. Covers
`dep-viz-propagation.AC6.*`.

<!-- END_PHASE_6 -->

<!-- START_PHASE_7 -->

### Phase 7: Conflict visualization

**Goal:** Show visual warnings when issue dates violate dependency constraints.

**Components:**

- `apps/web/hw/store/timeline/` — computed conflict detection: for each issue with
  dependencies, check whether dates satisfy FS/SS/FF constraints, derive
  `has_dependency_conflict` flag
- `apps/web/hw/components/gantt-chart/blocks/` — warning icon overlay on conflicting
  blocks, orange border treatment, tooltip with violation explanation
- `apps/web/hw/components/issues/relations/` — warning badge on conflicting
  dependencies in the issue detail sidebar relations section

**Dependencies:** Phase 1 (relation types), Phase 3 (gantt block rendering)

**Done when:** Issues whose dates violate dependency constraints show a warning icon on
the gantt block and a warning badge in the issue detail relations section. Tooltip
explains which constraint is violated and which predecessor is involved. Warnings update
reactively when dates or relations change. Tests verify conflict detection for all
three dependency types and visual indicator rendering. Covers
`dep-viz-propagation.AC7.*`.

<!-- END_PHASE_7 -->

## Additional Considerations

**Cross-project propagation:** the propagation service follows dependency relations
regardless of project boundaries. This is intentional for hardware organisations where
PCB, firmware, and mechanical projects have inter-dependencies. The cycle detection
service also operates cross-project.

**Propagation depth limit:** as a safety measure, the propagation service caps chain
depth at 100 levels. Hitting this limit logs a warning and stops propagation. This
prevents runaway cascades from misconfigured dependency chains without silently
corrupting data.

**Future CPM integration:** the propagation service's topological sort and dependency
graph construction are designed to be reusable. A future CPM implementation can import
the same graph utilities and add forward/backward pass calculations on top. The
`updated_dependents` response pattern also extends naturally to include slack/float
values.
