# CPM Critical Path — Phase 7: E2E Tests

**Goal:** Verify the full CPM feature stack works end-to-end in a browser with Playwright, covering toggle, critical path highlights, virtual dates, drag conversion, slack bars, and cross-project mode.

**Architecture:** Each test uses the existing E2E fixture infrastructure (`e2e/fixtures/index.ts`) which provides an authenticated page, workspace, and project. New API helpers create issues with dates and dependency relations via the REST API. Tests navigate to the gantt view and assert on visual indicators using `data-test` attributes added to CPM components.

**Tech Stack:** Playwright, TypeScript

**Scope:** 7 phases from original design (phase 7 of 7)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### cpm-critical-path.AC7: E2E tests

- **cpm-critical-path.AC7.1 Success:** Toggling CPM on for a project with dependencies shows critical path highlights on the gantt
- **cpm-critical-path.AC7.2 Success:** A dependency chain (A→B→C) correctly identifies and highlights the critical tasks
- **cpm-critical-path.AC7.3 Success:** A dateless task with a dependency appears on the gantt at its computed position when CPM is enabled
- **cpm-critical-path.AC7.4 Success:** Dragging a computed-date block converts it to manual dates that persist after CPM is toggled off
- **cpm-critical-path.AC7.5 Success:** Slack extension bars appear for non-critical tasks and are absent for critical tasks
- **cpm-critical-path.AC7.6 Success:** Enabling cross-project mode shows phantom anchors at timeline edges for external dependencies

---

## Reference Files

The implementor should read these files to understand existing patterns:

- **E2E agents guidance:** `e2e/AGENTS.md` — prerequisites, conventions, session cookie (`session-id`), `data-test` selectors, rate limiting notes.
- **E2E fixtures:** `e2e/fixtures/index.ts` — `test` export with `authenticatedPage`, `authToken`, `workspaceSlug`, `projectId` fixtures. Import `test` and `expect` from here, not `@playwright/test`.
- **E2E API helpers:** `e2e/helpers/api.ts` — `createWorkspace`, `createProject`, `createIssueType` patterns. Follow these for new `createIssue` and `createIssueRelation` helpers.
- **Existing smoke test pattern:** `e2e/tests/settings-pages-smoke.spec.ts` — simple navigation + `data-test` assertion pattern.
- **Playwright config:** `e2e/playwright.config.ts` — `timeout: 60000`, `expect.timeout: 10000`, `baseURL: http://localhost:3000`.
- **CPM toggle (from Phase 4):** `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx` — needs `data-test` attribute.
- **Critical path block styling (from Phase 4):** `apps/web/hw/components/gantt-chart/blocks/critical-block-style.tsx` — needs `data-test` attribute.
- **Slack bar (from Phase 5):** `apps/web/hw/components/gantt-chart/layers/additional-layers.tsx` — needs `data-test` attribute.
- **Computed date styling (from Phase 3):** Block elements with computed-date class — needs `data-test` attribute.
- **Phantom anchor (from Phase 6):** `apps/web/hw/components/gantt-chart/cpm/phantom-anchor.tsx` — needs `data-test` attribute.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Add `data-test` attributes to CPM components

**Verifies:** None (infrastructure — enables all AC7 tests)

**Files:**

- Modify: `apps/web/hw/components/gantt-chart/cpm/cpm-toggle.tsx`
- Modify: `apps/web/hw/components/gantt-chart/blocks/critical-block-style.tsx`
- Modify: `apps/web/hw/components/gantt-chart/layers/additional-layers.tsx`
- Modify: `apps/web/hw/components/gantt-chart/cpm/phantom-anchor.tsx`

**Implementation:**

Add `data-test` attributes to CPM components so Playwright tests can reliably locate them:

1. **CPM toggle** (`cpm-toggle.tsx`): Add `data-test="cpm-toggle"` to the main CPM toggle element, and `data-test="cpm-cross-project-toggle"` to the cross-project sub-toggle.

2. **Critical path block styling** (`critical-block-style.tsx`): Add `data-test="cpm-critical-block"` to each critical path overlay div. Include `data-test-issue-id={blockId}` for per-block identification.

