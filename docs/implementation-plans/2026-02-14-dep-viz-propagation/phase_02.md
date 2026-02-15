# Dependency Visualization and Date Propagation — Phase 2: Cycle Detection

**Goal:** Prevent circular dependency creation at both API and frontend levels, ensuring the dependency graph remains a DAG.

**Architecture:** A DFS-based cycle detection service on the backend checks the dependency graph before allowing relation creation. The frontend mirrors this check using in-memory relation data from the MobX store for fast feedback. Only scheduling/dependency relation types participate in cycle detection (`blocked_by`, `start_before`, `finish_before`, `implemented_by`); symmetric types (`relates_to`, `duplicate`) are excluded. The backend check is authoritative; the frontend check is a fast-feedback optimization.

**Tech Stack:** Python (Django ORM, DFS algorithm), TypeScript (graph traversal)

**Scope:** 7 phases from original design (phase 2 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### dep-viz-propagation.AC2: Cycle detection

- **dep-viz-propagation.AC2.1 Success:** API returns HTTP 400 with `cycle_detected` error when creating A→B→A direct cycle
- **dep-viz-propagation.AC2.2 Success:** API returns HTTP 400 with cycle path when creating A→B→C→A transitive cycle
- **dep-viz-propagation.AC2.3 Success:** Frontend pre-check detects cycle from in-memory relation graph and marks target as invalid before API call
- **dep-viz-propagation.AC2.4 Success:** Cycle detection works across project boundaries (A in Project 1, B in Project 2, C in Project 1)
- **dep-viz-propagation.AC2.5 Failure:** API error response includes the cycle path (list of issue IDs forming the cycle) for debugging
- **dep-viz-propagation.AC2.6 Edge:** Non-scheduling relations (`relates_to`, `duplicate`) do not participate in cycle detection — only dependency types (blocking, start_before, finish_before)
- **dep-viz-propagation.AC2.7 Edge:** Self-referencing relation (A→A) is rejected

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Create hw services directory and cycle detection service

**Verifies:** dep-viz-propagation.AC2.1, dep-viz-propagation.AC2.2, dep-viz-propagation.AC2.4, dep-viz-propagation.AC2.5, dep-viz-propagation.AC2.6, dep-viz-propagation.AC2.7

**Files:**

- Create: `apps/api/plane/hw/services/__init__.py`
- Create: `apps/api/plane/hw/services/cycle_detection.py`

**Implementation:**

Create the `services` directory under `apps/api/plane/hw/`.

`apps/api/plane/hw/services/__init__.py`:

```python
from .cycle_detection import detect_dependency_cycle
```

`apps/api/plane/hw/services/cycle_detection.py`:

The service implements a DFS traversal of the dependency graph. Given a proposed source and target issue, it checks whether creating the relation would form a cycle.

Key design decisions:

- Only scheduling/dependency relation types participate: `blocked_by`, `start_before`, `finish_before`, `implemented_by`. These are the **stored** types (not their reverse-name counterparts like `blocking`, `start_after`, etc.). Note: `implemented_by` is intentionally included even though the design's AC2.6 only mentions "blocking, start_before, finish_before" — it is a directional dependency type that can form cycles and must be checked.
- The `IssueRelation` model stores the forward direction. For `blocked_by`, `issue` is blocked by `related_issue`. So following `blocked_by` means traversing `related_issue → issue` (the dependent chain).
- Cross-project relations are followed — the query doesn't filter by project.
- Self-referencing (source == target) is rejected as a degenerate cycle.
- Returns the cycle path as a list of issue ID strings for the error response.

The function signature:

```python
def detect_dependency_cycle(
    source_issue_id: str,
    target_issue_id: str,
    relation_type: str,
) -> list[str] | None:
```

Returns `None` if no cycle, or a list of issue IDs forming the cycle path if one would be created.

The DFS starts from `target_issue_id` and follows all downstream dependents (issues that depend on the target). If it reaches `source_issue_id`, creating the relation would form a cycle.

The dependency relation types to follow in the graph are: `blocked_by`, `start_before`, `finish_before`, `implemented_by`. These are the types stored in `IssueRelation.relation_type`.

The traversal direction — for `blocked_by`, `IssueRelation(issue=A, related_issue=B, relation_type='blocked_by')` means "A is blocked by B" (B is the predecessor, A is the dependent). To find all issues that depend on a given issue B, query:

```python
IssueRelation.objects.filter(related_issue_id=B, relation_type__in=DEPENDENCY_TYPES)
```

This returns relations where B is the predecessor (`related_issue`), giving us the `issue` side (the dependents). The DFS walks this direction: from target to its dependents, checking if the source is reachable.

The depth limit is 100 levels (matching the propagation service design).

**Verification:**

Run: `cd apps/api && python -c "from plane.hw.services.cycle_detection import detect_dependency_cycle; print('Import OK')"`
Expected: Import succeeds without errors.

**Commit:** `feat(api): add DFS-based cycle detection service for dependency relations`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Integrate cycle detection into the relation create endpoint

**Verifies:** dep-viz-propagation.AC2.1, dep-viz-propagation.AC2.2, dep-viz-propagation.AC2.5, dep-viz-propagation.AC2.7

**Files:**

- Modify: `apps/api/plane/app/views/issue/relation.py:209-260` (add cycle detection before `bulk_create`)

**Implementation:**

In the `create` method of `IssueRelationViewSet`, add cycle detection validation after the `relation_type` check (line 215) and before `bulk_create` (line 218). The validation must:

1. Skip cycle detection for non-dependency types (`relates_to`, `duplicate`). These are symmetric relations that don't create directional dependency graphs.

2. Check for self-referencing: if `issue_id` is in the `issues` list, return HTTP 400.

3. For each issue in the `issues` list, call `detect_dependency_cycle` with the appropriate source/target based on the relation direction:
   - For incoming relation types (`blocking`, `start_after`, `finish_after`, `implements`), the stored relation is reversed, so `source_issue_id` is the current issue and `target_issue_id` is the related issue.
   - For stored relation types (`blocked_by`, `start_before`, `finish_before`, `implemented_by`), `source_issue_id` is the related issue and `target_issue_id` is the current issue.

4. If a cycle is detected, return HTTP 400 with the error format:

```python
{
    "error": "cycle_detected",
    "detail": "Creating this relation would form a dependency cycle",
    "cycle_path": ["issue-id-1", "issue-id-2", "issue-id-3", "issue-id-1"]
}
```

Import `detect_dependency_cycle` from `plane.hw.services.cycle_detection`.

**Verification:**

Run: `cd apps/api && python -c "from plane.app.views.issue.relation import IssueRelationViewSet; print('Import OK')"`
Expected: Import succeeds.

**Commit:** `feat(api): integrate cycle detection into relation create endpoint`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Backend tests for cycle detection

**Verifies:** dep-viz-propagation.AC2.1, dep-viz-propagation.AC2.2, dep-viz-propagation.AC2.4, dep-viz-propagation.AC2.5, dep-viz-propagation.AC2.6, dep-viz-propagation.AC2.7

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_cycle_detection.py`
- Create: `apps/api/plane/tests/contract/hw/test_cycle_detection_api.py`

**Testing:**

**Unit tests** (`test_cycle_detection.py`) for the `detect_dependency_cycle` function directly:

- **dep-viz-propagation.AC2.1:** Create IssueRelation A→B (blocked_by), then call `detect_dependency_cycle` for B→A. Expect cycle path returned.
- **dep-viz-propagation.AC2.2:** Create chain A→B→C (blocked_by), then call for C→A. Expect cycle path `[A, B, C, A]`.
- **dep-viz-propagation.AC2.4:** Create A (project 1) → B (project 2) (blocked_by), then check B→A. Expect cycle detected across projects.
- **dep-viz-propagation.AC2.6:** Create A→B (relates_to), then check B→A with `blocked_by` type. Expect no cycle (relates_to not in dependency graph).
- **dep-viz-propagation.AC2.7:** Call for A→A. Expect cycle detected (self-reference).
- No cycle case: Create A→B (blocked_by), then check A→C. Expect `None` (no cycle).

Use `IssueFactory` and direct `IssueRelation.objects.create()` for setup. Mark with `@pytest.mark.unit` and `@pytest.mark.django_db`.

**Contract tests** (`test_cycle_detection_api.py`) for the API endpoint:

- **dep-viz-propagation.AC2.1:** POST to create A→B blocking, then POST B→A blocking. Expect HTTP 400 with `"error": "cycle_detected"`.
- **dep-viz-propagation.AC2.2:** POST chain A→B→C, then POST C→A. Expect HTTP 400 with cycle path in response.
- **dep-viz-propagation.AC2.5:** Verify the HTTP 400 response includes `cycle_path` array with issue IDs.
- **dep-viz-propagation.AC2.6:** POST A→B as relates_to, then POST B→A as blocking. Expect HTTP 201 (relates_to doesn't affect cycle detection).
- **dep-viz-propagation.AC2.7:** POST A→A blocking. Expect HTTP 400.

Use `session_client` fixture. Follow patterns in `apps/api/plane/tests/contract/hw/test_issue_types.py`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u -v` (unit tests)
Run: `cd apps/api && python run_tests.py -c -v` (contract tests)
Expected: All tests pass.

**Commit:** `test(api): add unit and contract tests for cycle detection`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: Frontend cycle detection helper

**Verifies:** dep-viz-propagation.AC2.3, dep-viz-propagation.AC2.6

**Files:**

- Create: `apps/web/hw/helpers/dependency-validation.ts`

**Implementation:**

Create a pure function that checks for cycles using the in-memory relation data from the MobX store's `relationMap`. The function takes:

```typescript
type DependencyRelationMap = Record<string, Record<string, string[]>>;

function detectCycleInMemory(
  relationMap: DependencyRelationMap,
  sourceIssueId: string,
  targetIssueId: string
): string[] | null;
```

Returns `null` if no cycle, or a list of issue IDs forming the cycle path.

Key design decisions:

- Only scheduling/dependency types participate: `blocking`, `blocked_by`, `start_before`, `start_after`, `finish_before`, `finish_after`, `implemented_by`, `implements`.
- The function traverses the `relationMap` graph using DFS from `targetIssueId`, following all dependency relations outward, and checks if `sourceIssueId` is reachable.
- Self-referencing (source === target) returns `[sourceIssueId]`.
- Depth limit of 100 to match backend.

This function is pure and testable without MobX — it operates on a plain `Record` structure matching the shape of `relationMap`.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors.

**Commit:** `feat(web): add frontend cycle detection helper for dependency validation`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Frontend tests for cycle detection helper

**Verifies:** dep-viz-propagation.AC2.3, dep-viz-propagation.AC2.6

**Files:**

- Create: `apps/web/hw/helpers/dependency-validation.test.ts`

**Testing:**

Tests for `detectCycleInMemory`:

- **dep-viz-propagation.AC2.3 (direct cycle):** Build a relationMap with A→B (blocking), then check B→A. Expect cycle path returned.
- **dep-viz-propagation.AC2.3 (transitive cycle):** Build A→B→C chain, check C→A. Expect cycle path.
- **dep-viz-propagation.AC2.6 (non-dependency types excluded):** Build A→B with `relates_to` only, check B→A with dependency type. Expect no cycle.
- **Self-reference:** Check A→A. Expect cycle.
- **No cycle:** Build A→B, check A→C. Expect `null`.
- **Empty graph:** Check any relation on empty map. Expect `null`.

Use `describe`/`it`/`expect` from vitest. No mocking needed — the function is pure.

**Verification:**

Run: `pnpm --filter web test`
Expected: All tests pass.

**Commit:** `test(web): add tests for frontend cycle detection helper`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->
