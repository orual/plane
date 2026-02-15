/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test, expect } from "../fixtures/index";
import {
  createIssueType,
  createPropertyDefinition,
  getWorkspaceIssueTypes,
  getPropertyDefinitions,
} from "../helpers/api";

test.describe("Issue Type CRUD", () => {
  test("create issue type through UI and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
  }) => {
    const page = authenticatedPage;
    const typeName = `E2E Type ${Date.now()}`;
    const typeDescription = "Created via E2E test";

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the list container to render
    await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

    // Click the "Add issue type" button
    const createBtn = page.locator("[data-test='issue-type-create-btn']");
    await createBtn.click();

    // Wait for the create/edit modal to appear
    const form = page.locator("[data-test='issue-type-form']");
    await expect(form).toBeVisible({ timeout: 5000 });

    // Fill in the form fields
    const nameInput = page.locator("[data-test='issue-type-name-input']");
    await nameInput.fill(typeName);

    const descriptionInput = page.locator("[data-test='issue-type-description-input']");
    await descriptionInput.fill(typeDescription);

    // Submit the form
    const submitBtn = page.locator("[data-test='issue-type-form-submit']");
    await submitBtn.click();

    // Wait for the modal to close and the type to appear in the list
    await expect(form).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-test='issue-type-item']").filter({ hasText: typeName })).toBeVisible({
      timeout: 5000,
    });

    // Verify via API that the type was persisted
    const issueTypes = await getWorkspaceIssueTypes(request, authToken, workspaceSlug);
    const createdType = issueTypes.find((t: { name: string }) => t.name === typeName);
    expect(createdType).toBeTruthy();
    expect(createdType.description).toBe(typeDescription);
  });

  test("view properties on an issue type via side panel", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
  }) => {
    const page = authenticatedPage;

    // Create an issue type via API
    const issueType = await createIssueType(request, authToken, workspaceSlug, {
      name: "Type With Properties",
      description: "Has properties for E2E test",
      logo_props: { color: "#F59E0B" },
    });

    // Create a property definition associated with this issue type via API
    await createPropertyDefinition(request, authToken, workspaceSlug, {
      name: "Priority Level",
      property_type: "select",
      issue_type_id: issueType.id,
      options: ["Low", "Medium", "High"],
    });

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the list to render
    await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

    // Click the issue type to open side panel
    const typeItem = page.locator("[data-test='issue-type-item']").filter({ hasText: "Type With Properties" });
    await typeItem.click();

    // Verify the side panel opens
    const sidePanel = page.locator("[data-test='issue-type-side-panel']");
    await expect(sidePanel).toBeVisible({ timeout: 5000 });

    // Verify the property appears in the property list within the side panel
    const propertyList = sidePanel.locator("[data-test='property-list']");
    await expect(propertyList).toBeVisible({ timeout: 5000 });

    const propertyItem = propertyList.locator("[data-test='property-item']").filter({ hasText: "Priority Level" });
    await expect(propertyItem).toBeVisible();
  });

  test("create property on issue type through UI and verify via API", async ({
    authenticatedPage,
    request,
    authToken,
    workspaceSlug,
  }) => {
    const page = authenticatedPage;
    const propertyName = `E2E Property ${Date.now()}`;

    // Create an issue type via API
    const issueType = await createIssueType(request, authToken, workspaceSlug, {
      name: "Type For Property Creation",
      description: "E2E test will add properties here",
      logo_props: { color: "#8B5CF6" },
    });

    // Navigate to workspace issue types settings
    await page.goto(`/${workspaceSlug}/settings/issue-types`);

    // Wait for the list to render
    await expect(page.locator("[data-test='issue-type-list']")).toBeVisible({ timeout: 10000 });

    // Click the issue type to open side panel
    const typeItem = page.locator("[data-test='issue-type-item']").filter({ hasText: "Type For Property Creation" });
    await typeItem.click();

    // Wait for side panel
    const sidePanel = page.locator("[data-test='issue-type-side-panel']");
    await expect(sidePanel).toBeVisible({ timeout: 5000 });

    // Click "Add property" button
    const addPropertyBtn = sidePanel.locator("[data-test='property-add-btn']");
    await addPropertyBtn.click();

    // Wait for the property form to appear
    const propertyForm = page.locator("[data-test='property-form']");
    await expect(propertyForm).toBeVisible({ timeout: 5000 });

    // Fill in property name
    const propertyNameInput = page.locator("[data-test='property-name-input']");
    await propertyNameInput.fill(propertyName);

    // Select property type using selectOption (native <select> element)
    const propertyTypeSelect = page.locator("[data-test='property-type-select']");
    await propertyTypeSelect.selectOption("text");

    // Submit the property form
    const propertySubmitBtn = page.locator("[data-test='property-form-submit']");
    await propertySubmitBtn.click();

    // Wait for the property to appear in the list
    await expect(propertyForm).not.toBeVisible({ timeout: 5000 });
    const propertyList = sidePanel.locator("[data-test='property-list']");
    await expect(propertyList.locator("[data-test='property-item']").filter({ hasText: propertyName })).toBeVisible({
      timeout: 5000,
    });

    // Verify via API that the property was persisted
    const definitions = await getPropertyDefinitions(request, authToken, workspaceSlug);
    const createdProperty = definitions.find((d: { name: string }) => d.name === propertyName);
    expect(createdProperty).toBeTruthy();
    expect(createdProperty.property_type).toBe("text");
    expect(createdProperty.issue_type_id).toBe(issueType.id);
  });
});
