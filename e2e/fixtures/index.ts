// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { test as base, Page, APIRequestContext } from "@playwright/test";
import { authenticateAndGetToken, getCsrfToken } from "../helpers/auth";
import {
  createWorkspace,
  createProject,
  createIssueType,
  linkIssueTypeToProject,
  getProjectStates,
} from "../helpers/api";
import { randomUUID } from "crypto";

interface TestFixtures {
  authenticatedPage: Page;
  authToken: string;
  testEmail: string;
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  stateId: string;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page, request }, use) => {
    const testEmail = `test-${randomUUID().substring(0, 8)}@plane.test`;

    try {
      // Authenticate the page
      await authenticateAndGetToken(page, request, testEmail);
      await use(page);
    } finally {
      await page.close();
    }
  },

  authToken: async ({ page, request }, use) => {
    const testEmail = `test-${randomUUID().substring(0, 8)}@plane.test`;
    const token = await authenticateAndGetToken(page, request, testEmail);
    await use(token);
    await page.close();
  },

  testEmail: async ({}, use) => {
    const email = `test-${randomUUID().substring(0, 8)}@plane.test`;
    await use(email);
  },

  workspaceSlug: async ({ request, authToken }, use) => {
    // Create a workspace for this test
    const slugId = randomUUID().substring(0, 8);
    const workspace = await createWorkspace(request, authToken, {
      name: `Test Workspace ${slugId}`,
      slug: `test-ws-${slugId}`,
    });

    await use(workspace.slug);
  },

  projectId: async ({ request, authToken, workspaceSlug }, use) => {
    // Create a project in the workspace
    const projectNum = Math.floor(Math.random() * 10000);
    const project = await createProject(request, authToken, workspaceSlug, {
      name: `Test Project ${projectNum}`,
      identifier: `TP${projectNum.toString().slice(0, 3).toUpperCase()}`,
    });

    await use(project.id);
  },

  issueTypeId: async ({ request, authToken, workspaceSlug }, use) => {
    // Create an issue type in the workspace
    const issueType = await createIssueType(request, authToken, workspaceSlug, {
      name: `Test Issue Type ${Math.random().toString(36).substring(7)}`,
      description: "Test issue type for E2E tests",
      logo_props: { color: "#3B82F6" },
    });

    // Link the issue type to the project (get first project)
    // For now, we'll just return the ID without linking
    await use(issueType.id);
  },

  stateId: async ({ request, authToken, workspaceSlug, projectId }, use) => {
    // Get the first available state (usually "Backlog")
    const states = await getProjectStates(request, authToken, workspaceSlug, projectId);
    const state = states[0];

    if (!state) {
      throw new Error("No states found for project");
    }

    await use(state.id);
  },
});

export { expect } from "@playwright/test";
