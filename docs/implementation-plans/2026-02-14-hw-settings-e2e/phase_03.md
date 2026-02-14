# HW Settings E2E — Phase 3: Workspace Issue Types Settings Page

**Goal:** Build the workspace-level settings page for issue type CRUD and property definition management, with a two-column layout (list + side panel) following existing settings page patterns.

**Architecture:** A page component at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/issue-types/page.tsx` renders `IssueTypesSettingsRoot` from `hw/components/settings/issue-types/root.tsx`. The root manages selected-type state and renders a `List` + `SidePanel` two-column layout. Issue type CRUD uses `IssueTypeStore` (already complete); property definition CRUD uses `IssuePropertyStore` (CRUD added in Phase 2). All new components live in `apps/web/hw/components/settings/issue-types/` and use `data-test` attributes for E2E selectors. Non-admin users see a read-only view with action buttons hidden via `allowPermissions`.

**Tech Stack:** React 18, MobX, TypeScript, TailwindCSS, @plane/ui (ModalCore, AlertModalCore, Breadcrumbs, Header, ColorPicker), @plane/propel (Button, toast)

**Scope:** 3 of 5 phases from original design

**Codebase verified:** 2026-02-14

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-settings-e2e.AC2: Settings pages for issue types and properties

- **hw-settings-e2e.AC2.1 Success:** Navigating to `/{workspaceSlug}/settings/issue-types` renders the workspace issue types list page with the `data-test="issue-type-list"` container.
- **hw-settings-e2e.AC2.2 Success:** An ADMIN user can create an issue type via the UI (name, description, color) and the new type appears in the list.
- **hw-settings-e2e.AC2.3 Success:** Clicking an issue type in the list opens a side panel (`data-test="issue-type-side-panel"`) showing the type's details and associated properties.
- **hw-settings-e2e.AC2.4 Success:** An ADMIN user can create a property definition within the side panel and it appears in the property list.
- **hw-settings-e2e.AC2.9 Constraint:** Non-ADMIN users see the settings pages in read-only mode (action buttons hidden, no create/edit/delete).
- **hw-settings-e2e.AC2.10 Constraint:** No files in `packages/constants/`, `packages/types/`, or other upstream shared packages are modified.

### hw-settings-e2e.AC3: E2E smoke and critical path tests

- **hw-settings-e2e.AC3.6 Constraint:** All new components use `data-test` attributes following the documented convention.

---

## Reference Files (for implementation)

These files define the patterns this phase follows. The task-implementor should read them before writing code:

| Pattern                          | Reference File                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Workspace settings page          | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx`       |
| Settings header with breadcrumbs | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/header.tsx`     |
| SettingsContentWrapper           | `apps/web/core/components/settings/content-wrapper.tsx`                                     |
| SettingsPageHeader               | `apps/web/core/components/settings/page-header.tsx`                                         |
| Delete modal (AlertModalCore)    | `apps/web/core/components/labels/delete-label-modal.tsx`                                    |
| IssueTypeStore (CRUD pattern)    | `apps/web/hw/store/issue-type.store.ts`                                                     |
| IssuePropertyStore               | `apps/web/hw/store/issue-property.store.ts`                                                 |
| IssueProperty service methods    | `apps/web/hw/services/issue-property.service.ts`                                            |
| HW root store registration       | `apps/web/hw/store/root.store.ts`                                                           |
| TIssueType type definition       | `apps/web/hw/types/issue-types/index.ts`                                                    |
| IIssuePropertyDefinition type    | `apps/web/hw/types/issue-property-definitions.d.ts`                                         |
| Permission pattern               | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx:42-54` |
| WORKSPACE_SETTINGS constants     | `packages/constants/src/settings/workspace.ts`                                              |
| WORKSPACE_SETTINGS_ICONS         | `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`                         |

---

## data-test Attribute Convention

All new components use `data-test` attributes following this convention:

| Element                       | Attribute                                  |
| ----------------------------- | ------------------------------------------ |
| Issue type list container     | `data-test="issue-type-list"`              |
| Individual type row           | `data-test="issue-type-item"`              |
| Create type button            | `data-test="issue-type-create-btn"`        |
| Side panel container          | `data-test="issue-type-side-panel"`        |
| Type form (create/edit modal) | `data-test="issue-type-form"`              |
| Type name input               | `data-test="issue-type-name-input"`        |
| Type description input        | `data-test="issue-type-description-input"` |
| Type form submit button       | `data-test="issue-type-form-submit"`       |
| Delete modal                  | `data-test="issue-type-delete-modal"`      |
| Delete confirm button         | `data-test="issue-type-delete-confirm"`    |
| Property list container       | `data-test="property-list"`                |
| Property item                 | `data-test="property-item"`                |
| Add property button           | `data-test="property-add-btn"`             |
| Property form                 | `data-test="property-form"`                |
| Property name input           | `data-test="property-name-input"`          |
| Property type dropdown        | `data-test="property-type-select"`         |
| Property form submit          | `data-test="property-form-submit"`         |

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Create settings header component

**Verifies:** hw-settings-e2e.AC2.1

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/header.tsx`

**Implementation:**

Create a header component following the exact pattern from `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/header.tsx`.

The component should:

1. Be an observer-wrapped named export: `IssueTypesSettingsHeader`
2. Use `SettingsPageHeader` with `leftItem` containing `Breadcrumbs`
3. Since "issue-types" is not in the upstream `WORKSPACE_SETTINGS` constant (and AC2.10 forbids modifying it), hardcode the label as `"Issue types"` and use an appropriate Lucide icon (`Layers` from `lucide-react` is a reasonable choice for categorized types)
4. No `rightItem` — the create button goes in the page content, not the header (matching the members page pattern where the "Add member" button is in the page body)

**Key imports:**

```typescript
import { observer } from "mobx-react";
import { Layers } from "lucide-react";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add issue types settings header component`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create delete confirmation modal

**Verifies:** hw-settings-e2e.AC2.2, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/delete-modal.tsx`

**Implementation:**

Create a delete confirmation modal following the exact pattern from `apps/web/core/components/labels/delete-label-modal.tsx`.

The component should:

1. Be an observer-wrapped named export: `DeleteIssueTypeModal`
2. Props: `isOpen: boolean`, `onClose: () => void`, `data: TIssueType | null`
3. Use `AlertModalCore` from `@plane/ui` with `variant="danger"`
4. On submit: call `rootStore.issueTypeStore.deleteIssueType(workspaceSlug, data.id)`
5. Get `workspaceSlug` from route params using the pattern from the page (passed as prop, or obtained from `useParams`)
6. Show toast on error using `setToast` from `@plane/propel/toast`
7. Manage `isDeleteLoading` state to disable the submit button during the API call
8. Content text: "Are you sure you want to delete **{data?.name}**? This will remove the issue type from all work items that reference it."
9. Add `data-test="issue-type-delete-modal"` to the wrapper and `data-test="issue-type-delete-confirm"` to the submit action area

**Key difference from labels modal:** Use `rootStore.issueTypeStore.deleteIssueType` instead of `deleteLabel`, and get `workspaceSlug` (not `projectId`).

**Props interface:**

```typescript
type Props = {
  isOpen: boolean;
  onClose: () => void;
  data: TIssueType | null;
  workspaceSlug: string;
};
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add delete issue type confirmation modal`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Create issue type create/update modal

**Verifies:** hw-settings-e2e.AC2.2, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/create-update-modal.tsx`

**Implementation:**

Create a modal for creating and editing issue types. Use `ModalCore` from `@plane/ui` as the modal shell, with a form inside.

The component should:

1. Be an observer-wrapped named export: `CreateUpdateIssueTypeModal`
2. Props:
   ```typescript
   type Props = {
     isOpen: boolean;
     onClose: () => void;
     workspaceSlug: string;
     data?: TIssueType | null; // null/undefined = create mode, populated = edit mode
   };
   ```
3. Form fields:
   - **Name** (required): text input, `data-test="issue-type-name-input"`
   - **Description**: textarea, `data-test="issue-type-description-input"`
   - **Color**: Use the `ColorPicker` component from `@plane/ui` for `logo_props.color`
   - **Is default**: toggle/checkbox (whether this is the default type)
4. Form state managed with `useState` — initialize from `data` prop when editing
5. On submit:
   - Create mode: call `rootStore.issueTypeStore.createIssueType(workspaceSlug, formData)`
   - Edit mode: call `rootStore.issueTypeStore.updateIssueType(workspaceSlug, data.id, formData)`
6. Show success/error toasts
7. Close modal on success
8. Add `data-test="issue-type-form"` to the form element
9. Add `data-test="issue-type-form-submit"` to the submit button
10. Use `isSubmitting` state to disable the button during API calls

**Form data shape (maps to TIssueType fields):**

```typescript
const [formData, setFormData] = useState({
  name: data?.name ?? "",
  description: data?.description ?? "",
  logo_props: { color: data?.logo_props?.color ?? "#6366f1" },
  is_default: data?.is_default ?? false,
});
```

**Store access pattern:**

```typescript
import { useRootStore } from "@/hooks/store/use-root-store";
const { issueTypeStore } = useRootStore();
```

**Modal structure follows this layout:**

```
ModalCore (isOpen, handleClose)
  └── form (onSubmit, data-test="issue-type-form")
      ├── Title: "Create issue type" / "Update issue type"
      ├── Name input (required)
      ├── Description textarea
      ├── Color picker row
      ├── Is-default toggle row
      └── Button row: Cancel + Submit
