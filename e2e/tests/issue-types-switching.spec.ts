/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssue, createIssueType, linkIssueTypeToProject, getProjectStates } from "../helpers/api";

test.describe("Issue Type Switching", () => {
  test("user can switch issue type of an existing issue", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
    issueTypeId,
  }) => {
    const page = authenticatedPage;

    // Create another issue type
    const issueType2 = await createIssueType(request, authToken, workspaceSlug, {
      name: "DevOps",
      description: "DevOps and infrastructure work",
      logo_props: { color: "#8B5CF6" },
    });

    // Link both issue types to the project
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueTypeId);
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueType2.id);

    // Create an issue with the first issue type
    const states = await getProjectStates(request, authToken, workspaceSlug, projectId);
    const stateId = states[0]?.id;

    const issue = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Switch Type Test Issue",
      type_id: issueTypeId,
      state_id: stateId,
    });

    // Navigate to the issue detail page
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`);

    // Wait for the issue detail to load
    await page.waitForSelector("text=Switch Type Test Issue", { timeout: 5000 });

    // Find and click the issue type dropdown
    const typeDropdown = page
      .locator("[data-test='issue-type-dropdown']")
      .or(page.locator("button:has-text('Type'), div:has-text('Type')"))
      .first();

    await typeDropdown.click();

    // Wait for dropdown menu
    await page.waitForSelector("[role='option']", { timeout: 5000 });

    // Select the second issue type
    const issueType2Option = page.locator(`text=${issueType2.name}`).first();
    await issueType2Option.click();

    // Wait for the change to be reflected via expected selector
    await expect(page.locator(`text=${issueType2.name}`).first()).toBeVisible();

    // Verify the new type is selected
    const updatedTypeDisplay = page.locator(`text=${issueType2.name}`).first();
    await expect(updatedTypeDisplay).toBeVisible();
  });

  test("issue type dropdown only shows linked types", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
    issueTypeId,
  }) => {
    const page = authenticatedPage;

    // Create two issue types
    const issueType1 = await createIssueType(request, authToken, workspaceSlug, {
      name: "Frontend",
      description: "Frontend development",
      logo_props: { color: "#EC4899" },
    });

    const issueType2 = await createIssueType(request, authToken, workspaceSlug, {
      name: "Backend",
      description: "Backend development",
      logo_props: { color: "#06B6D4" },
    });

    // Link only the first issue type to the project
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueType1.id);

    // Get a state
    const states = await getProjectStates(request, authToken, workspaceSlug, projectId);
    const stateId = states[0]?.id;

    // Create an issue
    const issue = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Type Filter Test",
      type_id: issueType1.id,
      state_id: stateId,
    });

    // Navigate to the issue detail
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/${issue.id}`);

    await page.waitForSelector("text=Type Filter Test", { timeout: 5000 });

    // Open the type dropdown
    const typeDropdown = page
      .locator("[data-test='issue-type-dropdown']")
      .or(page.locator("button:has-text('Type')"))
      .first();

    await typeDropdown.click();
    await page.waitForSelector("[role='option']", { timeout: 5000 });

    // Verify the linked type is visible
    const linkedType = page.locator(`text=${issueType1.name}`).first();
    await expect(linkedType).toBeVisible();

    // Verify the unlinked type is NOT visible
    const unlinkedType = page.locator(`text=${issueType2.name}`);
    await expect(unlinkedType).not.toBeVisible();
  });
});
