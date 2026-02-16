# HW web overlay (hardware/enterprise features)

Last verified: 2026-02-16

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
- **Exposes** (via HW/CE overlay components, imported by `core/` through
  `@/plane-web/` alias):
  - `TimelineDependencyPaths` -- SVG overlay rendering dependency connectors
  - `ConflictIndicator` -- visual indicator on gantt blocks with constraint
    violations
  - `ConflictBadge` -- badge component for relation UI showing conflict count
  - `DependencyLeftDraggable`, `DependencyRightDraggable` -- drag handles on
    block edges for creating dependencies
- **Guarantees**:
  - Every method on `IBaseTimelineStore` has a CE stub in
    `apps/web/ce/store/timeline/base-timeline.store.ts` (stubs are no-ops or
    return empty/false).
  - Conflict detection returns `ConflictInfo[]` (never throws).
  - Dependency validation detects cycles client-side before server round-trip.
  - Preview positions update in-place on `blocksMap` during drag, then
    `clearPreviewPositions` restores via next `updateBlocks` call.
- **Expects**: `rootStore.issue.issueDetail.relation.relationMap` populated.
  `blocksMap` populated with current gantt blocks.

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

## Key files

- `store/timeline/base-timeline.store.ts` -- full HW implementation of timeline
  store with dependency drag, preview, and conflict detection
- `helpers/dependency-validation.ts` -- client-side cycle detection and relation
  type inference from drag endpoints
- `helpers/dependency-conflict.ts` -- conflict detection comparing issue dates
  against predecessor constraints
- `helpers/dependency-path-calculator.ts` -- SVG path geometry for connector
  lines between gantt blocks
- `components/gantt-chart/dependency/` -- SVG overlay components for dependency
  visualization (connectors, draggable paths, visibility filtering)
- `components/relations/` -- relation UI components (conflict badge, activity)

## Agent UI components

### Contracts

- **Exposes** (via HW/CE overlay, imported by `core/` through
  `@/plane-web/` alias):
  - `AgentRunPanel` -- displays agent run activities for an issue,
    with expandable run cards and auto-refresh.
  - `RunStatusBadge` -- colored status badge for agent run states.
  - `ElicitationCard` -- renders elicitation prompts with response
    input (HW-only, no CE stub needed).
- **Exposes** (via `IAgentRunStore` on root MobX store):
  - `fetchRunsForIssue(workspaceSlug, issueId)` -- fetches and caches
    runs filtered by issue.
  - `fetchActivitiesForRun(workspaceSlug, runId)` -- fetches activity
    stream for a run.
  - `postElicitationResponse(workspaceSlug, runId, content)` -- posts
    a response activity.
  - `getRunsByIssueId(issueId)`, `getActivitiesByRunId(runId)`,
    `hasActiveRuns(issueId)` -- computed helpers.
- **Guarantees**:
  - CE stubs for `AgentRunPanel` and `RunStatusBadge` exist in
    `apps/web/ce/components/issues/agent/` and render `null`.
  - `AgentRunStore` is registered on `rootStore.agentRun` in HW
    `root.store.ts`. CE `root.store.ts` sets `agentRun: undefined`.
  - Loader state uses a reference-counted `loaderCount` (not boolean)
    to support concurrent fetches.
- **Expects**: `rootStore` passed to constructor. Workspace slug
  available from router context.

### Types

- `TAgentRun`, `TAgentRunActivity`, `TCreateActivityPayload`,
  `TAgentRunStatus`, `TAgentActivityType` -- defined in
  `types/agent.ts`.

### Key files

- `services/agent.service.ts` -- API service layer for agent endpoints
- `store/agent/agent-run.store.ts` -- MobX store implementation
- `store/agent/index.ts` -- store barrel export
- `types/agent.ts` -- TypeScript type definitions
- `components/issues/agent/` -- React UI components (panel, badge,
  elicitation card, activity renderers)
