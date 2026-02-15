/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { API_BASE_URL } from "../helpers/api";

test.describe("Project Issue Types Toggle", () => {
  test("toggle issue type on for a project and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Navigate to the project issue types settings page
    await page.goto(`/${workspaceSlug}/settings/projects/${projectId}/issue-types`);

    // Wait for the list container to render
    await expect(page.locator("[data-test='project-issue-type-list']")).toBeVisible({ timeout: 10000 });

    // All items should be present
    const items = page.locator("[data-test='project-issue-type-item']");
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    // Get the first item's toggle and verify it starts as OFF
    const firstToggle = items.first().locator("[data-test='project-issue-type-toggle'] button[role='switch']");
    await expect(firstToggle).toHaveAttribute("aria-checked", "false");

    // Get the issue type name for API verification
    const typeName = await items.first().locator("p").first().textContent();
    expect(typeName).toBeTruthy();

    // Click the toggle to enable the issue type
    await firstToggle.click();

    // Verify the toggle state changed to ON
    await expect(firstToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });

    // Verify via API that the issue type is now linked to the project
    const response = await request.get(
      `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`,
      {
        headers: {
          Cookie: `session-id=${authToken}`,
        },
      }
    );
    expect(response.ok()).toBeTruthy();

    const linkedTypes = await response.json();
    const data = Array.isArray(linkedTypes) ? linkedTypes : (linkedTypes.results ?? []);
    expect(data.length).toBeGreaterThan(0);
  });

  test("toggle issue type off for a project and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Navigate to the project issue types settings page
    await page.goto(`/${workspaceSlug}/settings/projects/${projectId}/issue-types`);

    // Wait for the list container to render
    await expect(page.locator("[data-test='project-issue-type-list']")).toBeVisible({ timeout: 10000 });

    const items = page.locator("[data-test='project-issue-type-item']");
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    const firstToggle = items.first().locator("[data-test='project-issue-type-toggle'] button[role='switch']");

    // Capture the type name before any toggling.
    const typeName = await items.first().locator("p").first().textContent();
    expect(typeName).toBeTruthy();

    // If the toggle is currently OFF, turn it ON first so we can test turning it OFF.
    const currentState = await firstToggle.getAttribute("aria-checked");
    if (currentState === "false") {
      await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes(`/projects/${projectId}/issue-types`) && resp.request().method() === "POST"
        ),
        firstToggle.click(),
      ]);
      await expect(firstToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    }

    // Toggle it OFF and wait for the DELETE to complete.
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes(`/projects/${projectId}/issue-types`) && resp.request().method() === "DELETE"
      ),
      firstToggle.click(),
    ]);

    // Verify the toggle state changed to OFF
    await expect(firstToggle).toHaveAttribute("aria-checked", "false", { timeout: 5000 });

    // Verify via API that the issue type is no longer linked
    const response = await request.get(
      `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`,
      {
        headers: {
          Cookie: `session-id=${authToken}`,
        },
      }
    );
    expect(response.ok()).toBeTruthy();

    const linkedTypes = await response.json();
    const data = Array.isArray(linkedTypes) ? linkedTypes : (linkedTypes.results ?? []);

    const stillLinked = data.find(
      (t: { issue_type_detail?: { name: string } }) => t.issue_type_detail?.name === typeName
    );
    expect(stillLinked).toBeFalsy();
  });

  test("toggle state persists after page reload", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;
    const settingsUrl = `/${workspaceSlug}/settings/projects/${projectId}/issue-types`;

    // Navigate to the project issue types settings page
    await page.goto(settingsUrl);
    await expect(page.locator("[data-test='project-issue-type-list']")).toBeVisible({ timeout: 10000 });

    const items = page.locator("[data-test='project-issue-type-item']");
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    const firstToggle = items.first().locator("[data-test='project-issue-type-toggle'] button[role='switch']");

    // Ensure the toggle is ON
    const currentState = await firstToggle.getAttribute("aria-checked");
    if (currentState === "false") {
      await firstToggle.click();
      await expect(firstToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    }

    // Reload the page
    await page.goto(settingsUrl);
    await expect(page.locator("[data-test='project-issue-type-list']")).toBeVisible({ timeout: 10000 });
    await expect(items.first()).toBeVisible({ timeout: 5000 });

    // Verify the toggle is still ON after reload
    const reloadedToggle = items.first().locator("[data-test='project-issue-type-toggle'] button[role='switch']");
    await expect(reloadedToggle).toHaveAttribute("aria-checked", "true", { timeout: 5000 });

    // Clean up: toggle it back off
    await reloadedToggle.click();
    await expect(reloadedToggle).toHaveAttribute("aria-checked", "false", { timeout: 5000 });
  });
});
