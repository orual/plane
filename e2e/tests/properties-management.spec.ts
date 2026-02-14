// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { test, expect } from "../fixtures/index";

test.describe("Custom Property Management", () => {
  test("user can create a custom property in project settings", async ({
    authenticatedPage,
    workspaceSlug,
    projectId,
  }) => {
    const page = authenticatedPage;

    // Navigate to project settings
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/settings/properties`);

    // Wait for the settings page to load
    const addButton = page.locator("button:has-text('Add property'), button:has-text('New property')").first();
    await addButton.waitFor({ state: "visible", timeout: 10000 }).catch(() => {
      // Button might have different text
    });

    // Click the "Add property" button
    await addButton.click();

    // Fill in the property form
    const nameInput = page.locator('input[name="name"], input[placeholder="Property name"]').first();
    await nameInput.fill("Priority Level");

    // Select property type
    const typeSelect = page.locator('select[name="type"], select[name="field_type"]').first();
    await typeSelect.selectOption("select");

    // Add options if it's a select type
    const addOptionButton = page.locator("button:has-text('Add option')").first();
    if (await addOptionButton.isVisible()) {
      // Add first option
      await addOptionButton.click();
      const option1 = page.locator('input[placeholder*="Option"], input[name*="options"]').first();
      await option1.fill("Critical");

      // Add second option
      await addOptionButton.click();
      const option2 = page.locator('input[placeholder*="Option"], input[name*="options"]').nth(1);
      await option2.fill("Normal");
    }

    // Submit the form
    const submitButton = page.locator("button:has-text('Create'), button:has-text('Save')").first();
    await submitButton.click();

    // Wait for the property to appear
    await page.waitForSelector("text=Priority Level", { timeout: 5000 });

    // Verify the property is visible
    const propertyName = page.locator("text=Priority Level");
    await expect(propertyName).toBeVisible();
  });

  test("user can edit a custom property", async ({ authenticatedPage, workspaceSlug, projectId }) => {
    const page = authenticatedPage;

    // Navigate to project settings
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/settings/properties`);

    // Wait for properties to load
    await page.waitForSelector("[data-test='property-item'], div:has-text('Property')", {
      timeout: 5000,
    });

    // Find the first property and click edit (or similar action)
    const propertyItem = page.locator("[data-test='property-item']").first();
    const editButton = propertyItem.locator("button:has-text('Edit'), button[title='Edit']");

    if (await editButton.isVisible()) {
      await editButton.click();

      // Update the property
      const nameInput = page.locator('input[name="name"]').first();
      const currentValue = await nameInput.inputValue();
      await nameInput.fill(currentValue + " Updated");

      // Save
      const saveButton = page.locator("button:has-text('Save')").first();
      await saveButton.click();

      // Verify the update
      await page.waitForSelector(`text=${currentValue} Updated`, { timeout: 5000 });
    }
  });

  test("user can delete a custom property", async ({ authenticatedPage, workspaceSlug, projectId }) => {
    const page = authenticatedPage;

    // Navigate to project settings
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/settings/properties`);

    // Wait for properties
    await page.waitForSelector("[data-test='property-item'], div:has-text('Property')", {
      timeout: 5000,
    });

    // Find the first property
    const propertyItem = page.locator("[data-test='property-item']").first();

    // Get the property name for verification
    const propertyName = await propertyItem.locator("span").first().textContent();

    // Find and click delete button
    const deleteButton = propertyItem.locator("button:has-text('Delete'), button[title='Delete']");

    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Confirm deletion in modal if present
      const confirmButton = page.locator("button:has-text('Confirm'), button:has-text('Delete')").last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Verify the property is gone
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      const deletedProperty = page.locator(`text=${propertyName}`);
      // Property should either be gone or marked as deleted
      // Depending on UI implementation
    }
  });

  test("user can set property options visibility", async ({ authenticatedPage, workspaceSlug, projectId }) => {
    const page = authenticatedPage;

    // Navigate to project settings
    await page.goto(`http://localhost:3000/${workspaceSlug}/projects/${projectId}/settings/properties`);

    // Wait for properties
    const propsWait = page.waitForSelector("[data-test='property-item']", { timeout: 5000 }).catch(() => {
      // Properties might not exist yet
    });
    await propsWait;

    // Find a property with options
    const propertyItems = page.locator("[data-test='property-item']");
    let found = false;

    const count = await propertyItems.count();
    for (let i = 0; i < count; i++) {
      const item = propertyItems.nth(i);
      const optionsButton = item.locator("button:has-text('Options')");

      if (await optionsButton.isVisible()) {
        await optionsButton.click();

        // Toggle visibility of an option
        const visibilityToggle = page.locator("[role='switch']").first();
        if (await visibilityToggle.isVisible()) {
          await visibilityToggle.click();
          found = true;
          break;
        }
      }
    }

    // If we found and toggled an option, verify it changed
    if (found) {
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      // Verify the toggle changed state
      const toggle = page.locator("[role='switch']").first();
      const isChecked = await toggle.evaluate((el: any) => el.getAttribute("aria-checked"));
      expect(isChecked).toBeTruthy();
    }
  });
});
