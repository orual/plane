// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { test as base, Page } from "@playwright/test";
import { authenticateAndGetToken } from "../helpers/auth";
import { createWorkspace, createProject } from "../helpers/api";
import { randomUUID } from "crypto";

interface WorkerAuth {
  token: string;
  email: string;
  storageState: {
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Lax" | "None" | "Strict";
      expires: number;
    }>;
    origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
  };
}

interface WorkerFixtures {
  _workerAuth: WorkerAuth;
}

interface TestFixtures {
  authenticatedPage: Page;
  authToken: string;
  testEmail: string;
  workspaceSlug: string;
  projectId: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Worker-scoped: authenticate once per worker to avoid hitting the API's
  // 30/minute anonymous rate limit with per-test sign-ups.
  _workerAuth: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const email = `test-${randomUUID().substring(0, 8)}@plane.test`;
      const token = await authenticateAndGetToken(page, page.request, email);

      const state = await context.storageState();

      await page.close();
      await context.close();

      await use({ token, email, storageState: state });
    },
    { scope: "worker" },
  ],

  // Test-scoped: each test gets a fresh page with the worker's session cookie.
  authenticatedPage: async ({ browser, _workerAuth }, use) => {
    const context = await browser.newContext({ storageState: _workerAuth.storageState });
    const page = await context.newPage();
    await use(page);
    await page.close();
    await context.close();
  },

  authToken: async ({ _workerAuth }, use) => {
    await use(_workerAuth.token);
  },

  testEmail: async ({ _workerAuth }, use) => {
    await use(_workerAuth.email);
  },

  workspaceSlug: async ({ request, authToken }, use) => {
    const slugId = randomUUID().substring(0, 8);
    const workspace = await createWorkspace(request, authToken, {
      name: `Test Workspace ${slugId}`,
      slug: `test-ws-${slugId}`,
    });

    await use(workspace.slug);
  },

  projectId: async ({ request, authToken, workspaceSlug }, use) => {
    const projectNum = Math.floor(Math.random() * 10000);
    const project = await createProject(request, authToken, workspaceSlug, {
      name: `Test Project ${projectNum}`,
      identifier: `TP${projectNum.toString().slice(0, 3).toUpperCase()}`,
    });

    await use(project.id);
  },
});

export { expect } from "@playwright/test";
