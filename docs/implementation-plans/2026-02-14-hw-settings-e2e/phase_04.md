# HW Settings E2E — Phase 4: Project Issue Types Settings Page

**Goal:** Build the project-level settings page for linking/unlinking workspace issue types to a project, with a toggle list following existing project settings page patterns.

**Architecture:** A page component at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/issue-types/page.tsx` replaces the Phase 2 placeholder. It renders `ProjectIssueTypesRoot` from `hw/components/settings/project-issue-types/root.tsx`. The root fetches workspace issue types and project issue types on mount, then renders a list of all workspace types with toggle switches indicating link status. Link/unlink actions use existing `IssueTypeStore` methods (`linkProjectIssueType`, `unlinkProjectIssueType`). All components live in `apps/web/hw/components/settings/project-issue-types/` and use `data-test` attributes for E2E selectors.

**Tech Stack:** React 18, MobX, TypeScript, TailwindCSS, @plane/ui (ToggleSwitch, Breadcrumbs, Header, Loader), @plane/propel (Button, toast)

**Scope:** 4 of 5 phases from original design

**Codebase verified:** 2026-02-14

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-settings-e2e.AC2: Settings pages for issue types and properties

- **hw-settings-e2e.AC2.5 Success:** Navigating to `/{workspaceSlug}/settings/projects/{projectId}/issue-types` renders the project issue types linking page.
- **hw-settings-e2e.AC2.6 Success:** An ADMIN user can toggle issue types on/off for a project, and the linked/unlinked state persists across page reloads.
- **hw-settings-e2e.AC2.9 Constraint:** Non-ADMIN users see the settings pages in read-only mode (action buttons hidden, no create/edit/delete).
- **hw-settings-e2e.AC2.10 Constraint:** No files in `packages/constants/`, `packages/types/`, or other upstream shared packages are modified.

### hw-settings-e2e.AC3: E2E smoke and critical path tests

- **hw-settings-e2e.AC3.6 Constraint:** All new components use `data-test` attributes following the documented convention.

---

## Reference Files (for implementation)

These files define the patterns this phase follows. The task-implementor should read them before writing code:

| Pattern                                | Reference File                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Project settings page                  | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/page.tsx`       |
| Project settings header                | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/header.tsx`     |
| SettingsContentWrapper                 | `apps/web/core/components/settings/content-wrapper.tsx`                                             |
| SettingsPageHeader                     | `apps/web/core/components/settings/page-header.tsx`                                                 |
| SettingsHeading                        | `apps/web/core/components/settings/heading.tsx`                                                     |
| ToggleSwitch component                 | `packages/ui/src/button/toggle-switch.tsx`                                                          |
| IssueTypeStore (link/unlink)           | `apps/web/hw/store/issue-type.store.ts`                                                             |
| TIssueType and TProjectIssueType types | `apps/web/hw/types/issue-types/index.ts`                                                            |
| HW root store                          | `apps/web/hw/store/root.store.ts`                                                                   |
| Permission pattern (project-level)     | `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/page.tsx:23-36` |
| NotAuthorizedView                      | `apps/web/core/components/auth-screens/not-authorized-view.tsx`                                     |

---

## data-test Attribute Convention

All new components use `data-test` attributes following this convention:

| Element                           | Attribute                                |
| --------------------------------- | ---------------------------------------- |
| Project issue type list container | `data-test="project-issue-type-list"`    |
| Individual type link row          | `data-test="project-issue-type-item"`    |
| Toggle switch wrapper             | `data-test="project-issue-type-toggle"`  |
| Default badge                     | `data-test="project-issue-type-default"` |

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Create project issue types settings header

**Verifies:** hw-settings-e2e.AC2.5

**Files:**

- Create: `apps/web/hw/components/settings/project-issue-types/header.tsx`

**Implementation:**

Create a header component following the exact pattern from `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/header.tsx`.

The component should:

1. Be an observer-wrapped named export: `ProjectIssueTypesSettingsHeader`
2. Use `SettingsPageHeader` with `leftItem` containing `Breadcrumbs`
3. Hardcode the label as `"Issue types"` and use `Layers` icon from `lucide-react` (same icon as workspace issue types header from Phase 3)
4. No `rightItem` — there's no "create" action on this page; linking is done via toggle

**Key imports:**

```typescript
import { observer } from "mobx-react";
import { Layers } from "lucide-react";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
```

**Structure:**

```typescript
export const ProjectIssueTypesSettingsHeader = observer(function ProjectIssueTypesSettingsHeader() {
  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.BreadcrumbItem
              type="text"
              link={<BreadcrumbLink label="Issue types" icon={<Layers className="size-4 text-tertiary" />} />}
            />
          </Breadcrumbs>
        </div>
      }
    />
  );
});
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add project issue types settings header component`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create type link item component with toggle

**Verifies:** hw-settings-e2e.AC2.5, hw-settings-e2e.AC2.6, hw-settings-e2e.AC2.9, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/project-issue-types/type-link-item.tsx`

