# HW Settings E2E — Phase 5: E2E Tests

**Goal:** Delete broken E2E tests that target non-existent routes, add API helpers for property definitions, and write smoke tests and critical path tests for the new issue types settings pages and property management workflow.

**Architecture:** Tests use the Playwright fixture system (`e2e/fixtures/index.ts`) which auto-creates isolated auth sessions, workspaces, and projects per test. API helpers in `e2e/helpers/api.ts` handle data setup and verification. Tests follow the "UI action + API verification" pattern: perform actions through the UI, then verify persistence via direct API calls. All selectors prefer `data-test` attributes added in Phases 3-4.

**Tech Stack:** Playwright, TypeScript

**Scope:** 5 of 5 phases from original design

**Codebase verified:** 2026-02-14

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-settings-e2e.AC3: E2E smoke and critical path tests

- **hw-settings-e2e.AC3.1 Success:** `issue-types-create.spec.ts` and `properties-management.spec.ts` are deleted (they test non-existent routes).
- **hw-settings-e2e.AC3.2 Success:** Smoke tests verify both settings pages load and key elements render.
- **hw-settings-e2e.AC3.3 Success:** A critical path test creates an issue type through the UI and verifies persistence via API fetch.
- **hw-settings-e2e.AC3.4 Success:** A critical path test creates a property on an issue type through the UI and verifies persistence via API fetch.
- **hw-settings-e2e.AC3.5 Success:** A critical path test selects an issue type when creating an issue and verifies the issue's `type_id` via API fetch.
- **hw-settings-e2e.AC3.6 Constraint:** All new components use `data-test` attributes following the documented convention.
- **hw-settings-e2e.AC3.7 Success:** All E2E tests pass when run against the local dev stack (`docker-compose-local.yml` + `pnpm dev`).

---

## Reference Files (for implementation)

| Pattern                               | Reference File                                   |
| ------------------------------------- | ------------------------------------------------ |
| Playwright fixtures                   | `e2e/fixtures/index.ts`                          |
| API helpers                           | `e2e/helpers/api.ts`                             |
| Wait helpers                          | `e2e/helpers/wait.ts`                            |
| Selector helpers                      | `e2e/helpers/selectors.ts`                       |
| Auth helpers                          | `e2e/helpers/auth.ts`                            |
| Existing passing test (switching)     | `e2e/tests/issue-types-switching.spec.ts`        |
| Existing passing test (filtering)     | `e2e/tests/issue-types-filtering.spec.ts`        |
| Playwright config                     | `e2e/playwright.config.ts`                       |
| Run tests script                      | `e2e/run-tests.sh`                               |
| Property definition service endpoints | `apps/web/hw/services/issue-property.service.ts` |
| Issue type service endpoints          | `apps/web/hw/services/issue-type.service.ts`     |

---

## API Endpoints Used in Tests

| Operation                  | Method | Endpoint                                                 |
| -------------------------- | ------ | -------------------------------------------------------- |
| List workspace issue types | GET    | `/api/workspaces/{slug}/issue-types/`                    |
| Create issue type          | POST   | `/api/workspaces/{slug}/issue-types/`                    |
| List property definitions  | GET    | `/api/workspaces/{slug}/property-definitions/`           |
| Create property definition | POST   | `/api/workspaces/{slug}/property-definitions/`           |
| Link type to project       | POST   | `/api/workspaces/{slug}/projects/{id}/issue-types/`      |
| Create issue               | POST   | `/api/workspaces/{slug}/projects/{id}/issues/`           |
| Get single issue           | GET    | `/api/workspaces/{slug}/projects/{id}/issues/{issueId}/` |

---

<!-- START_TASK_1 -->

### Task 1: Delete broken E2E test files

**Verifies:** hw-settings-e2e.AC3.1

**Files:**

- Delete: `e2e/tests/issue-types-create.spec.ts`
- Delete: `e2e/tests/properties-management.spec.ts`

**Implementation:**

Delete these two files. They test routes that do not exist in the current application:

- `issue-types-create.spec.ts` navigates to `/{workspaceSlug}/settings/issue-types` using old selectors like `button:has-text('Add')` that don't match the new UI
- `properties-management.spec.ts` navigates to `/{workspaceSlug}/projects/{projectId}/settings/properties` which is not a valid route in the new design

