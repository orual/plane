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