```

Use `Button` from `@plane/propel/button` for submit/cancel, matching the existing codebase pattern.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add create/update issue type modal`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->

### Task 4: Create issue type list item component

**Verifies:** hw-settings-e2e.AC2.1, hw-settings-e2e.AC2.3, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/list-item.tsx`

**Implementation:**

Create an individual issue type row component for the list view.

The component should:

1. Be a named export: `IssueTypeListItem`
2. Props:
   ```typescript
   type Props = {
     issueType: TIssueType;
     isSelected: boolean;
     isAdmin: boolean;
     onClick: () => void;
     onEdit: () => void;
     onDelete: () => void;
   };
   ```
3. Render a row with:
   - Color dot (circle div with `backgroundColor` from `issueType.logo_props.color`)
   - Name (bold)
   - Description excerpt (truncated to one line with `truncate` class)
   - "Default" badge if `issueType.is_default`
   - Kebab menu (three dots button) with "Edit" and "Delete" options (visible only when `isAdmin` is true)
4. The entire row is clickable (`onClick`) to select the type and open the side panel
5. Visual indicator when `isSelected` (e.g., left border accent or background highlight, use `bg-surface-2` or similar Tailwind class)
6. Add `data-test="issue-type-item"` to the row container

**Kebab menu implementation:** Use a simple dropdown or the existing popover pattern from the codebase. A minimal approach: a button with `EllipsisVertical` icon from `lucide-react` that toggles a small absolute-positioned menu. Alternatively, use any existing `CustomMenu` component if available in `@plane/ui`.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add issue type list item component`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Create issue type list component

**Verifies:** hw-settings-e2e.AC2.1, hw-settings-e2e.AC2.2, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/list.tsx`

**Implementation:**

Create the left-column list view that shows all workspace issue types.

The component should:

1. Be an observer-wrapped named export: `IssueTypeList`
2. Props:
   ```typescript
   type Props = {
     workspaceSlug: string;
     issueTypes: TIssueType[];
     selectedTypeId: string | null;
     isAdmin: boolean;
     onSelectType: (typeId: string) => void;
     onCreateType: () => void;
     onEditType: (issueType: TIssueType) => void;
     onDeleteType: (issueType: TIssueType) => void;
   };
   ```
3. Render:
   - Header row with title "Issue types" and a count badge
   - "Add issue type" button (visible only when `isAdmin`) with `data-test="issue-type-create-btn"`
   - List of `IssueTypeListItem` components, one per issue type
   - Empty state message when no issue types exist
4. Add `data-test="issue-type-list"` to the list container div
5. The list items should be sorted — default types first, then alphabetically by name

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add issue type list component`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 6-8) -->

<!-- START_TASK_6 -->

### Task 6: Create property form component