3. **Slack bar** (`additional-layers.tsx`): Add `data-test="cpm-slack-bar"` to each slack extension bar div. Include `data-test-issue-id={blockId}` for per-block identification.

4. **Computed date blocks**: In the virtual-date block rendering (from Phase 3), ensure computed-date blocks include `data-test="cpm-computed-block"`.

5. **Phantom anchor** (`phantom-anchor.tsx`): Add `data-test="cpm-phantom-anchor"` to the phantom anchor div.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(gantt): add data-test attributes to CPM components for E2E tests`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create E2E API helpers for issues and relations

**Verifies:** None (infrastructure)

**Files:**

- Modify: `e2e/helpers/api.ts`

**Implementation:**

Add API helpers following the exact pattern of existing `createWorkspace` and `createProject` helpers:

1. **`createIssue`** — creates an issue in a project with optional dates:

```typescript
interface IssueCreatePayload {
  name: string;
  start_date?: string;
  target_date?: string;
}

export async function createIssue(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  payload: IssueCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
```

2. **`createIssueRelation`** — creates a dependency relation between two issues:

```typescript
export async function createIssueRelation(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  payload: { relation_type: string; related_list: string[] }
) {
  const response = await request.post(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-relations/`,
    {
      headers: {
        Cookie: `session-id=${token}`,
        "Content-Type": "application/json",
      },
      data: payload,
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create issue relation: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
```

3. **`getIssue`** — fetches an issue by ID (for assertion after drag):

```typescript
export async function getIssue(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  issueId: string
) {
  const response = await request.get(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    {
      headers: {
        Cookie: `session-id=${token}`,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to get issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
```

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors

**Commit:** `feat(e2e): add issue and relation API helpers for CPM tests`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->

### Task 3: E2E test — CPM toggle smoke and critical path identification

**Verifies:** cpm-critical-path.AC7.1, cpm-critical-path.AC7.2

**Files:**

- Create: `e2e/tests/cpm-critical-path.spec.ts`

**Implementation:**

Create the main CPM E2E test file. Import `test` and `expect` from `../fixtures/index` (not `@playwright/test`).

**Testing:**

Two test cases in a `test.describe("CPM Critical Path")` block:

- **cpm-critical-path.AC7.1:** "Toggling CPM on shows critical path highlights"
  1. Arrange: Via API, create 3 issues (A, B, C) with dates forming a chain. A: Jan 1–Jan 3, B: Jan 4–Jan 6, C: Jan 7–Jan 9. Create `blocking` relations A→B and B→C.
  2. Act: Navigate to `/{workspaceSlug}/projects/{projectId}/issues/?type=gantt`. Wait for gantt to render. Click the CPM toggle (`[data-test="cpm-toggle"]`).
  3. Assert: Critical path block overlays (`[data-test="cpm-critical-block"]`) appear. At least one block is visible.

- **cpm-critical-path.AC7.2:** "Dependency chain correctly identifies critical tasks"
  1. Arrange: Same setup as AC7.1, plus a shorter branch: create issue D (Jan 4–Jan 5) with A→D relation (D has 1 day of slack).
  2. Act: Navigate to gantt, enable CPM toggle.
  3. Assert: A, B, C have `[data-test="cpm-critical-block"]` overlays (check `data-test-issue-id` attributes). D does NOT have a critical block overlay.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec playwright test tests/cpm-critical-path.spec.ts --headed 2>&1 | tail -20
```

Expected: Both tests pass (requires dev servers running)

**Commit:** `test(e2e): add CPM toggle and critical path identification tests`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: E2E test — virtual dates and drag-to-manual conversion

**Verifies:** cpm-critical-path.AC7.3, cpm-critical-path.AC7.4

**Files:**

- Create: `e2e/tests/cpm-virtual-dates.spec.ts`

**Implementation:**

**Testing:**

Two test cases in a `test.describe("CPM Virtual Dates")` block:

- **cpm-critical-path.AC7.3:** "Dateless task appears at computed position when CPM is enabled"
  1. Arrange: Create issue A with dates (Jan 1–Jan 3). Create issue B with NO dates. Create `blocking` relation A→B.
  2. Act: Navigate to gantt, enable CPM toggle. Wait for rendering.
  3. Assert: A computed-date block (`[data-test="cpm-computed-block"]`) is visible on the gantt for issue B. The block should be positioned after A.

- **cpm-critical-path.AC7.4:** "Dragging a computed-date block converts to manual dates"
  1. Arrange: Same setup as AC7.3. Enable CPM.
  2. Act: Locate the computed-date block for B. Perform a drag operation (move it horizontally by some pixels using Playwright's `dragTo` or `mouse` API).
  3. Assert: After drag, fetch issue B via API (`getIssue`). Verify `start_date` and `target_date` are now non-null (manual dates persisted). Toggle CPM off. Verify the block for B is still visible (it now has manual dates).

Note: The drag-to-manual test is the most complex E2E scenario. If `dragTo` is unreliable in the gantt chart, use Playwright's lower-level `page.mouse.move/down/up` API with explicit coordinates. The test may need generous timeouts for the drag animation.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec playwright test tests/cpm-virtual-dates.spec.ts --headed 2>&1 | tail -20
```

Expected: Both tests pass

**Commit:** `test(e2e): add CPM virtual dates and drag-to-manual tests`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: E2E test — slack visualization and cross-project

**Verifies:** cpm-critical-path.AC7.5, cpm-critical-path.AC7.6

**Files:**

- Create: `e2e/tests/cpm-slack-and-cross-project.spec.ts`

**Implementation:**

**Testing:**

Two test cases:

- **cpm-critical-path.AC7.5:** "Slack bars appear for non-critical tasks, absent for critical"
  1. Arrange: Create chain A→B→C (critical path) and branch A→D (D shorter, has slack). All with dates.
  2. Act: Navigate to gantt, enable CPM.
  3. Assert: Slack bars (`[data-test="cpm-slack-bar"]`) exist. D's slack bar is present (check `data-test-issue-id`). Critical tasks (A, B, C) do NOT have slack bars.

- **cpm-critical-path.AC7.6:** "Cross-project mode shows phantom anchors"
  1. Arrange: Create a second project. Create issue X in project 2 with dates. Create issue Y in project 1 with dates. Create a cross-project `blocking` relation X→Y (X blocks Y).
  2. Act: Navigate to project 1's gantt, enable CPM, then enable cross-project mode (`[data-test="cpm-cross-project-toggle"]`).
  3. Assert: A phantom anchor (`[data-test="cpm-phantom-anchor"]`) appears at the timeline edge representing issue X.

Note: Cross-project relation creation via API may require the relation endpoint to accept cross-project issue IDs. Verify the API supports this. If the cross-project test proves too brittle (depends on API supporting cross-project relations from the test fixture), mark it as `test.fixme()` with a comment explaining why, and verify manually.

**Verification:**

```bash
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec playwright test tests/cpm-slack-and-cross-project.spec.ts --headed 2>&1 | tail -20
```

Expected: Both tests pass

**Commit:** `test(e2e): add CPM slack visualization and cross-project tests`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (task 6) -->

<!-- START_TASK_6 -->

### Task 6: Run full E2E suite and verify clean state

**Verifies:** All cpm-critical-path.AC7.\* (final verification)

**Files:**

- No new files

**Verification:**

```bash
# Run all CPM E2E tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec playwright test tests/cpm-*.spec.ts --headed 2>&1 | tail -40

# Run full E2E suite (no regressions)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && pnpm exec playwright test 2>&1 | tail -40

# Run all CPM unit tests (no regressions from data-test attribute changes)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/cpm-calculator.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cpm-store.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/helpers/slack-bar-position.test.ts
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec vitest run hw/store/timeline/cross-project-cpm.test.ts

# Type check
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && pnpm exec tsc --noEmit --pretty 2>&1 | head -40
```

Expected: All E2E tests pass, all unit tests pass, no type errors, no regressions.

**Commit:** No commit needed (verification only). If any issues found, fix and commit with appropriate message.

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_C -->
