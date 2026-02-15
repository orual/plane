// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Page, APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

// Matches Django's SESSION_COOKIE_NAME setting in plane/settings/common.py.
export const SESSION_COOKIE_NAME = "session-id";

// Must score >= 3 on zxcvbn (Plane's password strength requirement).
const TEST_PASSWORD = "E2eTestPass!word456";

/**
 * Get a CSRF token from the API.
 * The response also sets a `csrftoken` cookie on the request context,
 * which Django's CSRF middleware requires on subsequent POST requests.
 */
async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_BASE_URL}/auth/get-csrf-token/`);
  if (!response.ok()) {
    throw new Error(`Failed to get CSRF token: ${response.status()}`);
  }
  const data = await response.json();
  return data.csrf_token;
}

/**
 * Ensure the Plane instance is initialized.
 * If the instance exists but first-user setup hasn't been completed,
 * create the initial admin via the god-mode sign-up endpoint.
 *
 * Prerequisite: the API server must be running and `register_instance`
 * management command must have been executed (this happens automatically
 * on first `manage.py migrate`).
 */
async function ensureInstanceSetup(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${API_BASE_URL}/api/instances/`);
  if (!response.ok()) {
    throw new Error(
      `Cannot reach instance API (${response.status()}). ` +
        "Ensure the API server is running and 'python manage.py register_instance' has been executed."
    );
  }

  const data = await response.json();
  if (data.instance?.is_setup_done) return;

  const csrfToken = await getCsrfToken(request);
  const setupResponse = await request.post(`${API_BASE_URL}/api/instances/admins/sign-up/`, {
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
    // 5150 = ADMIN_ALREADY_EXIST — instance was already set up, harmless.
    if (errorCode !== "5150") {
      const errorMessage = url.searchParams.get("error_message") || "unknown";
      throw new Error(`Instance setup failed: ${errorMessage} (code ${errorCode})`);
    }
  }
}

/**
 * Create a test user via email+password sign-up and authenticate the page.
 *
 * Uses `page.request` (not the standalone `request` fixture) so the
 * session cookie from the sign-up response is shared with the browser
 * context — subsequent `page.goto()` calls are authenticated.
 */
async function signUpTestUser(page: Page, email: string): Promise<string> {
  const csrfToken = await getCsrfToken(page.request);

  const response = await page.request.post(`${API_BASE_URL}/auth/sign-up/`, {
    form: {
      email,
      password: TEST_PASSWORD,
      csrfmiddlewaretoken: csrfToken,
    },
  });

  const finalUrl = response.url();
  if (finalUrl.includes("error_code")) {
    const url = new URL(finalUrl);
    const errorCode = url.searchParams.get("error_code");
    const errorMessage = url.searchParams.get("error_message") || "unknown";
    throw new Error(`Sign-up failed for ${email}: ${errorMessage} (code ${errorCode})`);
  }

  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error("No session cookie found after sign-up");
  }
  return sessionCookie.value;
}

/**
 * Complete the user's profile and mark onboarding as done so
 * the app doesn't redirect to the onboarding wizard.
 *
 * Uses `page.request` so the existing session cookie is sent.
 */
async function completeOnboarding(page: Page, name: string): Promise<void> {
  const profileResponse = await page.request.patch(`${API_BASE_URL}/api/users/me/`, {
    headers: { "Content-Type": "application/json" },
    data: { first_name: name },
  });
  if (!profileResponse.ok()) {
    throw new Error(`Failed to update profile: ${profileResponse.status()} ${await profileResponse.text()}`);
  }

  const onboardResponse = await page.request.patch(`${API_BASE_URL}/api/users/me/onboard/`, {
    headers: { "Content-Type": "application/json" },
    data: { is_onboarded: true },
  });
  if (!onboardResponse.ok()) {
    throw new Error(`Failed to complete onboarding: ${onboardResponse.status()} ${await onboardResponse.text()}`);
  }
}

/**
 * Full authentication flow for E2E tests:
 * 1. Ensure the Plane instance is initialized (idempotent).
 * 2. Sign up a fresh test user with email+password.
 * 3. Complete onboarding so the app doesn't block navigation.
 * 4. Return the session token for API calls.
 *
 * The page's browser context is authenticated after this call.
 */
export async function authenticateAndGetToken(page: Page, request: APIRequestContext, email: string): Promise<string> {
  await ensureInstanceSetup(request);
  const token = await signUpTestUser(page, email);
  await completeOnboarding(page, "E2E Test User");
  return token;
}
