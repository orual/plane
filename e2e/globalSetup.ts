// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { request } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
const TEST_PASSWORD = "E2eTestPass!word456";

/**
 * Global setup runs once before all test workers.
 *
 * It ensures the Plane instance is initialized and the API is warm,
 * preventing race conditions when parallel workers all try to set up
 * the instance simultaneously against a cold database.
 */
async function globalSetup(): Promise<void> {
  const requestContext = await request.newContext({ baseURL: API_BASE_URL });

  try {
    await waitForApi(requestContext);
    await waitForRateLimitCooldown(requestContext);
    await ensureInstanceSetup(requestContext);
  } finally {
    await requestContext.dispose();
  }
}

async function waitForApi(requestContext: Awaited<ReturnType<typeof request.newContext>>): Promise<void> {
  const maxAttempts = 30;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await requestContext.get(`${API_BASE_URL}/api/instances/`);
      if (response.ok()) return;
    } catch {
      // Connection refused — API not up yet.
    }
    if (attempt < maxAttempts) {
      console.log(`[globalSetup] API not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`[globalSetup] API at ${API_BASE_URL} not reachable after ${maxAttempts} attempts.`);
}

/**
 * Check if the API's anonymous rate limiter is active from a previous run.
 * If so, wait for it to cool down before starting workers.
 *
 * Probes `/api/instances/` because that is the first endpoint the frontend
 * fetches on page load — if it returns 429 the browser will show the
 * "Plane didn't start up correctly" error page.
 */
async function waitForRateLimitCooldown(requestContext: Awaited<ReturnType<typeof request.newContext>>): Promise<void> {
  const maxAttempts = 30;
  const delayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await requestContext.get(`${API_BASE_URL}/api/instances/`);
    if (response.status() !== 429) return;

    if (attempt < maxAttempts) {
      console.log(
        `[globalSetup] Rate limiter active (attempt ${attempt}/${maxAttempts}), waiting ${delayMs}ms for cooldown...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("[globalSetup] Rate limiter did not cool down after 60s. Try again shortly.");
}

async function ensureInstanceSetup(requestContext: Awaited<ReturnType<typeof request.newContext>>): Promise<void> {
  const response = await requestContext.get(`${API_BASE_URL}/api/instances/`);
  if (!response.ok()) {
    throw new Error(`[globalSetup] Instance API returned ${response.status()}.`);
  }

  const data = await response.json();
  if (data.instance?.is_setup_done) {
    console.log("[globalSetup] Instance already set up.");
    return;
  }

  console.log("[globalSetup] Instance not set up — creating first admin...");

  const csrfResponse = await requestContext.get(`${API_BASE_URL}/auth/get-csrf-token/`);
  if (!csrfResponse.ok()) {
    throw new Error(`[globalSetup] Failed to get CSRF token: ${csrfResponse.status()}`);
  }
  const csrfData = await csrfResponse.json();
  const csrfToken = csrfData.csrf_token;

  const setupResponse = await requestContext.post(`${API_BASE_URL}/api/instances/admins/sign-up/`, {
    form: {
      first_name: "E2E",
      last_name: "Admin",
      email: "e2e-admin@plane.test",
      company_name: "E2E Testing",
      password: TEST_PASSWORD,
      confirm_password: TEST_PASSWORD,
      is_telemetry_enabled: "False",
      csrfmiddlewaretoken: csrfToken,
    },
  });

  const finalUrl = setupResponse.url();
  if (finalUrl.includes("error_code")) {
    const url = new URL(finalUrl);
    const errorCode = url.searchParams.get("error_code");
    if (errorCode !== "5150") {
      const errorMessage = url.searchParams.get("error_message") || "unknown";
      throw new Error(`[globalSetup] Instance setup failed: ${errorMessage} (code ${errorCode})`);
    }
  }

  // Verify the instance is now set up before letting workers start.
  const verifyResponse = await requestContext.get(`${API_BASE_URL}/api/instances/`);
  const verifyData = await verifyResponse.json();
  if (!verifyData.instance?.is_setup_done) {
    throw new Error("[globalSetup] Instance setup completed but is_setup_done is still false.");
  }

  console.log("[globalSetup] Instance setup complete.");
}

export default globalSetup;
