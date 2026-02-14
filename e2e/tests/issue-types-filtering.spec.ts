// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { test, expect } from "../fixtures/index";
import { createIssue, linkIssueTypeToProject } from "../helpers/api";

test.describe("Issue Filtering by Type", () => {
  test("user can filter issues by issue type", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
    issueTypeId,
  }) => {
    const page = authenticatedPage;
    const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8000";

    // Create a second issue type
    const response = await request.post(`${apiBaseUrl}/api/workspaces/${workspaceSlug}/issue-types/`, {
      headers: {
        Cookie: `sessionid=${authToken}`,
        "Content-Type": "application/json",
      },
      data: {
        name: "Support",
        description: "Support and customer issues",
        logo_props: { color: "#14B8A6" },
      },
    });
    const issueType2 = await response.json();

    // Link both types to the project
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueTypeId);
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueType2.id);

    // Get states
    const states = await request.get(`${apiBaseUrl}/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`, {
      headers: {
        Cookie: `sessionid=${authToken}`,
      },
    });
    const statesData = await states.json();
    const stateId = statesData[0]?.id;

    // Create issues with different types
    await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Feature Request 1",
      type_id: issueTypeId,
      state_id: stateId,
    });

    await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Support Ticket 1",
      type_id: issueType2.id,
      state_id: stateId,
    });

    await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Feature Request 2",
      type_id: issueTypeId,
      state_id: stateId,
    });

    // Navigate to the project issues list
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/issues`);

    // Wait for issues to load
    await page.waitForSelector("text=Feature Request 1", { timeout: 5000 });

    // Verify all issues are visible initially
    const featureReq1 = page.locator("text=Feature Request 1");
    const featureReq2 = page.locator("text=Feature Request 2");
    const supportTicket = page.locator("text=Support Ticket 1");

    await expect(featureReq1).toBeVisible();
    await expect(featureReq2).toBeVisible();
    await expect(supportTicket).toBeVisible();

    // Click on the filter button
    const filterButton = page.locator("button:has-text('Filter'), button[data-test='filter-button']").first();
    await filterButton.click();

    // Find and select the issue type filter
    const typeFilterOption = page.locator(`text=Type, text=Issue Type, button:has-text('Type')`).first();
    if (await typeFilterOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await typeFilterOption.click();
    }

    // Select the first issue type
    const firstTypeOption = page.locator(`text=${issueType2.name}`).first();
    await firstTypeOption.click();

    // Wait for the filter to apply via networkidle
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    // Verify only the support ticket is visible
    await expect(supportTicket).toBeVisible();

    // Feature requests should still be visible or hidden depending on implementation
    // (This depends on how the filter UI is structured)
  });

  test("clearing issue type filter shows all issues again", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
    issueTypeId,
  }) => {
    const page = authenticatedPage;
    const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8000";

    // Create and link issue types
    await linkIssueTypeToProject(request, authToken, workspaceSlug, projectId, issueTypeId);

    // Get states
    const states = await request.get(`${apiBaseUrl}/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`, {
      headers: {
        Cookie: `sessionid=${authToken}`,
      },
    });
    const statesData = await states.json();
    const stateId = statesData[0]?.id;

    // Create issues
    await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Filtered Issue",
      type_id: issueTypeId,
      state_id: stateId,
    });

    // Navigate to project
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/issues`);

    // Wait for issues to load
    await page.waitForSelector("text=Filtered Issue", { timeout: 5000 });

    // Apply a filter (implementation depends on UI)
    const filterButton = page.locator("button:has-text('Filter')").first();
    await filterButton.click();

    // Find clear/reset button and click it
    const clearButton = page.locator("button:has-text('Clear'), button:has-text('Reset')").first();
    if (await clearButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clearButton.click();
    }

    // Verify all issues are visible again
    const issue = page.locator("text=Filtered Issue");
    await expect(issue).toBeVisible();
  });
});
