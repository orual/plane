/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssueType, linkIssueTypeToProject, getProjectStates, API_BASE_URL } from "../helpers/api";

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
