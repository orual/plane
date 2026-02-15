// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { test as base, Page } from "@playwright/test";
import { authenticateAndGetToken } from "../helpers/auth";
import { createWorkspace, createProject } from "../helpers/api";
import { randomUUID } from "crypto";

interface AuthSession {
  page: Page;
  token: string;
  email: string;
}

interface TestFixtures {
  _authSession: AuthSession;
  authenticatedPage: Page;
  authToken: string;
  testEmail: string;
  workspaceSlug: string;
  projectId: string;
}

export const test = base.extend<TestFixtures>({
  _authSession: async ({ page, request }, use) => {
    const email = `test-${randomUUID().substring(0, 8)}@plane.test`;
    const token = await authenticateAndGetToken(page, request, email);
    await use({ page, token, email });
    await page.close();
  },

  authenticatedPage: async ({ _authSession }, use) => {
    await use(_authSession.page);
  },

  authToken: async ({ _authSession }, use) => {
    await use(_authSession.token);
  },

  testEmail: async ({ _authSession }, use) => {
    await use(_authSession.email);
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
});

export { expect } from "@playwright/test";
