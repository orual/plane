// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import type { Page } from "@playwright/test";

/**
 * Wait for the page to be fully loaded (network idle).
 */
export async function waitForPageLoad(page: Page, timeout = 5000) {
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch {
    // Network idle might not happen, that's okay
  }
}

/**
 * Wait for a modal/dialog to open.
 */
export async function waitForModalOpen(page: Page, timeout = 5000) {
  await page.waitForSelector("[role='dialog'], .modal", { timeout });
}

/**
 * Wait for a modal/dialog to close.
 */
export async function waitForModalClose(page: Page, timeout = 5000) {
  await page.waitForSelector("[role='dialog'], .modal", { state: "hidden", timeout });
}

/**
 * Wait for an element to be clickable.
 */
export async function waitForClickable(page: Page, selector: string, timeout = 5000) {
  const element = page.locator(selector);
  await element.waitFor({ state: "visible", timeout });
  return element;
}

/**
 * Wait for loading spinner to disappear.
 */
export async function waitForLoadingComplete(page: Page, timeout = 10000) {
  try {
    await page.waitForSelector(".spinner, [role='status']", { state: "hidden", timeout });
  } catch {
    // Spinner might not exist
  }
}

/**
 * Wait for the page URL to contain a specific path.
 */
export async function waitForUrlPattern(page: Page, pattern: RegExp | string, timeout = 5000) {
  if (typeof pattern === "string") {
    await page.waitForURL((url) => url.href.includes(pattern), { timeout });
  } else {
    await page.waitForURL(pattern, { timeout });
  }
}

/**
 * Wait for an element to have a specific text.
 */
export async function waitForElementWithText(page: Page, selector: string, text: string, timeout = 5000) {
  const element = page.locator(selector);
  await element.waitFor({ state: "visible", timeout });
  await element.locator(`text=${text}`).waitFor({ state: "visible", timeout });
  return element;
}