**Verifies:** hw-settings-e2e.AC2.4, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/property-form.tsx`

**Implementation:**

Create an inline form for creating/editing a property definition within the side panel.

The component should:

1. Be an observer-wrapped named export: `PropertyForm`
2. Props:
   ```typescript
   type Props = {
     workspaceSlug: string;
     issueTypeId: string;
     data?: IIssuePropertyDefinition | null; // null = create mode
     onSave: () => void;
     onCancel: () => void;
   };
   ```
3. Form fields:
   - **Name** (required): text input, `data-test="property-name-input"`
   - **Property type**: dropdown/select with options from `TPropertyType`: "text", "number", "select", "multi_select", "url", "date", "boolean", `data-test="property-type-select"`
   - **Is required**: toggle/checkbox
   - **Options** (conditional): only shown when `property_type` is "select" or "multi_select". A simple list of string inputs with add/remove capability. Each option is a text input; "Add option" button appends a new empty input; "X" button removes an option.
4. Form state:
   ```typescript
   const [formData, setFormData] = useState({
     name: data?.name ?? "",
     property_type: data?.property_type ?? ("text" as TPropertyType),
     is_required: data?.is_required ?? false,
     options: data?.options ?? ([] as string[]),
   });
   ```
5. On submit:
   - Create mode: call `issuePropertyStore.createDefinition(workspaceSlug, { ...formData, issue_type_id: issueTypeId })`
   - Edit mode: call `issuePropertyStore.updateDefinition(workspaceSlug, data.id, formData)`
6. Show toast on error
7. Call `onSave()` on success, `onCancel()` to dismiss
8. Add `data-test="property-form"` to the form container
9. Add `data-test="property-form-submit"` to the save button

**Options editor** (conditional section for select/multi_select):

```
When property_type is "select" or "multi_select":
  ├── Label: "Options"
  ├── For each option: [text input] [X remove button]
  └── [+ Add option] button
```

**Key imports:**

```typescript
import { useRootStore } from "@/hooks/store/use-root-store";
import type { IIssuePropertyDefinition } from "@/plane-web/types/issue-property-definitions";
import type { TPropertyType } from "@/plane-web/types/issue-property-definitions";
```

> **Note:** Verify the exact import path for `TPropertyType`. It may be defined in `apps/web/hw/types/issue-property-definitions.d.ts` or a related types file. If `TPropertyType` is not exported as a standalone type, define it locally as: `type TPropertyType = "text" | "number" | "select" | "multi_select" | "url" | "date" | "boolean";`

**Store access:**

```typescript
const { issuePropertyStore } = useRootStore();
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add property definition form component`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Create property list component

**Verifies:** hw-settings-e2e.AC2.3, hw-settings-e2e.AC2.4, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/property-list.tsx`

**Implementation:**

Create a list of property definitions displayed within the side panel, with inline editing support.

The component should:

1. Be an observer-wrapped named export: `PropertyList`
2. Props:
   ```typescript
   type Props = {
     workspaceSlug: string;
     issueTypeId: string;
     properties: IIssuePropertyDefinition[];
     isAdmin: boolean;
   };
   ```
3. State:
   - `editingPropertyId: string | null` — which property is being edited inline
   - `isCreating: boolean` — whether the "add property" form is visible
4. Render:
   - Section header: "Properties" with count
   - "Add property" button (visible only when `isAdmin`) with `data-test="property-add-btn"`
   - If `isCreating`, show `PropertyForm` in create mode at the top of the list
   - For each property:
     - If `editingPropertyId === property.id`, show `PropertyForm` in edit mode
     - Otherwise, show a summary row: name, type badge (e.g., pill with "text", "number", etc.), required indicator ("\*" or badge)
     - Kebab menu with "Edit" and "Delete" options (visible only when `isAdmin`)
   - Empty state: "No properties defined for this type."
5. Delete handler: calls `issuePropertyStore.deleteDefinition(workspaceSlug, propertyId)` with toast on error
6. Add `data-test="property-list"` to the list container
7. Add `data-test="property-item"` to each property row

**Property type badge:** A small pill/chip showing the property type (e.g., `<span className="text-xs px-2 py-0.5 rounded-full bg-surface-3">text</span>`).

**Required indicator:** Show a red asterisk or "Required" badge when `is_required` is true.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add property list component for issue type side panel`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Create issue type side panel component

**Verifies:** hw-settings-e2e.AC2.3, hw-settings-e2e.AC2.4, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/side-panel.tsx`

**Implementation:**

Create the right-column detail panel that shows when an issue type is selected.

The component should:

1. Be an observer-wrapped named export: `IssueTypeSidePanel`
2. Props:
   ```typescript
   type Props = {
     workspaceSlug: string;
     issueType: TIssueType;
     isAdmin: boolean;
     onClose: () => void;
     onEdit: () => void;
   };
   ```
3. On mount, fetch property definitions for this issue type. The `IssuePropertyStore.fetchDefinitions(workspaceSlug)` fetches all definitions. Filter locally by `issue_type_id === issueType.id`:
   ```typescript
   const properties = issuePropertyStore.getAllDefinitions().filter((def) => def.issue_type_id === issueType.id);
   ```
