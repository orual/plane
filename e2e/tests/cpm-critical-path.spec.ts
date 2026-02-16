/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createIssue, createIssueRelation } from "../helpers/api";

test.describe("CPM Critical Path", () => {
  test("AC7.1: Toggling CPM on shows critical path highlights", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Arrange: Create 3 issues forming a chain (A->B->C)
    const issueA = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue A",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    const issueB = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue B",
      start_date: "2025-01-04",
      target_date: "2025-01-06",
    });

    const issueC = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue C",
      start_date: "2025-01-07",
      target_date: "2025-01-09",
    });

    // Create blocking relations: A->B and B->C
    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueA.id, {
      relation_type: "blocking",
      related_list: [issueB.id],
    });

    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueB.id, {
      relation_type: "blocking",
      related_list: [issueC.id],
    });

    // Act: Navigate to gantt view
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/?type=gantt`);

    // Wait for gantt to render
    await page.waitForTimeout(2000);

    // Click CPM toggle to enable CPM
    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Assert: Critical path blocks are visible
    const criticalBlocks = page.locator('[data-test="cpm-critical-block"]');
    await expect(criticalBlocks.first()).toBeVisible({ timeout: 10000 });
  });

  test("AC7.2: Dependency chain correctly identifies critical tasks", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Arrange: Create main chain A->B->C and branch A->D (D is shorter, has slack)
    const issueA = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue A Critical",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    const issueB = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue B Critical",
      start_date: "2025-01-04",
      target_date: "2025-01-06",
    });

    const issueC = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue C Critical",
      start_date: "2025-01-07",
      target_date: "2025-01-09",
    });

    const issueD = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue D NonCritical",
      start_date: "2025-01-04",
      target_date: "2025-01-05",
    });

    // Create relations: A->B, B->C (critical path), and A->D (shorter branch with slack)
    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueA.id, {
      relation_type: "blocking",
      related_list: [issueB.id, issueD.id],
    });

    await createIssueRelation(request, authToken, workspaceSlug, projectId, issueB.id, {
      relation_type: "blocking",
      related_list: [issueC.id],
    });

    // Act: Navigate to gantt and enable CPM
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/?type=gantt`);
    await page.waitForTimeout(2000);

    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Assert: A, B, C have critical blocks
    const criticalBlockA = page.locator(`[data-test="cpm-critical-block"][data-test-issue-id="${issueA.id}"]`);
    const criticalBlockB = page.locator(`[data-test="cpm-critical-block"][data-test-issue-id="${issueB.id}"]`);
    const criticalBlockC = page.locator(`[data-test="cpm-critical-block"][data-test-issue-id="${issueC.id}"]`);

    await expect(criticalBlockA).toBeVisible({ timeout: 10000 });
    await expect(criticalBlockB).toBeVisible({ timeout: 10000 });
    await expect(criticalBlockC).toBeVisible({ timeout: 10000 });

    // Assert: D does NOT have a critical block (non-critical task with slack)
    const criticalBlockD = page.locator(`[data-test="cpm-critical-block"][data-test-issue-id="${issueD.id}"]`);
    await expect(criticalBlockD).not.toBeVisible();
  });
});
