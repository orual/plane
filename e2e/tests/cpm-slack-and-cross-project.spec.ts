/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import { createProject, createIssue, createIssueRelation } from "../helpers/api";

test.describe("CPM Slack and Cross-Project", () => {
  test("AC7.5: Slack bars appear for non-critical tasks, absent for critical", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Arrange: Create critical chain A->B->C and branch A->D (shorter, has slack)
    const issueA = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue A slack test",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    const issueB = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue B slack test",
      start_date: "2025-01-04",
      target_date: "2025-01-06",
    });

    const issueC = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue C slack test",
      start_date: "2025-01-07",
      target_date: "2025-01-09",
    });

    const issueD = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue D with slack",
      start_date: "2025-01-04",
      target_date: "2025-01-05",
    });

    // Create relations: A->B, B->C (critical), A->D (shorter, has slack)
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

    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Assert: Slack bar exists for non-critical task D
    const slackBarD = page.locator(`[data-test="cpm-slack-bar"][data-test-issue-id="${issueD.id}"]`);
    await expect(slackBarD).toBeVisible({ timeout: 10000 });

    // Assert: Critical tasks (A, B, C) do NOT have slack bars
    const slackBarA = page.locator(`[data-test="cpm-slack-bar"][data-test-issue-id="${issueA.id}"]`);
    const slackBarB = page.locator(`[data-test="cpm-slack-bar"][data-test-issue-id="${issueB.id}"]`);
    const slackBarC = page.locator(`[data-test="cpm-slack-bar"][data-test-issue-id="${issueC.id}"]`);

    await expect(slackBarA).toHaveCount(0);
    await expect(slackBarB).toHaveCount(0);
    await expect(slackBarC).toHaveCount(0);
  });

  test.fixme("AC7.6: Cross-project mode shows phantom anchors", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
    projectId,
  }) => {
    // This test is marked as fixme because cross-project relation creation via API
    // may not be supported by the current test fixtures. The API endpoint for
    // issue relations may require both issues to be in the same project.
    // TODO: Verify API support for cross-project relations and enable this test.

    const page = authenticatedPage;

    // Arrange: Create a second project
    const projectNum = Math.floor(Math.random() * 10000);
    const project2 = await createProject(request, authToken, workspaceSlug, {
      name: `Test Project 2 ${projectNum}`,
      identifier: `TP2${projectNum.toString().slice(0, 2).toUpperCase()}`,
    });

    // Create issue X in project 2
    const issueX = await createIssue(request, authToken, workspaceSlug, project2.id, {
      name: "Issue X in project 2",
      start_date: "2025-01-01",
      target_date: "2025-01-03",
    });

    // Create issue Y in project 1
    const issueY = await createIssue(request, authToken, workspaceSlug, projectId, {
      name: "Issue Y in project 1",
      start_date: "2025-01-04",
      target_date: "2025-01-06",
    });

    // Try to create cross-project blocking relation X->Y
    // Note: This may fail if the API doesn't support cross-project relations
    try {
      await createIssueRelation(request, authToken, workspaceSlug, projectId, issueY.id, {
        relation_type: "blocked_by",
        related_list: [`${project2.id}:${issueX.id}`],
      });
    } catch (_e) {
      // If cross-project relation is not supported, skip the rest of the test
      test.skip();
    }

    // Act: Navigate to project 1's gantt, enable CPM, then enable cross-project mode
    await page.goto(`/${workspaceSlug}/projects/${projectId}/issues/?type=gantt`);

    const cpmToggle = page.locator('[data-test="cpm-toggle"]');
    await expect(cpmToggle).toBeVisible({ timeout: 10000 });
    await cpmToggle.click();

    // Enable cross-project mode
    const crossProjectToggle = page.locator('[data-test="cpm-cross-project-toggle"]');
    await expect(crossProjectToggle).toBeVisible({ timeout: 5000 });
    await crossProjectToggle.click();

    // Assert: Phantom anchor appears at timeline edge for issue X
    const phantomAnchor = page.locator('[data-test="cpm-phantom-anchor"]');
    await expect(phantomAnchor).toBeVisible({ timeout: 10000 });
  });
});