```bash
rm e2e/tests/issue-types-create.spec.ts
rm e2e/tests/properties-management.spec.ts
```

**Verification:**

```bash
ls e2e/tests/issue-types-create.spec.ts e2e/tests/properties-management.spec.ts 2>&1
```

Expected: Both files should report "No such file or directory".

Verify the remaining test files are intact:

```bash
ls e2e/tests/issue-types-switching.spec.ts e2e/tests/issue-types-filtering.spec.ts
```

Expected: Both files exist.

**Commit:** `chore(e2e): remove broken issue-types-create and properties-management tests`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add API helpers for property definitions and issue type fetching

**Verifies:** hw-settings-e2e.AC3.3, hw-settings-e2e.AC3.4

**Files:**

- Modify: `e2e/helpers/api.ts` (add new helper functions)

**Implementation:**

Add three new API helper functions to `e2e/helpers/api.ts`. These are needed by the critical path tests to:

1. Create property definitions via API (for setup)
2. Fetch workspace issue types via API (for verification)
3. Fetch property definitions via API (for verification)

> **Naming clarification:** This task adds `createPropertyDefinition` which hits the **workspace-scoped** endpoint `/api/workspaces/{slug}/property-definitions/`. This is distinct from any existing `createIssueProperty` helper that may hit the **project-scoped** endpoint `/api/workspaces/{slug}/projects/{id}/issue-properties/`. The workspace endpoint manages property definitions (type schemas), while the project endpoint manages property values on issues. Tests in this phase use the workspace endpoint for setup and verification.

> **Defensive response parsing:** The list endpoints (`getWorkspaceIssueTypes`, `getPropertyDefinitions`) may return either a flat array or a paginated object with a `results` field. All list helpers should normalize the response. Use this pattern after `response.json()`:
>
> ```typescript
> const data = await response.json();
> return Array.isArray(data) ? data : (data.results ?? []);
> ```

Ensure `API_BASE_URL` is exported from this file so other test files can import it:

```typescript
export const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
```

If `API_BASE_URL` is already defined but not exported, add the `export` keyword. If it doesn't exist yet, add it near the top of the file after the imports.

Add a new payload interface and three new functions after the existing `getWorkspaces` function:

**New interface (add near the top with other interfaces):**

```typescript
interface PropertyDefinitionCreatePayload {
  name: string;
  property_type: string;
  issue_type_id?: string;
  is_required?: boolean;
  options?: string[];
}
```

**New functions:**

