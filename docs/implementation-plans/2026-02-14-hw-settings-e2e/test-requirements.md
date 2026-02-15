# Test requirements: hw-settings-e2e

This document maps every acceptance criterion from the `hw-settings-e2e` design plan to either an automated test or a documented human verification procedure. The mapping reflects decisions made during implementation planning across Phases 1 through 5.

---

## Summary table

| AC ID  | Criterion                                                   | Test type          | Automated? | Location / approach                              |
| ------ | ----------------------------------------------------------- | ------------------ | ---------- | ------------------------------------------------ |
| AC1.1  | GET returns file from MinIO (200, correct Content-Type)     | Human verification | No         | Manual curl against local dev stack              |
| AC1.2  | HEAD returns headers without body                           | Human verification | No         | Manual curl against local dev stack              |
| AC1.3  | DEBUG=False blocks proxy (403 or URL not registered)        | Human verification | No         | Manual curl with production settings             |
| AC1.4  | Paths containing `..` rejected by URL regex                 | Human verification | No         | Manual curl with traversal path                  |
| AC1.5  | POST/PUT/DELETE return 405                                  | Human verification | No         | Manual curl with disallowed methods              |
| AC1.6  | MinIO unreachable returns 502; timeout returns 504          | Human verification | No         | Manual curl with MinIO stopped                   |
| AC1.7  | Project creation succeeds (cover image upload without 404)  | Human verification | No         | Manual UI test in browser                        |
| AC2.1  | Workspace issue types page renders list                     | E2E                | Yes        | `e2e/tests/settings-pages-smoke.spec.ts`         |
| AC2.2  | Admin can create issue type via modal                       | E2E                | Yes        | `e2e/tests/issue-type-crud.spec.ts`              |
| AC2.3  | Clicking issue type opens side panel                        | E2E                | Yes        | `e2e/tests/settings-pages-smoke.spec.ts`         |
| AC2.4  | Property creation in side panel works                       | E2E                | Yes        | `e2e/tests/issue-type-crud.spec.ts`              |
| AC2.5  | Project issue types page renders with toggles               | E2E                | Yes        | `e2e/tests/settings-pages-smoke.spec.ts`         |
| AC2.6  | Toggle persists across reload                               | Human verification | No         | Manual toggle + reload in browser                |
| AC2.7  | Project sidebar shows "Issue types" link                    | Human verification | No         | Visual inspection in browser                     |
| AC2.8  | Workspace sidebar shows "Issue types" link                  | Human verification | No         | Visual inspection in browser                     |
| AC2.9  | Non-admin users see read-only view                          | Human verification | No         | Login as MEMBER, inspect UI                      |
| AC2.10 | No upstream CE changes (HW overlay only)                    | Automated (CI)     | Yes        | `git diff --name-only -- packages/`              |
| AC3.1  | Delete broken/stale tests                                   | Automated (CI)     | Yes        | File-existence check in CI or local verification |
| AC3.2  | Smoke tests pass                                            | E2E                | Yes        | `e2e/tests/settings-pages-smoke.spec.ts`         |
| AC3.3  | Critical path: create issue type                            | E2E                | Yes        | `e2e/tests/issue-type-crud.spec.ts`              |
| AC3.4  | Critical path: create property definition                   | E2E                | Yes        | `e2e/tests/issue-type-crud.spec.ts`              |
| AC3.5  | Critical path: select issue type on issue                   | E2E                | Yes        | `e2e/tests/issue-type-selection.spec.ts`         |
| AC3.6  | data-test attributes on all interactive elements            | E2E (implicit)     | Yes        | All E2E tests fail if attributes missing         |
| AC3.7  | All E2E tests pass in CI                                    | E2E                | Yes        | Full suite via `./e2e/run-tests.sh`              |
| AC4.1  | Store exposes CRUD for issue types and property definitions | E2E (indirect)     | Partial    | Exercised via UI in E2E tests; no unit test      |
| AC4.2  | Actions call service methods                                | E2E (indirect)     | Partial    | Verified by API persistence checks in E2E        |
| AC4.3  | Optimistic updates with rollback on error                   | Human verification | No         | Manual network-throttle test in browser          |

---

## Automated tests

### E2E test: `e2e/tests/settings-pages-smoke.spec.ts`

**Phase:** 5 (Task 3)

