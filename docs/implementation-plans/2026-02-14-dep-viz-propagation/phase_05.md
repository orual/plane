# Dependency Visualization and Date Propagation — Phase 5: Server-Side Date Propagation

**Goal:** Automatically cascade date changes through dependency chains on the server when an issue's `start_date` or `target_date` changes.

**Architecture:** A propagation service at `apps/api/plane/hw/services/propagation.py` performs a topological sort of downstream dependents, computes new dates using FS/SS/FF rules, resolves multi-predecessor conflicts by taking the latest date, and updates all affected issues in a single database transaction. The service is called from the issue update view when date fields change. The API response is modified to return `updated_dependents` (changing from HTTP 204 to HTTP 200 with a body). The propagation reuses graph utilities from the cycle detection service (Phase 2).

**Tech Stack:** Python, Django ORM, topological sort algorithm

**Scope:** 7 phases from original design (phase 5 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

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

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Create shared graph utilities for dependency traversal

**Verifies:** dep-viz-propagation.AC5.4, dep-viz-propagation.AC5.9, dep-viz-propagation.AC5.10

**Files:**

- Create: `apps/api/plane/hw/services/dependency_graph.py`
- Modify: `apps/api/plane/hw/services/__init__.py` (add exports)

**Implementation:**

Create shared graph utilities used by both cycle detection (Phase 2) and propagation (this phase). These functions build and traverse the dependency graph from `IssueRelation` data.

Key constants:

```python
DEPENDENCY_RELATION_TYPES = ("blocked_by", "start_before", "finish_before", "implemented_by")
MAX_PROPAGATION_DEPTH = 100
```

Key functions:

1. `build_dependency_graph(issue_ids: list[str] | None = None) -> dict[str, list[tuple[str, str]]]` — Queries `IssueRelation` for dependency types, returns an adjacency list mapping `related_issue_id` (predecessor) to list of `(issue_id, relation_type)` tuples (successors). This follows the "who depends on me" direction. If `issue_ids` is provided, limits the query scope; otherwise queries all non-deleted relations.

2. `get_downstream_dependents(start_issue_id: str, graph: dict) -> list[str]` — Topological sort via BFS/DFS from `start_issue_id`, following the adjacency list to find all transitive dependents. Returns issue IDs in topological order (predecessors before successors). Respects `MAX_PROPAGATION_DEPTH` and logs a warning if exceeded.

The graph is built using a single query:

```python
IssueRelation.objects.filter(
    relation_type__in=DEPENDENCY_RELATION_TYPES,
    deleted_at__isnull=True,
).values_list("issue_id", "related_issue_id", "relation_type")
```

This query returns ALL dependency relations without project filtering (dep-viz-propagation.AC5.9 — cross-project support).

Update `__init__.py` to export: `from .dependency_graph import build_dependency_graph, get_downstream_dependents, DEPENDENCY_RELATION_TYPES, MAX_PROPAGATION_DEPTH`

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.services.dependency_graph import build_dependency_graph; print('Import OK')"`
Expected: Import succeeds.

**Commit:** `feat(api): add shared dependency graph utilities for traversal and topological sort`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create propagation service

**Verifies:** dep-viz-propagation.AC5.1, dep-viz-propagation.AC5.2, dep-viz-propagation.AC5.3, dep-viz-propagation.AC5.4, dep-viz-propagation.AC5.5, dep-viz-propagation.AC5.7, dep-viz-propagation.AC5.8

**Files:**

- Create: `apps/api/plane/hw/services/propagation.py`
- Modify: `apps/api/plane/hw/services/__init__.py` (add export)

**Implementation:**

The propagation service computes cascading date updates.

Function signature:

```python
from datetime import date, timedelta

def propagate_dates(
    changed_issue_id: str,
    old_start_date: date | None,
    old_target_date: date | None,
    new_start_date: date | None,
    new_target_date: date | None,
) -> list[dict]:
```

Returns a list of `{"id": str, "start_date": str | None, "target_date": str | None}` for each affected issue.

Algorithm:

1. Build dependency graph using `build_dependency_graph()`
2. Get downstream dependents using `get_downstream_dependents(changed_issue_id, graph)`
3. If no dependents, return empty list
4. Fetch all dependent issues in a single query: `Issue.objects.filter(id__in=dependent_ids).values("id", "start_date", "target_date")`
5. For each dependent in topological order:
   - Find all predecessors for this dependent from the relation data
   - For each predecessor, compute the constraint date based on relation type:
     - **Finish-to-Start (blocked_by):** successor `start_date` ≥ predecessor `target_date` + 1 day
     - **Start-to-Start (start_before):** successor `start_date` ≥ predecessor `start_date`
     - **Finish-to-Finish (finish_before):** successor `target_date` ≥ predecessor `target_date`
   - Take the maximum (latest) constraint date across all predecessors (dep-viz-propagation.AC5.5)
   - If the dependent has no dates (`start_date is None`), skip it (dep-viz-propagation.AC5.8)
   - If the new computed date is later than the current date, update it
   - When updating `start_date`, preserve the issue's duration by shifting `target_date` by the same delta
6. Perform `Issue.objects.bulk_update(updated_issues, ["start_date", "target_date"])` inside `transaction.atomic()` (dep-viz-propagation.AC5.7)
7. Fire `issue_activity.delay()` for each updated issue
8. Return the list of updates

Export: `from .propagation import propagate_dates`

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.services.propagation import propagate_dates; print('Import OK')"`
Expected: Import succeeds.

**Commit:** `feat(api): add date propagation service with topological sort and multi-predecessor resolution`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Integrate propagation into issue update view

**Verifies:** dep-viz-propagation.AC5.6

**Files:**

- Modify: `apps/api/plane/app/views/issue/base.py:614-701` (add propagation call to `partial_update`)

**Why this modifies a core file:** The backend does not use the same `hw/ce` overlay pattern as the frontend. There is no view-level override mechanism, and propagation should benefit all editions — it only runs when dependency relations exist (which is a no-op when none are created). The import of `propagate_dates` from `plane.hw.services` is guarded by a date-change check, so it is only called when needed.

**API status code change:** This changes `partial_update` from `HTTP_204_NO_CONTENT` to a conditional response:

- **When dates changed and propagation ran:** Returns `HTTP_200_OK` with serialized issue + `updated_dependents` array
- **When no date change or no dependents:** Returns `HTTP_204_NO_CONTENT` (unchanged behaviour)

This avoids a breaking API change — existing callers that expect 204 will still get 204 for non-date updates. Only date changes with propagation trigger the new 200 response. Frontend callers must handle both 200 and 204.

**Implementation:**

In the `partial_update` method of `IssueViewSet`, add propagation after the serializer saves. The current flow is:

```python
serializer = IssueCreateSerializer(issue, data=request.data, partial=True, ...)
if serializer.is_valid():
    serializer.save()
    # ... activity logging ...
    return Response(status=status.HTTP_204_NO_CONTENT)
```

Modify to:

1. Before save, capture old `start_date` and `target_date` from the issue instance
2. After save, check if `start_date` or `target_date` changed
3. If dates changed, call `propagate_dates()` with old and new dates
4. If `updated_dependents` is non-empty, return `HTTP_200_OK` with response body:

```python
if updated_dependents:
    response_data = IssueSerializer(issue).data
    response_data["updated_dependents"] = updated_dependents
    return Response(response_data, status=status.HTTP_200_OK)
return Response(status=status.HTTP_204_NO_CONTENT)
```

5. If no dates changed or no dependents, return `HTTP_204_NO_CONTENT` as before (zero breaking change for non-propagation updates)

Import `propagate_dates` from `plane.hw.services.propagation`.

**Verification:**

Run: `cd apps/api && python -c "from plane.app.views.issue.base import IssueViewSet; print('Import OK')"`
Expected: Import succeeds.

**Commit:** `feat(api): integrate date propagation into issue partial_update with updated_dependents response`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: Unit tests for propagation service

**Verifies:** dep-viz-propagation.AC5.1, dep-viz-propagation.AC5.2, dep-viz-propagation.AC5.3, dep-viz-propagation.AC5.4, dep-viz-propagation.AC5.5, dep-viz-propagation.AC5.7, dep-viz-propagation.AC5.8, dep-viz-propagation.AC5.9, dep-viz-propagation.AC5.10

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_propagation.py`
- Create: `apps/api/plane/tests/unit/hw/test_dependency_graph.py`

**Testing:**

**test_dependency_graph.py** — Unit tests for graph utilities:

- Build graph from multiple IssueRelation objects, verify adjacency list is correct
- `get_downstream_dependents` returns correct topological order for A→B→C chain
- Cross-project relations are included in the graph (dep-viz-propagation.AC5.9)
- Depth limit: create a chain > 100 deep, verify traversal stops and logs warning (dep-viz-propagation.AC5.10)

**test_propagation.py** — Unit tests for `propagate_dates`:

- **dep-viz-propagation.AC5.1 (FS propagation):** Create A→B (blocked_by). A's target_date moves from Jan 10 to Jan 13. Verify B's start_date shifts from Jan 11 to Jan 14.
- **dep-viz-propagation.AC5.2 (SS propagation):** Create A→B (start_before). A's start_date moves from Jan 5 to Jan 8. Verify B's start_date shifts to Jan 8.
- **dep-viz-propagation.AC5.3 (FF propagation):** Create A→B (finish_before). A's target_date moves from Jan 15 to Jan 18. Verify B's target_date shifts to Jan 18.
- **dep-viz-propagation.AC5.4 (multi-hop):** Create A→B→C chain (blocked_by). Move A's target_date +3 days. Verify both B and C shift.
- **dep-viz-propagation.AC5.5 (multi-predecessor):** B depends on both A (FS, target Jan 10) and C (FS, target Jan 12). Verify B's start_date = Jan 13 (max + 1 day).
- **dep-viz-propagation.AC5.7 (atomicity):** Mock a failure during bulk_update and verify no partial updates persist (transaction rollback).
- **dep-viz-propagation.AC5.8 (no-date skip):** Create A→B where B has no dates. Verify B is not updated.
- Return value: Verify returns list with `id`, `start_date`, `target_date` for each affected issue.

Use `IssueFactory` and `IssueRelation.objects.create()` for setup. Mark with `@pytest.mark.unit` and `@pytest.mark.django_db`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u -v`
Expected: All unit tests pass.

**Commit:** `test(api): add unit tests for dependency graph and date propagation`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Contract tests for propagation API

**Verifies:** dep-viz-propagation.AC5.1, dep-viz-propagation.AC5.4, dep-viz-propagation.AC5.5, dep-viz-propagation.AC5.6, dep-viz-propagation.AC5.8

**Files:**

- Create: `apps/api/plane/tests/contract/hw/test_date_propagation.py`

**Testing:**

Contract tests for the issue update endpoint with propagation:

- **dep-viz-propagation.AC5.1 (API round-trip):** Create issue A (target_date=Jan 10) and B (start_date=Jan 11), create A→B blocked_by relation. PATCH A with target_date=Jan 13. Verify response includes `updated_dependents` with B's new start_date=Jan 14.
- **dep-viz-propagation.AC5.6 (response format):** Verify `updated_dependents` is an array of objects with `id`, `start_date`, `target_date` keys.
- **dep-viz-propagation.AC5.4 (multi-hop API):** Create A→B→C chain. PATCH A's date. Verify response `updated_dependents` includes both B and C.
- **dep-viz-propagation.AC5.8 (no-date skip API):** Create A→B where B has no dates. PATCH A. Verify `updated_dependents` does not include B.
- **No propagation:** PATCH A with a non-date field (e.g., `name`). Verify response does not include `updated_dependents`.

Use `session_client`, `IssueFactory` fixtures. Follow patterns in existing contract tests.

**Verification:**

Run: `cd apps/api && python run_tests.py -c -v`
Expected: All contract tests pass.

**Commit:** `test(api): add contract tests for date propagation API endpoint`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->