```typescript
/**
 * Create a property definition via the API.
 * Property definitions are workspace-scoped at /api/workspaces/{slug}/property-definitions/.
 */
export async function createPropertyDefinition(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  payload: PropertyDefinitionCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/property-definitions/`, {
    headers: {
      Cookie: `sessionid=${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create property definition: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data;
}

/**
 * List workspace issue types via the API (for verification).
 * Returns a flat array, handling both paginated and non-paginated responses.
 */
export async function getWorkspaceIssueTypes(request: APIRequestContext, token: string, workspaceSlug: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/issue-types/`, {
    headers: {
      Cookie: `sessionid=${token}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch issue types: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

/**
 * List property definitions via the API (for verification).
 * Returns a flat array, handling both paginated and non-paginated responses.
 */
export async function getPropertyDefinitions(request: APIRequestContext, token: string, workspaceSlug: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/property-definitions/`, {
    headers: {
      Cookie: `sessionid=${token}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch property definitions: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

/**
 * Get a single issue via the API (for verification of type_id).
 */
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
        Cookie: `sessionid=${token}`,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to fetch issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
```

**Verification:**

```bash
cd e2e && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors in the helpers file.

**Commit:** `feat(e2e): add API helpers for property definitions and issue verification`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Write smoke tests for settings pages

**Verifies:** hw-settings-e2e.AC3.2, hw-settings-e2e.AC3.6, hw-settings-e2e.AC3.7

**Files:**

- Create: `e2e/tests/settings-pages-smoke.spec.ts`

**Implementation:**

Create smoke tests that verify both settings pages load and key elements render. Smoke tests should be fast and verify basic page rendering without complex interactions.

Follow the exact pattern from `e2e/tests/issue-types-switching.spec.ts`:

- Import `test, expect` from `../fixtures/index`
- Import API helpers from `../helpers/api`
- Use fixture destructuring for `authenticatedPage`, `request`, `authToken`, `workspaceSlug`, `projectId`
- Assign `const page = authenticatedPage;` for cleaner code

**Three smoke tests:**

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssueType } from "../helpers/api";

test.describe("Settings Pages Smoke Tests", () => {
  test("workspace issue types settings page loads", async ({ authenticatedPage, workspaceSlug }) => {
    const page = authenticatedPage;

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Verify the page renders with the issue type list container
    const listContainer = page.locator("[data-test='issue-type-list']");
    await expect(listContainer).toBeVisible({ timeout: 10000 });
  });

  test("project issue types settings page loads", async ({ authenticatedPage, workspaceSlug, projectId }) => {
    const page = authenticatedPage;

    // Navigate to project issue types settings
    await page.goto(`/${workspaceSlug}/settings/projects/${projectId}/issue-types`);

    // Verify the page renders with the project issue type list container
    const listContainer = page.locator("[data-test='project-issue-type-list']");
    await expect(listContainer).toBeVisible({ timeout: 10000 });
  });

  test("side panel opens when clicking an issue type", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
  }) => {
    const page = authenticatedPage;

    // Create an issue type via API for the test
    await createIssueType(request, authToken, workspaceSlug, {
      name: "Smoke Test Type",
      description: "Type for smoke testing",
      logo_props: { color: "#10B981" },
    });

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the list to render
    const listContainer = page.locator("[data-test='issue-type-list']");
    await expect(listContainer).toBeVisible({ timeout: 10000 });

    // Click on the created issue type
    const typeItem = page.locator("[data-test='issue-type-item']").filter({ hasText: "Smoke Test Type" });
    await typeItem.click();

    // Verify the side panel opens
    const sidePanel = page.locator("[data-test='issue-type-side-panel']");
    await expect(sidePanel).toBeVisible({ timeout: 5000 });
  });
});
```

**Key design decisions:**

- Each test is isolated (creates its own data where needed)
- 10s timeout for initial page load (settings pages may need MobX store hydration)
- 5s timeout for side panel (should be fast after page load)
- Uses `data-test` attributes exclusively for main assertions
- Filter by text content (`hasText`) when multiple items with same `data-test` could exist

**Verification:**

```bash
cd e2e && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Run the smoke tests:

```bash
./e2e/run-tests.sh --grep "Settings Pages Smoke"
```

Expected: All 3 smoke tests pass.

**Commit:** `test(e2e): add smoke tests for issue types settings pages`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Write critical path test for creating an issue type through the UI

**Verifies:** hw-settings-e2e.AC3.3, hw-settings-e2e.AC3.6, hw-settings-e2e.AC3.7

**Files:**

- Create: `e2e/tests/issue-type-crud.spec.ts`

**Implementation:**

Create a critical path test file with tests for the issue type CRUD workflow and property management. This file will hold 3 tests, written across Tasks 4-6.

**Test 1: Create issue type through UI and verify via API.**

Follow the fixture pattern from `issue-types-switching.spec.ts`. The test:

1. Navigates to workspace issue types settings
2. Clicks "Add issue type" button (`data-test="issue-type-create-btn"`)
3. Fills the create form (name, description)
4. Submits the form
5. Verifies the new type appears in the list
6. Verifies via API that the type was persisted

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import {
  createIssueType,
  createPropertyDefinition,
  getWorkspaceIssueTypes,
  getPropertyDefinitions,
} from "../helpers/api";

test.describe("Issue Type CRUD", () => {
  test("create issue type through UI and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
  }) => {
    const page = authenticatedPage;
    const typeName = `E2E Type ${Date.now()}`;
    const typeDescription = "Created via E2E test";

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the list container to render
    await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

    // Click the "Add issue type" button
    const createBtn = page.locator("[data-test='issue-type-create-btn']");
    await createBtn.click();

    // Wait for the create/edit modal to appear
    const form = page.locator("[data-test='issue-type-form']");
    await expect(form).toBeVisible({ timeout: 5000 });

    // Fill in the form fields
    const nameInput = page.locator("[data-test='issue-type-name-input']");
    await nameInput.fill(typeName);

    const descriptionInput = page.locator("[data-test='issue-type-description-input']");
    await descriptionInput.fill(typeDescription);

    // Submit the form
    const submitBtn = page.locator("[data-test='issue-type-form-submit']");
    await submitBtn.click();

    // Wait for the modal to close and the type to appear in the list
    await expect(form).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-test='issue-type-item']").filter({ hasText: typeName })).toBeVisible({
      timeout: 5000,
    });

    // Verify via API that the type was persisted
    const issueTypes = await getWorkspaceIssueTypes(request, authToken, workspaceSlug);
    const createdType = issueTypes.find(
      (t: { name: string }) => t.name === typeName
    );
    expect(createdType).toBeTruthy();
    expect(createdType.description).toBe(typeDescription);
  });
```

**Note:** The test continues in the same file in Tasks 5 and 6. The `test.describe` block wraps all three tests.

**Verification:**

```bash
cd e2e && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Run this specific test:

```bash
./e2e/run-tests.sh --grep "create issue type through UI"
```

Expected: Test passes.

**Commit:** `test(e2e): add critical path test for creating issue type through UI`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Add critical path test for viewing and creating properties on an issue type

**Verifies:** hw-settings-e2e.AC3.4, hw-settings-e2e.AC3.6, hw-settings-e2e.AC3.7

**Files:**

- Modify: `e2e/tests/issue-type-crud.spec.ts` (add tests within the existing `test.describe` block)

**Implementation:**

Add two tests to the existing `test.describe("Issue Type CRUD")` block:

**Test 2: View properties on an issue type (setup via API, verify in UI).**

```typescript
test("view properties on an issue type via side panel", async ({
  authenticatedPage,
  request,
  authToken,
  workspaceSlug,
}) => {
  const page = authenticatedPage;

  // Create an issue type via API
  const issueType = await createIssueType(request, authToken, workspaceSlug, {
    name: "Type With Properties",
    description: "Has properties for E2E test",
    logo_props: { color: "#F59E0B" },
  });

  // Create a property definition associated with this issue type via API
  await createPropertyDefinition(request, authToken, workspaceSlug, {
    name: "Priority Level",
    property_type: "select",
    issue_type_id: issueType.id,
    options: ["Low", "Medium", "High"],
  });

  // Navigate to workspace issue types settings
  await page.goto(`/${workspaceSlug}/settings/issue-types`);

  // Wait for the list to render
  await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

  // Click the issue type to open side panel
  const typeItem = page.locator("[data-test='issue-type-item']").filter({ hasText: "Type With Properties" });
  await typeItem.click();

  // Verify the side panel opens
  const sidePanel = page.locator("[data-test='issue-type-side-panel']");
  await expect(sidePanel).toBeVisible({ timeout: 5000 });

  // Verify the property appears in the property list within the side panel
  const propertyList = sidePanel.locator("[data-test='property-list']");
  await expect(propertyList).toBeVisible({ timeout: 5000 });

  const propertyItem = propertyList.locator("[data-test='property-item']").filter({ hasText: "Priority Level" });
  await expect(propertyItem).toBeVisible();
});
```

**Test 3: Create a property definition through the UI and verify via API.**

```typescript
test("create property on issue type through UI and verify via API", async ({
  authenticatedPage,
  request,
  authToken,
  workspaceSlug,
}) => {
  const page = authenticatedPage;
  const propertyName = `E2E Property ${Date.now()}`;

  // Create an issue type via API
  const issueType = await createIssueType(request, authToken, workspaceSlug, {
    name: "Type For Property Creation",
    description: "E2E test will add properties here",
    logo_props: { color: "#8B5CF6" },
  });

  // Navigate to workspace issue types settings
  await page.goto(`/${workspaceSlug}/settings/issue-types`);

  // Wait for the list to render
  await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

  // Click the issue type to open side panel
  const typeItem = page.locator("[data-test='issue-type-item']").filter({ hasText: "Type For Property Creation" });
  await typeItem.click();

  // Wait for side panel
  const sidePanel = page.locator("[data-test='issue-type-side-panel']");
  await expect(sidePanel).toBeVisible({ timeout: 5000 });

  // Click "Add property" button
  const addPropertyBtn = sidePanel.locator("[data-test='property-add-btn']");
  await addPropertyBtn.click();

  // Wait for the property form to appear
  const propertyForm = page.locator("[data-test='property-form']");
  await expect(propertyForm).toBeVisible({ timeout: 5000 });

  // Fill in property name
  const propertyNameInput = page.locator("[data-test='property-name-input']");
  await propertyNameInput.fill(propertyName);

  // Select property type (text is the simplest)
  const propertyTypeSelect = page.locator("[data-test='property-type-select']");
  await propertyTypeSelect.click();
  // Wait for the dropdown to open, then select "text"
  await page
    .locator("[role='option']")
    .filter({ hasText: /^text$/i })
    .first()
    .click();

  // Submit the property form
  const propertySubmitBtn = page.locator("[data-test='property-form-submit']");
  await propertySubmitBtn.click();

  // Wait for the property to appear in the list
  await expect(propertyForm).not.toBeVisible({ timeout: 5000 });
  const propertyList = sidePanel.locator("[data-test='property-list']");
  await expect(propertyList.locator("[data-test='property-item']").filter({ hasText: propertyName })).toBeVisible({
    timeout: 5000,
  });

  // Verify via API that the property was persisted
  const definitions = await getPropertyDefinitions(request, authToken, workspaceSlug);
  const createdProperty = definitions.find((d: { name: string }) => d.name === propertyName);
  expect(createdProperty).toBeTruthy();
  expect(createdProperty.property_type).toBe("text");
  expect(createdProperty.issue_type_id).toBe(issueType.id);
});
```

Close the `test.describe` block:

```typescript
});
```

**Important notes on the property form interaction:**

- The property type selector might be a custom dropdown (not a native `<select>`). The test uses `[role='option']` to select from it, which is the same pattern used in `issue-types-switching.spec.ts` for the issue type dropdown.
- If the property type selector is a native `<select>`, replace the click-based selection with `propertyTypeSelect.selectOption('text')`.
- The task-implementor should verify which approach matches the actual implementation from Phase 3.

**Verification:**

```bash
cd e2e && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Run the CRUD tests:

```bash
./e2e/run-tests.sh --grep "Issue Type CRUD"
```

Expected: All 3 tests pass.

**Commit:** `test(e2e): add critical path tests for property viewing and creation`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Write critical path test for selecting issue type when creating an issue

**Verifies:** hw-settings-e2e.AC3.5, hw-settings-e2e.AC3.7

**Files:**

- Create: `e2e/tests/issue-type-selection.spec.ts`

**Implementation:**

Create a test that verifies an issue type can be selected when creating an issue, and the selection persists. This test exercises the end-to-end flow: create types via API → link to project → navigate to project issues → create issue with type → verify via API.

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssueType, linkIssueTypeToProject, getProjectStates, getIssue, API_BASE_URL } from "../helpers/api";

test.describe("Issue Type Selection", () => {
  test("select issue type when creating an issue and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Create issue types and link to project via API
    const issueType = await createIssueType(request, authToken, workspaceSlug, {
      name: "Selection Test Type",
      description: "Type for selection test",
      logo_props: { color: "#EF4444" },
    });

    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueType.id);

    // Get a project state for issue creation
    const states = await getProjectStates(request, authToken, workspaceSlug, projectId);
    const stateId = states[0]?.id;
    if (!stateId) throw new Error("No states found for project");

    // Navigate to project issues list
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues`);

    // Wait for the issues page to load
    await page.waitForLoadState("networkidle", { timeout: 10000 });

    // Open the create issue modal/form
    // The create button might be an "Add" button or a "+" button in the header
    const createIssueBtn = page
      .locator("[data-test='create-issue-btn']")
      .or(page.locator("button:has-text('Add issue')"))
      .or(page.locator("button:has-text('New issue')"))
      .first();
    await createIssueBtn.click();

    // Wait for the issue creation modal/form
    await page.waitForSelector("[role='dialog']", { timeout: 5000 }).catch(() => {
      // Some layouts use inline forms instead of modals
    });

    // Fill in the issue name
    const issueName = `Selection Test Issue ${Date.now()}`;
    const nameInput = page
      .locator("[data-test='issue-name-input']")
      .or(page.locator("input[placeholder*='Title'], input[name='name']"))
      .first();
    await nameInput.fill(issueName);

    // Find and click the issue type dropdown
    const typeDropdown = page
      .locator("[data-test='issue-type-dropdown']")
      .or(page.locator("button:has-text('Type')"))
      .first();
    await typeDropdown.click();

    // Wait for dropdown options
    await page.waitForSelector("[role='option']", { timeout: 5000 });

    // Select the linked issue type
    const typeOption = page.locator("[role='option']").filter({ hasText: "Selection Test Type" }).first();
    await typeOption.click();

    // Submit the issue (press Enter or click create/submit button)
    const submitBtn = page
      .locator("[data-test='create-issue-submit']")
      .or(page.locator("button:has-text('Create issue')"))
      .or(page.locator("button:has-text('Create Issue')"))
      .first();

    // Some create flows use Enter key instead of a submit button
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    if (submitVisible) {
      await submitBtn.click();
    } else {
      await nameInput.press("Enter");
    }

    // Wait for the issue to be created — use condition-based wait instead of arbitrary timeout.
    // Wait for the modal/form to close or a success indicator to appear.
    await page.waitForSelector("[role='dialog']", { state: "hidden", timeout: 10000 }).catch(() => {
      // Fallback: some create flows don't use a dialog
    });
    // Additional wait for the issue to appear in the list or a toast notification
    await page
      .locator("text=" + issueName)
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {
        // The issue might not be visible in the current view; proceed to API verification
      });

    // Verify via API that the issue was created with the correct type_id
    // We need to find the issue by name. The API returns all issues for the project.
    const issuesResponse = await request.get(
      `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
      {
        headers: {
          Cookie: `sessionid=${authToken}`,
        },
      }
    );

    if (!issuesResponse.ok()) {
      throw new Error(`Failed to fetch issues: ${issuesResponse.status()}`);
    }

    const issuesData = await issuesResponse.json();
    // The response may be an object with a `results` field or an array
    const issues = Array.isArray(issuesData) ? issuesData : issuesData.results;
    const createdIssue = issues?.find((i: { name: string }) => i.name === issueName);

    expect(createdIssue).toBeTruthy();
    expect(createdIssue.type_id).toBe(issueType.id);
  });
});
```

**Important notes:**

- The issue creation flow may differ from what's described here. The exact selectors depend on how the issue creation modal/inline form works in the HW build. The test uses fallback selectors (`or()`) to handle variations.
- The test uses condition-based waits (dialog closing, issue name appearing) instead of arbitrary timeouts. Adjust the selectors if the actual create flow differs.
- If the issue list response format differs (paginated vs flat array), adjust the parsing logic.
- The task-implementor should verify the exact issue creation UI flow by examining existing issue creation components and adapt the selectors accordingly.

**Verification:**

```bash
cd e2e && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Run the selection test:

```bash
./e2e/run-tests.sh --grep "Issue Type Selection"
```

Expected: Test passes.

**Commit:** `test(e2e): add critical path test for issue type selection during issue creation`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Run full E2E test suite and verify all tests pass

**Verifies:** hw-settings-e2e.AC3.7

**Files:**

- No file changes — verification only

**Implementation:**

Run the complete E2E test suite to verify all tests pass together. This catches any cross-test interference or fixture issues.

1. **Run all E2E tests:**

```bash
./e2e/run-tests.sh
```

Expected: All tests pass. This includes:

- `settings-pages-smoke.spec.ts` (3 tests)
- `issue-type-crud.spec.ts` (3 tests)
- `issue-type-selection.spec.ts` (1 test)
- `issue-types-switching.spec.ts` (2 tests — existing, kept)
- `issue-types-filtering.spec.ts` (2 tests — existing, kept)

2. **Verify no upstream package modifications:**

```bash
git diff --name-only -- packages/
```

Expected: No files in `packages/` modified.

3. **Verify deleted tests are gone:**

```bash
ls e2e/tests/issue-types-create.spec.ts e2e/tests/properties-management.spec.ts 2>&1
```

Expected: "No such file or directory" for both.

4. **If any tests fail:**

- Check the HTML report: `npx playwright show-report` (opens in browser)
- Review screenshots/videos for failed tests (saved automatically on failure)
- Fix the failing test(s) and re-run
- Common failure causes:
  - Selector doesn't match actual `data-test` attribute (check Phase 3/4 component code)
  - API endpoint returns different response format (check backend API docs)
  - Timing issue: increase timeout or add condition-based wait
  - Permission issue: ensure test user is workspace admin (fixture creates user as admin)

**Commit:** No commit — verification only.

<!-- END_TASK_7 -->