4. Render:
   - Close button (X) at top right, calls `onClose()`
   - Issue type details section:
     - Color dot + Name (large heading)
     - Description (full text)
     - Badges: "Default" (if `is_default`), "Active"/"Inactive" (based on `is_active`)
   - Edit button (visible only when `isAdmin`), calls `onEdit()`
   - Divider
   - `PropertyList` component with the filtered properties
5. Add `data-test="issue-type-side-panel"` to the panel container
6. Ensure the `fetchDefinitions` call happens via `useEffect` on mount if definitions haven't been loaded yet

**Layout:** The panel should take up the right portion of the two-column layout. It gets a fixed or flex-based width (e.g., `w-[400px]` or `flex-1` with min-width). Use `border-l border-subtle` for visual separation from the list.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add issue type side panel component`

<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 9-10) -->

<!-- START_TASK_9 -->

### Task 9: Create issue types settings root component

**Verifies:** hw-settings-e2e.AC2.1, hw-settings-e2e.AC2.2, hw-settings-e2e.AC2.3, hw-settings-e2e.AC2.9, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/issue-types/root.tsx`
- Create: `apps/web/hw/components/settings/issue-types/index.ts` (barrel export)

**Implementation:**

Create the root orchestrator component that manages state and renders the two-column layout.

**`root.tsx`** should:

1. Be an observer-wrapped named export: `IssueTypesSettingsRoot`
2. Props:
   ```typescript
   type Props = {
     workspaceSlug: string;
   };
   ```
3. State management:
   ```typescript
   const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const [editingType, setEditingType] = useState<TIssueType | null>(null);
   const [deletingType, setDeletingType] = useState<TIssueType | null>(null);
   ```
4. Store access and data fetching:

   ```typescript
   const { issueTypeStore, issuePropertyStore } = useRootStore();
   const { allowPermissions } = useUserPermissions();

   // NOTE: Verify exact permission enum values by checking `packages/constants/src/user.ts` or the
   // import from `@plane/constants`. The codebase may use `EUserWorkspaceRoles` instead of
   // `EUserPermissions`. Match whatever the reference page (members/page.tsx) uses.
   const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

   useEffect(() => {
     issueTypeStore.fetchIssueTypes(workspaceSlug);
     issuePropertyStore.fetchDefinitions(workspaceSlug);
   }, [workspaceSlug]);

   const issueTypes = issueTypeStore.getWorkspaceIssueTypes(workspaceSlug);
   const selectedType = selectedTypeId ? issueTypeStore.getIssueTypeById(selectedTypeId) : null;
   ```

5. Render the two-column layout:
   ```
   <div className="flex h-full">
     <div className="flex-1 min-w-0"> <!-- Left column: list -->
       <IssueTypeList ... />
     </div>
     {selectedType && (
       <div className="w-[400px] shrink-0 border-l border-subtle"> <!-- Right column: panel -->
         <IssueTypeSidePanel ... />
       </div>
     )}
   </div>
   ```
6. Wire up all callbacks:
   - `onSelectType`: set `selectedTypeId`
   - `onCreateType`: open create modal
   - `onEditType`: set `editingType` and open modal in edit mode
   - `onDeleteType`: set `deletingType` and open delete modal
   - Side panel `onClose`: set `selectedTypeId` to null
   - Side panel `onEdit`: open edit modal for the selected type
7. Render modals:
   ```
   <CreateUpdateIssueTypeModal
     isOpen={isCreateModalOpen || editingType !== null}
     onClose={() => { setIsCreateModalOpen(false); setEditingType(null); }}
     workspaceSlug={workspaceSlug}
     data={editingType}
   />
   <DeleteIssueTypeModal
     isOpen={deletingType !== null}
     onClose={() => setDeletingType(null)}
     workspaceSlug={workspaceSlug}
     data={deletingType}
   />
   ```

**`index.ts`** barrel export:

```typescript
export { IssueTypesSettingsRoot } from "./root";
export { IssueTypesSettingsHeader } from "./header";
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to these files.

**Commit:** `feat(web): add issue types settings root component with two-column layout`

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->

### Task 10: Replace page.tsx placeholder with real implementation

**Verifies:** hw-settings-e2e.AC2.1, hw-settings-e2e.AC2.9

**Files:**

- Modify: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/issue-types/page.tsx` (replace placeholder from Phase 2)