**Implementation:**

Create a list item component that shows an individual workspace issue type with a toggle switch indicating its linked status to the current project.

**Props interface:**

```typescript
type Props = {
  workspaceSlug: string;
  projectId: string;
  issueType: TIssueType;
  linkedProjectIssueType: TProjectIssueType | undefined;
  canPerformActions: boolean;
};
```

The component should:

1. Be an observer-wrapped named export: `TypeLinkItem`
2. Display the issue type's color dot (from `issueType.logo_props.color`), name, and truncated description
3. Show a `ToggleSwitch` (from `@plane/ui`) on the right:
   - `value`: `!!linkedProjectIssueType` (true if linked, false if not)
   - `onChange`: async handler that calls `linkProjectIssueType` or `unlinkProjectIssueType`
   - `disabled`: `!canPerformActions || isLoading` (non-admins see disabled toggle; also disabled while API call in flight)
4. Manage local `isLoading` state via `useState` to prevent double-toggle during API calls
5. Show a "Default" badge if `linkedProjectIssueType?.is_default === true`
6. Show toast on error using `setToast` from `@plane/propel/toast` with `TOAST_TYPE.ERROR`
7. Add `data-test="project-issue-type-item"` on the row wrapper
8. Add `data-test="project-issue-type-toggle"` on a wrapper around the `ToggleSwitch`
9. Add `data-test="project-issue-type-default"` on the default badge if shown

**Toggle handler logic:**

```typescript
const handleToggle = async (newValue: boolean) => {
  setIsLoading(true);
  try {
    if (newValue) {
      await issueTypeStore.linkProjectIssueType(workspaceSlug, projectId, issueType.id);
    } else if (linkedProjectIssueType) {
      await issueTypeStore.unlinkProjectIssueType(workspaceSlug, projectId, linkedProjectIssueType.id);
    }
  } catch (_error) {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "Error!",
      message: newValue ? "Failed to link issue type to project." : "Failed to unlink issue type from project.",
    });
  } finally {
    setIsLoading(false);
  }
};
```

**Store access:**
Get `issueTypeStore` from the root store:

```typescript
import { useRootStore } from "@/hooks/store/use-root-store";

const { issueTypeStore } = useRootStore();
```

> **Note:** The import path is `@/hooks/store/use-root-store`, matching the pattern used in Phase 3 components. Do NOT use `@/plane-web/hooks/use-root-store` — that path does not exist.

**Layout:**

```tsx
<div
  className="flex items-center justify-between gap-3 border-b border-custom-border-100 px-3.5 py-3"
  data-test="project-issue-type-item"
>
  <div className="flex items-center gap-3 truncate">
    <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
    <div className="truncate">
      <p className="text-sm font-medium text-custom-text-100 truncate">{issueType.name}</p>
      {issueType.description && <p className="text-xs text-custom-text-300 truncate">{issueType.description}</p>}
    </div>
  </div>
  <div className="flex items-center gap-2 shrink-0">
    {linkedProjectIssueType?.is_default && (
      <span
        className="rounded bg-custom-primary-100/20 px-2 py-0.5 text-xs font-medium text-custom-primary-100"
        data-test="project-issue-type-default"
      >
        Default
      </span>
    )}
    <div data-test="project-issue-type-toggle">
      <ToggleSwitch
        value={!!linkedProjectIssueType}
        onChange={handleToggle}
        disabled={!canPerformActions || isLoading}
        size="sm"
      />
    </div>
  </div>
</div>
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add project issue type link item with toggle`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->

