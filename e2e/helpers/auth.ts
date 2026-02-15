// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Page, APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

// Matches Django's SESSION_COOKIE_NAME setting in plane/settings/common.py.
export const SESSION_COOKIE_NAME = "session-id";

// Must score >= 3 on zxcvbn (Plane's password strength requirement).
const TEST_PASSWORD = "E2eTestPass!word456";

const RATE_LIMIT_RETRIES = 8;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

/**
 * Retry a request function on HTTP 429 with exponential backoff + jitter.
 * Handles the API's rate limiter that triggers when parallel workers
 * all hit auth endpoints simultaneously.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") && attempt < RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 1000;
        console.log(
          `[auth] ${label}: rate limited (attempt ${attempt}/${RATE_LIMIT_RETRIES}), retrying in ${Math.round(delay)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[auth] ${label}: exhausted all ${RATE_LIMIT_RETRIES} retries.`);
}

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
 * 1. Stagger worker start to avoid thundering herd on the rate limiter.
 * 2. Sign up a fresh test user with email+password.
 * 3. Complete onboarding so the app doesn't block navigation.
 * 4. Return the session token for API calls.
 *
 * Instance initialization is handled by globalSetup.ts before workers start.
 * The page's browser context is authenticated after this call.
 */
export async function authenticateAndGetToken(page: Page, _request: APIRequestContext, email: string): Promise<string> {
  // Stagger worker starts by 0–3s to spread out API requests and avoid
  // tripping the rate limiter when running back-to-back.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 3000));

  const token = await withRateLimitRetry(() => signUpTestUser(page, email), "signUpTestUser");
  await withRateLimitRetry(() => completeOnboarding(page, "E2E Test User"), "completeOnboarding");
  return token;
}