**Implementation:**

Replace the placeholder page component with the real implementation following the workspace members page pattern (`apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/members/page.tsx`).

The page component should:

1. Be an observer-wrapped default export
2. Accept `{ params }: Route.ComponentProps` and extract `workspaceSlug`
3. Check permissions: workspace MEMBER or above to view, ADMIN for actions
4. Show `NotAuthorizedView` if user lacks permission to view
5. Use `SettingsContentWrapper` with the `IssueTypesSettingsHeader` and `hugging` prop (since the two-column layout needs full width)
6. Render `PageHead` with the workspace name for the browser tab title
7. Render `IssueTypesSettingsRoot` as the main content

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// hw components
import { IssueTypesSettingsRoot, IssueTypesSettingsHeader } from "@/plane-web/components/settings/issue-types";
// types
import type { Route } from "./+types/page";

const WorkspaceIssueTypesSettingsPage = observer(function WorkspaceIssueTypesSettingsPage({
  params,
}: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const canViewSettings = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Issue types` : undefined;

  if (workspaceUserInfo && !canViewSettings) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypesSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <IssueTypesSettingsRoot workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
});

export default WorkspaceIssueTypesSettingsPage;
```

**Key differences from the Phase 2 placeholder:**

- Full observer wrapper with permission checks
- Real imports from hw/components
- Uses `Route.ComponentProps` for typed params
- SettingsContentWrapper provides the layout shell

> **Note:** The `./+types/page` directory is auto-generated by React Router 7's type generation. It provides typed route params via `Route.ComponentProps`. This directory will be created automatically when the dev server or build runs; do not create it manually.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors. Navigate to `/{workspaceSlug}/settings/issue-types` — should render the full issue types settings page.

**Commit:** `feat(web): replace issue types page placeholder with full implementation`

<!-- END_TASK_10 -->

<!-- END_SUBCOMPONENT_D -->

<!-- START_TASK_11 -->

### Task 11: Verify end-to-end settings page functionality

**Verifies:** hw-settings-e2e.AC2.1, hw-settings-e2e.AC2.2, hw-settings-e2e.AC2.3, hw-settings-e2e.AC2.4, hw-settings-e2e.AC2.9, hw-settings-e2e.AC2.10, hw-settings-e2e.AC3.6

**Files:**

- No file changes — verification only

**Implementation:**

Verify the complete workspace issue types settings page works end-to-end:

1. **AC2.1 — Page loads with data-test attribute:**
   - Navigate to `/{workspaceSlug}/settings/issue-types`
   - Verify the page renders with `data-test="issue-type-list"` visible
   - Check browser DevTools: `document.querySelector('[data-test="issue-type-list"]')` should return an element

2. **AC2.2 — Create issue type:**
   - Click "Add issue type" button
   - Fill in name, description, pick a color
   - Submit the form
   - Verify the new type appears in the list

3. **AC2.3 — Side panel opens:**
   - Click an issue type in the list
   - Verify the side panel appears with `data-test="issue-type-side-panel"`
   - Verify it shows the type's name, description, and properties section

4. **AC2.4 — Create property:**
   - With the side panel open, click "Add property"
   - Fill in property name, select a type
   - Submit
   - Verify the property appears in the property list

5. **AC2.9 — Non-admin read-only:**
   - Log in as a MEMBER (non-admin) user
   - Navigate to issue types settings
   - Verify "Add issue type" button is NOT visible
   - Verify "Add property" button is NOT visible
   - Verify kebab menus (edit/delete) are NOT visible

6. **AC2.10 — No upstream changes:**

   ```bash
   git diff --name-only -- packages/
   ```

   Expected: No files in `packages/` are modified.

7. **AC3.6 — data-test attributes:**
   - In browser DevTools, verify these selectors return elements:
     - `[data-test="issue-type-list"]`
     - `[data-test="issue-type-create-btn"]` (admin only)
     - `[data-test="issue-type-item"]`
     - `[data-test="issue-type-side-panel"]` (when type selected)
     - `[data-test="property-list"]` (in side panel)
     - `[data-test="property-add-btn"]` (admin only, in side panel)

8. **Type check passes:**
   ```bash
   cd apps/web && pnpm check:types
   ```
   Expected: Type check passes with no errors related to this phase's files.

**Commit:** No commit — verification only.

<!-- END_TASK_11 -->