### Task 3: Create project issue types root component

**Verifies:** hw-settings-e2e.AC2.5, hw-settings-e2e.AC2.6, hw-settings-e2e.AC3.6

**Files:**

- Create: `apps/web/hw/components/settings/project-issue-types/root.tsx`

**Implementation:**

Create the root component that manages data fetching and renders the list of workspace issue types with their project link status.

**Props interface:**

```typescript
type Props = {
  workspaceSlug: string;
  projectId: string;
  canPerformActions: boolean;
};
```

The component should:

1. Be an observer-wrapped named export: `ProjectIssueTypesRoot`
2. On mount, fetch both:
   - `issueTypeStore.fetchIssueTypes(workspaceSlug)` — all workspace issue types
   - `issueTypeStore.fetchProjectIssueTypes(workspaceSlug, projectId)` — project's linked types
3. Use a `useEffect` with `[workspaceSlug, projectId]` dependencies for fetching
4. Show a `Loader` (from `@plane/ui`) while data is loading, using a local `isLoading` state
5. After loading, render all workspace issue types in a list, each as a `TypeLinkItem`
6. For each workspace type, find its corresponding `TProjectIssueType` (if linked) by matching `issue_type_id` field
7. Wrap the list in a container with `data-test="project-issue-type-list"`
8. If there are no workspace issue types, show an empty state message: "No issue types have been created for this workspace yet. Create issue types in workspace settings."

**Data matching logic:**

```typescript
const workspaceIssueTypes = issueTypeStore.getWorkspaceIssueTypes(workspaceSlug) ?? [];
const projectIssueTypes = issueTypeStore.getProjectIssueTypes(workspaceSlug, projectId) ?? [];

// For each workspace type, find matching project link
const getLinkedProjectIssueType = (issueTypeId: string): TProjectIssueType | undefined =>
  projectIssueTypes.find((pit) => pit.issue_type_id === issueTypeId);
```

**Store access:**

```typescript
import { useRootStore } from "@/hooks/store/use-root-store";

const { issueTypeStore } = useRootStore();
```

> **Note:** The import path is `@/hooks/store/use-root-store`, matching the pattern used in Phase 3 components. Do NOT use `@/plane-web/hooks/use-root-store` — that path does not exist.

**Layout:**

```tsx
<div data-test="project-issue-type-list">
  {isLoading ? (
    <Loader className="space-y-4 p-4">
      <Loader.Item height="50px" />
      <Loader.Item height="50px" />
      <Loader.Item height="50px" />
    </Loader>
  ) : workspaceIssueTypes.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-custom-text-300">No issue types have been created for this workspace yet.</p>
      <p className="text-xs text-custom-text-400 mt-1">Create issue types in workspace settings.</p>
    </div>
  ) : (
    <div className="rounded-md border border-custom-border-100">
      {workspaceIssueTypes.map((issueType) => (
        <TypeLinkItem
          key={issueType.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueType={issueType}
          linkedProjectIssueType={getLinkedProjectIssueType(issueType.id)}
          canPerformActions={canPerformActions}
        />
      ))}
    </div>
  )}
</div>
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to this file.

**Commit:** `feat(web): add project issue types root component with data fetching`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Create barrel export

**Verifies:** hw-settings-e2e.AC2.5

**Files:**

- Create: `apps/web/hw/components/settings/project-issue-types/index.ts`

**Implementation:**

Create an index file that re-exports the public components from this directory:

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export { ProjectIssueTypesSettingsHeader } from "./header";
export { ProjectIssueTypesRoot } from "./root";
```

`TypeLinkItem` is internal (only used by `root.tsx`), so it is not exported from the barrel.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

**Commit:** `chore(web): add barrel export for project issue types components`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_5 -->

### Task 5: Replace project issue types page placeholder

**Verifies:** hw-settings-e2e.AC2.5, hw-settings-e2e.AC2.6, hw-settings-e2e.AC2.9

**Files:**