**Covers:** AC2.1, AC2.3, AC2.5, AC3.2, AC3.6

| Test name                                      | Criteria verified | Description                                                                                                                                                               |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace issue types settings page loads`    | AC2.1, AC3.2      | Navigates to `/{workspaceSlug}/settings/issue-types` and asserts the `[data-test="issue-type-list"]` container is visible within 10 seconds.                              |
| `project issue types settings page loads`      | AC2.5, AC3.2      | Navigates to `/{workspaceSlug}/settings/projects/{projectId}/issue-types` and asserts the `[data-test="project-issue-type-list"]` container is visible within 10 seconds. |
| `side panel opens when clicking an issue type` | AC2.3, AC3.2      | Creates an issue type via API, navigates to workspace settings, clicks the type row, and asserts `[data-test="issue-type-side-panel"]` becomes visible.                   |

All three tests implicitly verify AC3.6 because they depend on `data-test` attributes to locate elements. If the attributes are missing, the tests fail.

---

### E2E test: `e2e/tests/issue-type-crud.spec.ts`

**Phase:** 5 (Tasks 4 and 5)

**Covers:** AC2.2, AC2.4, AC3.3, AC3.4, AC3.6

| Test name                                                     | Criteria verified | Description                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create issue type through UI and verify via API`             | AC2.2, AC3.3      | Navigates to workspace settings, clicks `[data-test="issue-type-create-btn"]`, fills the form (`issue-type-name-input`, `issue-type-description-input`), submits, waits for the type to appear in the list, then calls `getWorkspaceIssueTypes()` to confirm persistence.                                                                     |
| `view properties on an issue type via side panel`             | AC2.4, AC3.4      | Creates an issue type and a property definition via API, navigates to settings, clicks the type, and asserts `[data-test="property-item"]` with the property name is visible inside the `[data-test="property-list"]` container within the side panel.                                                                                        |
| `create property on issue type through UI and verify via API` | AC2.4, AC3.4      | Creates an issue type via API, navigates to settings, opens the side panel, clicks `[data-test="property-add-btn"]`, fills the property form (`property-name-input`, `property-type-select`), submits, waits for it to appear in the property list, then calls `getPropertyDefinitions()` to confirm persistence and correct `issue_type_id`. |

---

### E2E test: `e2e/tests/issue-type-selection.spec.ts`

**Phase:** 5 (Task 6)

**Covers:** AC3.5, AC3.7

| Test name                                                     | Criteria verified | Description                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `select issue type when creating an issue and verify via API` | AC3.5             | Creates an issue type via API, links it to the project, navigates to the project issues list, opens the create-issue modal, selects the linked type from the type dropdown, submits, then fetches the created issue via API and asserts `type_id` matches the linked issue type's ID. |

---

### E2E test suite: full run

**Phase:** 5 (Task 7)

**Covers:** AC3.7

Running `./e2e/run-tests.sh` exercises all test files, including the existing `issue-types-switching.spec.ts` and `issue-types-filtering.spec.ts` alongside the new files. A green suite run satisfies AC3.7.

---

### Automated verification: AC3.1 (broken tests deleted)

**Phase:** 5 (Task 1)

**Covers:** AC3.1

After Task 1 deletes the files, verification is:

```bash
ls e2e/tests/issue-types-create.spec.ts e2e/tests/properties-management.spec.ts 2>&1
```

Expected output: "No such file or directory" for both files. This can be scripted as a CI step or verified by the E2E test runner itself (if the files existed, they would fail and break AC3.7).

---

### Automated verification: AC2.10 (no upstream changes)

**Phase:** 2 (Task 7), verified again in Phases 3, 4, and 5

**Covers:** AC2.10

```bash
git diff --name-only -- packages/
```

Expected output: empty (no files in `packages/` modified). This should be a CI gate. The implementation plan explicitly checks this in the verification steps of Phase 2 Task 7, Phase 3 Task 11, Phase 4 Task 6, and Phase 5 Task 7.

---

### Store CRUD coverage: AC4.1, AC4.2 (indirect via E2E)

**Phase:** 2 (Tasks 1 and 2), exercised in Phase 5

**Covers:** AC4.1, AC4.2

There are no dedicated unit tests for the `IssuePropertyStore` CRUD methods. The implementation plan for Phase 2 notes this is "frontend code without automated tests (verified by E2E tests in Phase 5 and manual testing)."

