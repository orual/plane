// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { Page, APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

/**
 * Get a CSRF token from the API.
 */
export async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_BASE_URL}/auth/get-csrf-token/`);

  if (!response.ok()) {
    throw new Error(`Failed to get CSRF token: ${response.status()}`);
  }

  const data = await response.json();
  return data.csrf_token;
}

/**
 * Generate a magic link for passwordless authentication.
 */
export async function generateMagicLink(request: APIRequestContext, email: string): Promise<string> {
  const csrfToken = await getCsrfToken(request);
  const response = await request.post(`${API_BASE_URL}/auth/magic-generate/`, {
    headers: {
      "X-CSRFToken": csrfToken,
      "Content-Type": "application/json",
    },
    data: { email },
  });

  if (!response.ok()) {
    throw new Error(`Failed to generate magic link: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data.token || "";
}

/**
 * Login to Plane using magic link in the browser.
 * This simulates the user clicking the magic link and completing authentication.
 */
export async function loginWithMagicLink(page: Page, email: string, token: string) {
  // Navigate to the magic link callback with the token
  await page.goto(`${BASE_URL}/auth/sign-up?token=${token}&email=${email}`);

  // Wait for the auth to complete and redirect
  // The redirect target depends on whether workspaces exist
  await page.waitForURL((url) => {
    return (
      url.pathname === "/create-workspace" || // New user, no workspaces
      url.pathname.includes("/dashboard") || // User with existing workspace
      url.pathname === "/" // Root redirect
    );
  });
}

/**
 * Complete the login flow and extract the auth token from cookies.
 * This is used for API calls in test setup.
 */
export async function getAuthTokenFromCookies(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === "sessionid");
  if (!sessionCookie) {
    throw new Error("No sessionid cookie found after login");
  }
  return sessionCookie.value;
}

/**
 * Perform a complete login flow: generate magic link, login via browser, extract token.
 */
export async function authenticateAndGetToken(page: Page, request: APIRequestContext, email: string): Promise<string> {
  // Generate magic link token
  const token = await generateMagicLink(request, email);

  // Login via browser
  await loginWithMagicLink(page, email, token);

  // Extract session cookie
  const sessionToken = await getAuthTokenFromCookies(page);
  return sessionToken;
}