- Modify: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/issue-types/page.tsx` (replace Phase 2 placeholder with full implementation)

**Implementation:**

Replace the Phase 2 placeholder with the full project issue types settings page. Follow the exact pattern from `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/states/page.tsx`.

The page should:

1. Extract `workspaceSlug` and `projectId` from `Route.ComponentProps` params
2. Check project-level admin permissions using `allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT)`
   - Note: For linking issue types, require ADMIN (not MEMBER) since this changes project configuration
   - **Implementation note:** Verify the exact permission enum values by checking `packages/constants/src/user.ts` or the import from `@plane/constants`. The codebase may use different enum names. Match whatever the reference page (`states/page.tsx`) uses for project-level ADMIN checks.
3. If unauthorized, render `<NotAuthorizedView section="settings" isProjectView className="h-auto" />`
4. Otherwise render `SettingsContentWrapper` with:
   - `header={<ProjectIssueTypesSettingsHeader />}`
   - `PageHead` with page title derived from `currentProjectDetails?.name`
   - `SettingsHeading` with title "Issue types" and description "Manage which issue types are available in this project."
   - `ProjectIssueTypesRoot` with `workspaceSlug`, `projectId`, and `canPerformActions` props
5. Use `useProject()` to get `currentProjectDetails` for the page title

**Key imports:**

```typescript
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import {
  ProjectIssueTypesSettingsHeader,
  ProjectIssueTypesRoot,
} from "@/plane-web/components/settings/project-issue-types";
import type { Route } from "./+types/page";
```

**Full page structure:**

```typescript
const ProjectIssueTypesSettingsPage = observer(function ProjectIssueTypesSettingsPage({
  params,
}: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - Issue types` : undefined;

  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<ProjectIssueTypesSettingsHeader />}>
      <PageHead title={pageTitle} />
      <SettingsHeading title="Issue types" description="Manage which issue types are available in this project." />
      <div className="mt-6">
        <ProjectIssueTypesRoot
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          canPerformActions={canPerformProjectAdminActions}
        />
      </div>
    </SettingsContentWrapper>
  );
});

export default ProjectIssueTypesSettingsPage;
```

**Important notes:**

- The `Route.ComponentProps` type import `from "./+types/page"` is auto-generated by React Router 7 and provides typed params `{ workspaceSlug: string; projectId: string }`.
- The `isProjectView` prop on `NotAuthorizedView` distinguishes project-level from workspace-level authorization messages.
- Permission level is `EUserPermissionsLevel.PROJECT` (not WORKSPACE) since this is a project settings page.
- Only ADMIN can toggle (not MEMBER) because linking/unlinking types changes project configuration.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Navigate to `http://localhost:3000/{workspaceSlug}/settings/projects/{projectId}/issue-types` — should render the full page with workspace issue types listed.

**Commit:** `feat(web): implement project issue types settings page`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Verify end-to-end project issue types page

**Verifies:** hw-settings-e2e.AC2.5, hw-settings-e2e.AC2.6, hw-settings-e2e.AC2.9, hw-settings-e2e.AC2.10

**Files:**

- No file changes — verification only

**Implementation:**

Verify the complete project issue types settings page works:

1. **AC2.5 — Page renders**: Navigate to `/{workspaceSlug}/settings/projects/{projectId}/issue-types`. Verify:
   - The page renders with the settings layout (sidebar + content area)
   - The header shows "Issue types" with the Layers icon
   - The content area shows the `SettingsHeading` with title and description
   - If workspace issue types exist, they appear in the list with toggle switches
   - If no workspace issue types exist, the empty state message appears
   - The `data-test="project-issue-type-list"` attribute is present on the list container

2. **AC2.6 — Link/unlink persists**: Toggle a workspace issue type ON for the project. Verify:
   - The toggle switch changes to ON state
   - Reload the page — the toggle should still be ON (state persisted)
   - Toggle it OFF, reload — should be OFF (unlinked)

3. **AC2.9 — Non-admin read-only**: If possible to test with a non-admin user:
   - Navigate to the same page — should show `NotAuthorizedView` or disabled toggles
   - (If testing permissions is not possible in dev, note this and the E2E tests in Phase 5 will cover it)

4. **AC2.10 — No upstream changes**: Run:

   ```bash
   git diff --name-only -- packages/
   ```

   Expected: No files in `packages/` modified.

5. **Build check**:
   ```bash
   cd apps/web && pnpm check:types
   ```
   Expected: Type check passes.

**Commit:** No commit — verification only.

<!-- END_TASK_6 -->