The E2E tests provide indirect verification:

- **AC4.1** (`createDefinition`, `updateDefinition`, `deleteDefinition` exist): The "create property on issue type through UI" test in `issue-type-crud.spec.ts` exercises `createDefinition()` through the UI. If the store method did not exist or was not wired, the UI form submission would fail and the test would fail.
- **AC4.2** (actions call service methods): The API persistence check (`getPropertyDefinitions()`) in the same test confirms the store action successfully called the service method, since data appeared in the database.

**Gap:** `updateDefinition()` and `deleteDefinition()` are not directly exercised by E2E tests (edit and delete are out of scope per the design plan's "Out of scope" section). These are covered by human verification.

---

## Human verification

### AC1.1 through AC1.7: Django dev middleware proxies `/uploads/*` to MinIO

**Phase:** 1 (Task 5 -- operational verification)

**Justification:** Phase 1 is infrastructure. The proxy view is a Django view that only runs with `DEBUG=True` against a live MinIO container. Automated testing would require:

- A running MinIO container with seeded test files
- A running Django dev server with `DEBUG=True`
- Network manipulation to simulate MinIO outages (for AC1.6)

This environment is too heavyweight for unit tests and not reachable from the Playwright E2E setup (which tests the frontend, not backend HTTP directly). The proxy is intentionally simple (one function, no ORM, no DRF) and the implementation plan prescribes manual curl verification against the local Docker stack.

**Verification steps:**

| AC    | Step                                                                                                         | Expected result                                          |
| ----- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| AC1.1 | `curl -v "http://localhost:8000/uploads/{path-to-existing-file}"`                                            | 200 OK with correct `Content-Type` and file body         |
| AC1.2 | `curl -I "http://localhost:8000/uploads/{path-to-existing-file}"`                                            | 200 OK with headers, no body                             |
| AC1.3 | Start Django with `DEBUG=False`, then `curl -v "http://localhost:8000/uploads/test"`                         | 404 (URL not registered) or 403 (defense-in-depth guard) |
| AC1.4 | `curl -I "http://localhost:8000/uploads/../../../etc/passwd"`                                                | 404 Not Found (regex rejects `..`)                       |
| AC1.5 | `curl -X POST "http://localhost:8000/uploads/test"`                                                          | 405 Method Not Allowed                                   |
| AC1.6 | Stop MinIO (`docker compose stop plane-minio`), then `curl -v "http://localhost:8000/uploads/test/file.png"` | 502 Bad Gateway. Restart MinIO afterward.                |
| AC1.7 | Open `http://localhost:3000`, create a new project (triggers cover image upload)                             | Project creation succeeds without 404 on `/uploads/*`    |

**Prerequisites:** Docker services running (`docker compose -f docker-compose-local.yml up`), Django dev server running with `DEBUG=True`.

---

### AC2.6: Toggle persists across reload

**Phase:** 4 (Task 6 -- operational verification)

**Justification:** The E2E smoke test for the project issue types page (AC2.5) verifies the page renders, but does not exercise the toggle-then-reload persistence flow. Adding a full toggle-reload E2E test was considered but excluded from the design plan's scope. The toggle flow involves:

1. Toggling a switch (calling `linkProjectIssueType` or `unlinkProjectIssueType`)
2. Reloading the page
3. Verifying the toggle reflects the persisted state

This is a straightforward manual verification that does not require complex test infrastructure.

**Verification steps:**

1. Navigate to `/{workspaceSlug}/settings/projects/{projectId}/issue-types`.
2. Identify a workspace issue type in the list whose toggle is OFF.
3. Click the toggle to turn it ON.
4. Wait for the toggle to settle (no loading spinner).
5. Reload the page (Ctrl+R or Cmd+R).
6. Verify the same toggle is still ON after reload.
7. Toggle it OFF, reload again, and verify it is OFF.

---

### AC2.7: Project sidebar shows "Issue types" link

**Phase:** 2 (Tasks 5 and 6 -- operational verification)

**Justification:** The sidebar entry is a navigation link added via the HW overlay. While an E2E test could verify it, the design plan does not include a dedicated sidebar link test -- the smoke tests navigate directly to the settings pages via URL rather than clicking sidebar links. Sidebar rendering involves layout components and route-aware active-state logic that is best verified visually.

**Verification steps:**

1. Navigate to `/{workspaceSlug}/settings/projects/{projectId}/`.
2. Inspect the left sidebar under the Settings section.
3. Verify an "Issue types" entry appears (with a `Layers` icon).
4. Click the entry.
5. Verify it navigates to `/{workspaceSlug}/settings/projects/{projectId}/issue-types`.

---

### AC2.8: Workspace sidebar shows "Issue types" link

**Phase:** 2 (Tasks 5 and 6 -- operational verification)

**Justification:** Same rationale as AC2.7. The workspace sidebar entry is verified visually.

**Verification steps:**

1. Navigate to `/{workspaceSlug}/settings/`.
2. Inspect the left sidebar under the Settings section (Features category).
3. Verify an "Issue types" entry appears.
4. Click the entry.
5. Verify it navigates to `/{workspaceSlug}/settings/issue-types`.

---

### AC2.9: Non-admin users see read-only view

**Phase:** 3 (Task 11) and Phase 4 (Task 6 -- operational verification)

**Justification:** Testing non-admin permissions requires a second user account with MEMBER or GUEST role. The E2E fixture system creates a single admin user per test. Creating a multi-user fixture would add significant complexity for a single visual check. The design plan explicitly marks this as manual verification.

**Verification steps:**

1. Log in as a user with MEMBER role (not ADMIN) in the workspace.
2. Navigate to `/{workspaceSlug}/settings/issue-types`.
3. Verify the page renders (not a 403 or redirect).
4. Verify the "Add issue type" button (`data-test="issue-type-create-btn"`) is NOT visible.
5. Click an issue type to open the side panel.
6. Verify the "Add property" button (`data-test="property-add-btn"`) is NOT visible.
7. Verify kebab menus (Edit/Delete) are NOT visible on issue type rows or property rows.
8. Navigate to `/{workspaceSlug}/settings/projects/{projectId}/issue-types`.
9. Verify toggle switches are disabled (non-interactive).

---

### AC4.3: Optimistic updates with rollback on error

**Phase:** 2 (Task 2 -- code review and manual verification)

**Justification:** Optimistic update behavior (immediate UI update followed by rollback on API failure) is a runtime behavior that depends on network timing. Testing it in E2E would require:

- Intercepting network requests to simulate API failures
- Observing transient UI state changes within milliseconds

While Playwright supports request interception, the design plan does not include such tests (they are fragile and slow). The implementation follows the exact same pattern as the already-trusted `IssueTypeStore` optimistic updates.

**Verification steps:**

1. **Code review:** Confirm `updateDefinition()` and `deleteDefinition()` in `apps/web/hw/store/issue-property.store.ts` follow the optimistic update pattern:
   - Save original data before the API call
   - Apply the change to `definitionsMap` immediately (before `await`)
   - On catch, restore the original data to `definitionsMap`
   - Set `this.error` with a descriptive message
   - Re-throw the error
2. **Manual test (update):** Open browser DevTools Network tab. Edit a property name. Observe the property name changes immediately in the UI. Then, to test rollback: use DevTools to throttle network to "Offline", attempt an edit, and verify the UI reverts to the original value after the error.
3. **Manual test (delete):** Same approach -- delete a property with network offline, verify it reappears after the error toast.

---

## Coverage matrix

The following matrix shows which phase implements each criterion and which phase verifies it.

| AC     | Implemented in                   | Verified by                       | Verification method                        |
| ------ | -------------------------------- | --------------------------------- | ------------------------------------------ |
| AC1.1  | Phase 1, Task 2                  | Phase 1, Task 5                   | Manual curl                                |
| AC1.2  | Phase 1, Task 2                  | Phase 1, Task 5                   | Manual curl                                |
| AC1.3  | Phase 1, Tasks 2+4               | Phase 1, Task 5                   | Manual curl                                |
| AC1.4  | Phase 1, Task 4                  | Phase 1, Task 5                   | Manual curl                                |
| AC1.5  | Phase 1, Task 2                  | Phase 1, Task 5                   | Manual curl                                |
| AC1.6  | Phase 1, Task 2                  | Phase 1, Task 5                   | Manual curl + Docker stop                  |
| AC1.7  | Phase 1, Tasks 1-4               | Phase 1, Task 5                   | Manual browser test                        |
| AC2.1  | Phase 3, Tasks 1-10              | Phase 5, Task 3                   | E2E smoke test                             |
| AC2.2  | Phase 3, Tasks 2-3,9             | Phase 5, Task 4                   | E2E critical path test                     |
| AC2.3  | Phase 3, Tasks 4,8,9             | Phase 5, Task 3                   | E2E smoke test                             |
| AC2.4  | Phase 3, Tasks 6-8               | Phase 5, Task 5                   | E2E critical path test                     |
| AC2.5  | Phase 4, Tasks 1-5               | Phase 5, Task 3                   | E2E smoke test                             |
| AC2.6  | Phase 4, Tasks 2-3               | Phase 4, Task 6                   | Manual toggle + reload                     |
| AC2.7  | Phase 2, Tasks 5-6               | Phase 2, Task 7                   | Manual visual inspection                   |
| AC2.8  | Phase 2, Tasks 5-6               | Phase 2, Task 7                   | Manual visual inspection                   |
| AC2.9  | Phase 3, Task 9; Phase 4, Task 5 | Phase 3, Task 11; Phase 4, Task 6 | Manual login as MEMBER                     |
| AC2.10 | All phases (constraint)          | Phase 2, Task 7; Phase 5, Task 7  | `git diff --name-only -- packages/`        |
| AC3.1  | Phase 5, Task 1                  | Phase 5, Task 1                   | File-existence check                       |
| AC3.2  | Phase 5, Task 3                  | Phase 5, Task 3                   | E2E smoke tests pass                       |
| AC3.3  | Phase 5, Task 4                  | Phase 5, Task 4                   | E2E critical path test passes              |
| AC3.4  | Phase 5, Task 5                  | Phase 5, Task 5                   | E2E critical path test passes              |
| AC3.5  | Phase 5, Task 6                  | Phase 5, Task 6                   | E2E critical path test passes              |
| AC3.6  | Phases 3+4 (components)          | Phase 5 (all tests)               | E2E tests use `data-test` selectors        |
| AC3.7  | Phase 5, Task 7                  | Phase 5, Task 7                   | Full suite via `./e2e/run-tests.sh`        |
| AC4.1  | Phase 2, Tasks 1-2               | Phase 5 (indirect)                | E2E exercises `createDefinition` via UI    |
| AC4.2  | Phase 2, Task 2                  | Phase 5 (indirect)                | E2E API verification confirms service call |
| AC4.3  | Phase 2, Task 2                  | Phase 2 (code review)             | Manual network-throttle test               |

---

## Gaps and rationale

### No unit tests for IssuePropertyStore (AC4.1, AC4.2, AC4.3)

The implementation plan does not include unit tests for the MobX store CRUD methods. This is a deliberate decision documented in the design plan:

- The store methods are thin wrappers around service calls with MobX observable updates.
- The pattern exactly mirrors `IssueTypeStore`, which also has no unit tests.
- E2E tests exercise `createDefinition()` indirectly through the UI, providing integration-level confidence.
- `updateDefinition()` and `deleteDefinition()` are out of scope for E2E (the design plan's "Out of scope" section excludes edit and delete lifecycle tests).

**Recommendation for future work:** Add unit tests for all three store methods using a mocked `IssuePropertyService`. This would cover error paths and optimistic rollback without requiring a running backend.

### No E2E test for toggle persistence (AC2.6)

The toggle-then-reload flow is a natural fit for E2E automation, but the design plan scopes the E2E tests to smoke (page loads) and critical paths (create type, create property, select type on issue). Toggle persistence is considered a lower-risk flow since the toggle calls existing, proven store methods (`linkProjectIssueType`, `unlinkProjectIssueType`).

**Recommendation for future work:** Add a critical path E2E test that toggles an issue type ON, reloads, and asserts the toggle state persisted.

### No E2E test for sidebar links (AC2.7, AC2.8)

The smoke tests navigate directly to settings pages via URL, bypassing sidebar navigation. Sidebar link rendering is a layout concern verified visually.

**Recommendation for future work:** Add a smoke test that clicks the sidebar "Issue types" link and verifies navigation to the correct URL.

### No E2E test for non-admin read-only view (AC2.9)

The E2E fixture system creates a single admin user. Multi-user permission testing would require extending the fixture to create a second MEMBER user, which adds complexity the design plan chose not to include.

**Recommendation for future work:** Extend E2E fixtures to support a `memberPage` (authenticated as MEMBER) and add a test verifying action buttons are hidden.
