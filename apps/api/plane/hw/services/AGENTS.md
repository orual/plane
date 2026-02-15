# HW dependency services

Last verified: 2026-02-15

## Purpose

Provides backend services for dependency-aware scheduling: cycle detection,
dependency graph traversal, and cascading date propagation through issue
dependency chains.

## Contracts

- **Exposes**: `detect_dependency_cycle`, `build_dependency_graph`,
  `get_downstream_dependents`, `propagate_dates`, `DEPENDENCY_RELATION_TYPES`,
  `MAX_PROPAGATION_DEPTH`
- **Guarantees**:
  - `detect_dependency_cycle` returns `None` (no cycle) or a list of issue ID
    strings forming the cycle path (e.g., `[A, B, C, A]`).
  - `propagate_dates` returns a list of dicts `{id, start_date, target_date}`
    for every issue updated by cascading. Bulk-updates in a single transaction.
  - Graph traversal is bounded by `MAX_PROPAGATION_DEPTH` (100).
  - Only dependency relation types participate: `blocked_by`, `start_before`,
    `finish_before`, `implemented_by`.
- **Expects**: Valid issue IDs. Active `IssueRelation` records in the database.

## Dependencies

- **Uses**: `plane.db.models.Issue`, `plane.db.models.IssueRelation`,
  `plane.bgtasks.issue_activities_task.issue_activity`
- **Used by**: `plane.app.views.issue.base.IssueViewSet.partial_update` (date
  propagation on issue update), `plane.app.views.issue.relation.IssueRelationViewSet.create`
  (cycle detection on relation creation)
- **Boundary**: These services are synchronous. Do not import Celery task
  runners directly; activity logging uses `issue_activity.delay()`.

## Key decisions

- Synchronous propagation (not Celery task): keeps the API response atomic so
  the frontend can reconcile preview positions with actual server state.
- Finish-to-Start constraint uses `+1 day` gap (successor starts the day after
  predecessor finishes).
- Multiple predecessors resolved by taking the latest (maximum) constraint date.

## Invariants

- Cycle detection runs before any relation is persisted.
- Date propagation preserves block duration (shifts target_date by the same
  delta as start_date) for FS and SS constraints.
- The changed issue itself is never included in the propagation return list.

## Propagation rules

| Relation type    | Constraint                                                  |
| ---------------- | ----------------------------------------------------------- |
| `blocked_by`     | successor `start_date` >= predecessor `target_date` + 1 day |
| `start_before`   | successor `start_date` >= predecessor `start_date`          |
| `finish_before`  | successor `target_date` >= predecessor `target_date`        |
| `implemented_by` | same as `blocked_by` (FS logic)                             |
