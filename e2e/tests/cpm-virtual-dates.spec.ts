/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssue, createIssueRelation, getIssue } from "../helpers/api";

test.describe("CPM Virtual Dates", () => {
  test("AC7.3: Dateless task appears at computed position when CPM is enabled", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Arrange: Create issue A with dates, issue B without dates, with blocking relation A->B
    const issueA = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue A with dates",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    const issueB = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue B dateless",
      // No dates provided
    });

    // Create blocking relation: A->B
    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueA.id, {
      relation_type: "blocking",
      related_list: [issueB.id],
    });

    // Act: Navigate to gantt and enable CPM
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/?type=gantt`);

    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Assert: Computed-date block for issue B is visible
    const computedBlock = page.locator(`[data-test="cpm-computed-block"][data-test-issue-id="${issueB.id}"]`);
    await expect(computedBlock).toBeVisible({ timeout: 10000 });
  });

  test("AC7.4: Dragging a computed-date block converts to manual dates", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Arrange: Same setup as AC7.3
    const issueA = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue A for drag",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    const issueB = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue B for drag",
      // No dates
    });

    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueA.id, {
      relation_type: "blocking",
      related_list: [issueB.id],
    });

    // Act: Navigate to gantt and enable CPM
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/?type=gantt`);

    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Locate the computed block for issue B
    const computedBlock = page.locator(`[data-test="cpm-computed-block"][data-test-issue-id="${issueB.id}"]`);
    await expect(computedBlock).toBeVisible({ timeout: 10000 });

    // Get the block's position to perform drag
    const boundingBox = await computedBlock.boundingBox();
    if (!boundingBox) {
      throw new Error("Could not get bounding box for computed block");
    }

    // Perform drag operation: move the block 100 pixels to the right
    const startX = boundingBox.x + boundingBox.width / 2;
    const startY = boundingBox.y + boundingBox.height / 2;
    const endX = startX + 100;
    const endY = startY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(endX, endY);
    await page.waitForTimeout(100);
    await page.mouse.up();

    // Wait for the drag animation and date persistence
    await page.waitForTimeout(2000);

    // Assert: Fetch issue B and verify it now has manual dates
    const updatedIssue = await getIssue(request, authToken, workspaceSlug, projectId, issueB.id);
    expect(updatedIssue.start_date).toBeTruthy();
    expect(updatedIssue.target_date).toBeTruthy();

    // Assert: Toggle CPM off and verify the block for B is still visible (now with manual dates)
    await cpmToggle.click();
    await page.waitForTimeout(1000);

    // The block should still be visible because it now has manual dates
    const manualBlock = page.locator(`#issue-${issueB.id}`);
    await expect(manualBlock).toBeVisible({ timeout: 5000 });
  });
});
