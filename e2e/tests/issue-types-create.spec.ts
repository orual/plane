/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";

test.describe("Issue Type Creation", () => {
  test("user can create a new issue type from workspace settings", async ({ authenticatedPage, workspaceSlug }) => {
    const page = authenticatedPage;

    // Navigate to workspace settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the page to load
    await page.waitForSelector("button:has-text('Add issue type')", { timeout: 10000 });

    // Click the "Add" button (adjust selector based on actual UI)
    const addButton = page.locator("button:has-text('Add'), button:has-text('Create'), button:has-text('New')").first();
    await addButton.click();

    // Fill in the form
    await page.fill('input[name="name"]', "Integration");
    await page.fill('input[name="description"]', "Integration engineering work items");

    // Select a color
    const colorButton = page.locator("button:has-text('Color'), div[role='button']").first();
    await colorButton.click();
    await page.locator('button[data-color="#7C3AED"]').click();

    // Submit the form
    const submitButton = page.locator("button:has-text('Create'), button:has-text('Save')").first();
    await submitButton.click();

    // Wait for the issue type to appear in the list
    await page.waitForSelector("text=Integration", { timeout: 5000 });

    // Verify the issue type is visible
    const issueTypeRow = page.locator("text=Integration");
    await expect(issueTypeRow).toBeVisible();
  });

  test("user cannot create an issue type without a name", async ({ authenticatedPage, workspaceSlug }) => {
    const page = authenticatedPage;

    // Navigate to workspace settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Click the "Add" button
    const addButton = page.locator("button:has-text('Add'), button:has-text('Create'), button:has-text('New')").first();
    await addButton.click();

    // Leave name empty and try to submit
    const submitButton = page.locator("button:has-text('Create'), button:has-text('Save')").first();

    // Check if submit is disabled
    const isDisabled = await submitButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test("issue type creation shows validation feedback", async ({ authenticatedPage, workspaceSlug }) => {
    const page = authenticatedPage;

    // Navigate to workspace settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Click the "Add" button
    const addButton = page.locator("button:has-text('Add'), button:has-text('Create'), button:has-text('New')").first();
    await addButton.click();

    // Try to submit with empty name
    const nameInput = page.locator('input[name="name"]');
    await nameInput.focus();
    await nameInput.blur(); // Trigger blur to show validation

    // Check for validation message
    const errorMessage = page.locator("text=Name is required, text=This field is required").first();
    await expect(errorMessage).toBeVisible();
  });
});
