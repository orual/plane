// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

/**
 * Common selectors and selector utilities for E2E tests.
 */

export const selectors = {
  // Buttons
  buttons: {
    add: "button:has-text('Add'), button:has-text('Create'), button:has-text('New')",
    save: "button:has-text('Save')",
    delete: "button:has-text('Delete')",
    cancel: "button:has-text('Cancel')",
    close: "button:has-text('Close'), button[aria-label='Close']",
    submit: "button:has-text('Submit'), button:has-text('Create')",
    confirm: "button:has-text('Confirm')",
  },

  // Form inputs
  forms: {
    nameInput: 'input[name="name"], input[placeholder*="name"]',
    descriptionInput: 'textarea[name="description"], textarea[placeholder*="description"]',
    typeSelect: 'select[name="type"], select[name="field_type"]',
  },

  // Dropdowns and selects
  dropdowns: {
    typeDropdown: "[data-test='issue-type-dropdown'], button:has-text('Type')",
    filterDropdown: "button:has-text('Filter'), button[data-test='filter-button']",
    stateDropdown: "[data-test='state-dropdown'], button:has-text('State')",
  },

  // Settings pages
  settings: {
    issueTypesTab: "[data-test='issue-types-tab'], text=Issue Types",
    propertiesTab: "[data-test='properties-tab'], text=Properties",
    propertyItem: "[data-test='property-item']",
  },

  // Modals and dialogs
  modals: {
    dialog: "[role='dialog']",
    modal: ".modal, [role='alertdialog']",
  },

  // Common elements
  elements: {
    spinner: "[role='status'], .spinner, .loading",
    emptyState: ".empty-state, text=No results",
  },
};

/**
 * Get a button by text content.
 */
export function getButtonByText(text: string): string {
  return `button:has-text('${text}')`;
}

/**
 * Get an input by name attribute.
 */
export function getInputByName(name: string): string {
  return `input[name="${name}"]`;
}

/**
 * Get a label by text content.
 */
export function getLabelByText(text: string): string {
  return `label:has-text('${text}')`;
}

/**
 * Get text element by content.
 */
export function getTextByContent(text: string): string {
  return `text=${text}`;
}
