# HW Settings E2E — Phase 2: Store Gap + Route Infrastructure

**Goal:** Add CRUD actions to IssuePropertyStore, define HW-specific routes for settings pages, create CE/HW sidebar overrides to add "Issue types" entries in workspace and project settings sidebars.

**Architecture:** The IssuePropertyStore gets create/update/delete actions matching IssueTypeStore's optimistic update pattern. Routes are added to `extended.ts` and merged via `mergeRoutes()`. Sidebar components use the CE/HW overlay: CE re-exports core, HW extends with issue-types entries. The layout imports are changed from `@/components/...` to `@/plane-web/components/...` so the HW build picks up the extended sidebar.

**Tech Stack:** TypeScript, MobX, React Router

**Scope:** 2 of 5 phases from original design

**Codebase verified:** 2026-02-14

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-settings-e2e.AC2: Settings pages for issue types and properties

- **hw-settings-e2e.AC2.7 Success:** The project settings sidebar shows an "Issue types" entry under the correct category, linking to the project issue types page.
- **hw-settings-e2e.AC2.8 Success:** The workspace settings sidebar shows an "Issue types" entry linking to the workspace issue types page.
- **hw-settings-e2e.AC2.10 Constraint:** No files in `packages/constants/`, `packages/types/`, or other upstream shared packages are modified.

### hw-settings-e2e.AC4: IssuePropertyStore CRUD gap filled

- **hw-settings-e2e.AC4.1 Success:** `IssuePropertyStore` exposes `createDefinition()`, `updateDefinition()`, and `deleteDefinition()` actions.
- **hw-settings-e2e.AC4.2 Success:** Each action calls the corresponding method on `IssuePropertyService` and updates the observable `definitionsMap`.
- **hw-settings-e2e.AC4.3 Success:** `updateDefinition()` and `deleteDefinition()` use optimistic updates with rollback on API error, matching the pattern in `IssueTypeStore`.

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->

### Task 1: Add CRUD actions to IssuePropertyStore interface

**Verifies:** hw-settings-e2e.AC4.1

**Files:**

- Modify: `apps/web/hw/store/issue-property.store.ts` (interface and `makeObservable` registration)

**Implementation:**

Add three new methods to the `IIssuePropertyStore` interface (after the existing `upsertIssueValues` in the Actions section):

```typescript
createDefinition: (workspaceSlug: string, data: Partial<IIssuePropertyDefinition>) => Promise<IIssuePropertyDefinition>;
updateDefinition: (workspaceSlug: string, propertyId: string, data: Partial<IIssuePropertyDefinition>) =>
  Promise<IIssuePropertyDefinition>;
deleteDefinition: (workspaceSlug: string, propertyId: string) => Promise<void>;
```

In the `makeObservable` call in the constructor, add:

```typescript
createDefinition: action,
updateDefinition: action,
deleteDefinition: action,
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to the interface additions (may have other pre-existing errors).

**Commit:** `feat(web): add CRUD action signatures to IssuePropertyStore interface`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Implement CRUD actions with optimistic updates

**Verifies:** hw-settings-e2e.AC4.1, hw-settings-e2e.AC4.2, hw-settings-e2e.AC4.3

**Files:**

- Modify: `apps/web/hw/store/issue-property.store.ts` (add method implementations)

**Implementation:**

Add three new methods to the `IssuePropertyStore` class, following the optimistic update pattern from `IssueTypeStore` (see `updateIssueType` at lines 160-189 and `deleteIssueType` at lines 191-210 for the pattern):

**`createDefinition`** — no optimistic update needed (item doesn't exist yet):

```typescript
async createDefinition(
  workspaceSlug: string,
  data: Partial<IIssuePropertyDefinition>
): Promise<IIssuePropertyDefinition> {
  try {
    const definition = await this.service.createPropertyDefinition(workspaceSlug, data);
    runInAction(() => {
      this.definitionsMap.set(definition.id, definition);
    });
    return definition;
  } catch (error: unknown) {
    runInAction(() => {
      if (error instanceof Error) {
        this.error = error.message;
      } else if (error && typeof error === "object" && "message" in error) {
        this.error = String((error as { message: unknown }).message) || "Failed to create property definition";
      } else {
        this.error = "Failed to create property definition";
      }
    });
    throw error;
  }
}
```

**`updateDefinition`** — optimistic update with rollback:

```typescript
async updateDefinition(
  workspaceSlug: string,
  propertyId: string,
  data: Partial<IIssuePropertyDefinition>
): Promise<IIssuePropertyDefinition> {
  const originalData = this.definitionsMap.get(propertyId);
  try {
    // Optimistic update
    if (originalData) {
      runInAction(() => {
        this.definitionsMap.set(propertyId, { ...originalData, ...data } as IIssuePropertyDefinition);
      });
    }

    const definition = await this.service.updatePropertyDefinition(workspaceSlug, propertyId, data);
    runInAction(() => {
      this.definitionsMap.set(propertyId, definition);
    });
    return definition;
  } catch (error: unknown) {
    // Rollback on error
    runInAction(() => {
      if (originalData) {
        this.definitionsMap.set(propertyId, originalData);
      }
      if (error instanceof Error) {
        this.error = error.message;
      } else if (error && typeof error === "object" && "message" in error) {
        this.error = String((error as { message: unknown }).message) || "Failed to update property definition";
      } else {
        this.error = "Failed to update property definition";
      }
    });
    throw error;
  }
}
```

**`deleteDefinition`** — optimistic delete with rollback:

```typescript
async deleteDefinition(workspaceSlug: string, propertyId: string): Promise<void> {
  const originalData = this.definitionsMap.get(propertyId);
  try {
    // Optimistic delete
    runInAction(() => {
      this.definitionsMap.delete(propertyId);
    });

    await this.service.deletePropertyDefinition(workspaceSlug, propertyId);
  } catch (error: unknown) {
    // Rollback on error
    runInAction(() => {
      if (originalData) {
        this.definitionsMap.set(propertyId, originalData);
      }
      if (error instanceof Error) {
        this.error = error.message;
      } else if (error && typeof error === "object" && "message" in error) {
        this.error = String((error as { message: unknown }).message) || "Failed to delete property definition";
      } else {
        this.error = "Failed to delete property definition";
      }
    });
    throw error;
  }
}
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to the store changes.

**Commit:** `feat(web): implement CRUD actions in IssuePropertyStore with optimistic updates`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->

### Task 3: Add HW settings routes to extended.ts

**Verifies:** hw-settings-e2e.AC2.7, hw-settings-e2e.AC2.8

**Files:**

- Modify: `apps/web/app/routes/extended.ts` (currently empty array, add HW routes)

**Implementation:**

The file currently exports `extendedRoutes: RouteConfigEntry[] = []`. These routes get merged with `coreRoutes` via `mergeRoutes()` in the routes index.

Looking at the core routes structure (in `core.ts` lines 258-349), the settings section uses nested layouts:

```
layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
  layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
    // workspace settings routes...
  ]),
  layout("./(all)/[workspaceSlug]/(settings)/settings/projects/layout.tsx", [
    layout("./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx", [
      // project settings routes...
    ]),
  ]),
])
```

The extended routes need to merge INTO this existing layout hierarchy. Using `mergeRoutes()`, we provide routes with the same layout `file` keys so they merge correctly.

> **Before writing the routes:** Read `apps/web/app/routes/core.ts` and copy the exact layout file path strings for the settings section (lines 258-349) to ensure `mergeRoutes()` deep-merges correctly. Mismatched file strings will cause routes to be added as new layouts instead of merging into existing ones.

```typescript
import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

export const extendedRoutes: RouteConfigEntry[] = [
  // HW Settings routes - merged into the core settings layout hierarchy
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        // Workspace issue types settings (under workspace settings layout)
        layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
          route(
            ":workspaceSlug/settings/issue-types",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/issue-types/page.tsx"
          ),
        ]),
        // Project issue types settings (under project settings layout)
        layout("./(all)/[workspaceSlug]/(settings)/settings/projects/layout.tsx", [
          layout("./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx", [
            route(
              ":workspaceSlug/settings/projects/:projectId/issue-types",
              "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/issue-types/page.tsx"
            ),
          ]),
        ]),
      ]),
    ]),
  ]),
];
```

This structure ensures `mergeRoutes()` deep-merges HW routes into the existing layout tree via matching `file` keys.

**Note:** The page components referenced here (`issue-types/page.tsx`) don't exist yet — they will be created in Phases 3 and 4. For now, create placeholder files so the route config doesn't break the build.

Create placeholder page files:

**File: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/issue-types/page.tsx`**

```typescript
export default function WorkspaceIssueTypesSettingsPage() {
  return <div data-test="issue-type-list">Issue types settings — coming soon</div>;
}
```

**File: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/issue-types/page.tsx`**

```typescript
export default function ProjectIssueTypesSettingsPage() {
  return <div data-test="project-issue-type-list">Project issue types settings — coming soon</div>;
}
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors related to the route definitions.

Navigate to `http://localhost:3000/{workspaceSlug}/settings/issue-types` — should show the placeholder text.

**Commit:** `feat(web): add HW settings routes for issue types`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Create CE sidebar re-exports for project and workspace settings

**Verifies:** hw-settings-e2e.AC2.10

**Files:**

- Create: `apps/web/ce/components/settings/project/sidebar/item-categories.tsx`
- Create: `apps/web/ce/components/settings/workspace/sidebar/item-categories.tsx`

**Implementation:**

The CE layer re-exports the core component unchanged. This allows the HW layer to override it without modifying upstream packages.

> **Note:** Create the full directory paths if they do not exist. The `ce/components/settings/project/sidebar/` and `ce/components/settings/workspace/sidebar/` directories may need to be created.

**File: `apps/web/ce/components/settings/project/sidebar/item-categories.tsx`**

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export { ProjectSettingsSidebarItemCategories } from "@/components/settings/project/sidebar/item-categories";
```

**File: `apps/web/ce/components/settings/workspace/sidebar/item-categories.tsx`**

```typescript
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export { WorkspaceSettingsSidebarItemCategories } from "@/components/settings/workspace/sidebar/item-categories";
```

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

**Commit:** `chore(web): add CE re-exports for settings sidebar item-categories`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Create HW sidebar overrides with issue-types entries

**Verifies:** hw-settings-e2e.AC2.7, hw-settings-e2e.AC2.8, hw-settings-e2e.AC2.10

**Files:**

- Create: `apps/web/hw/components/settings/project/sidebar/item-categories.tsx`
- Create: `apps/web/hw/components/settings/workspace/sidebar/item-categories.tsx`

**Implementation:**

The HW sidebar overrides extend the core sidebar with an "Issue types" entry. Since AC2.10 forbids modifying `packages/constants/`, the HW components import the core constants and extend them at render time.

**Workspace sidebar** (`apps/web/hw/components/settings/workspace/sidebar/item-categories.tsx`):

This component mirrors the structure of `core/components/settings/workspace/sidebar/item-categories.tsx` but injects an "Issue types" item into the FEATURES category. Import `GROUPED_WORKSPACE_SETTINGS`, `WORKSPACE_SETTINGS_CATEGORIES` from `@plane/constants`, create a local copy with the extra item, and render using the same `SettingsSidebarItem` component.

The issue-types entry should:

- Key: `"issue-types"`
- Label: `"Issue types"` (or use i18n key if available, otherwise hardcode)
- Href: `/settings/issue-types`
- Access: `[EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST]` (read-only for non-admins)
- Category: `WORKSPACE_SETTINGS_CATEGORY.FEATURES`

**Project sidebar** (`apps/web/hw/components/settings/project/sidebar/item-categories.tsx`):

Same pattern — extend `GROUPED_PROJECT_SETTINGS` with an issue-types entry under the appropriate category.

The issue-types entry should:

- Key: `"issue-types"`
- Label: `"Issue types"`
- Href: `/issue-types`
- Access: `[EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST]`

Both components should follow the exact same rendering logic as their core counterparts, with the extended settings constants.

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Navigate to workspace settings sidebar — should show "Issue types" link under Features.
Navigate to project settings sidebar — should show "Issue types" link.

**Commit:** `feat(web): add HW sidebar overrides with issue-types entries`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_6 -->

### Task 6: Wire layout imports to use plane-web overlay

**Verifies:** hw-settings-e2e.AC2.7, hw-settings-e2e.AC2.8

**Files:**

- Modify: `apps/web/core/components/settings/project/sidebar/root.tsx` (or wherever `ProjectSettingsSidebarItemCategories` is imported)
- Modify: `apps/web/core/components/settings/workspace/sidebar/root.tsx` (or wherever `WorkspaceSettingsSidebarItemCategories` is imported)

**Implementation:**

> **Design plan deviation:** The design plan references changing the layout file import. In the actual codebase, the `item-categories` import lives in the sidebar root components (`root.tsx`), not the layout file. This task correctly targets the sidebar root components where the import actually occurs.

Find the root sidebar components that import `ProjectSettingsSidebarItemCategories` and `WorkspaceSettingsSidebarItemCategories`. Change their imports from:

```typescript
import { ProjectSettingsSidebarItemCategories } from "./item-categories";
```

to:

```typescript
import { ProjectSettingsSidebarItemCategories } from "@/plane-web/components/settings/project/sidebar/item-categories";
```

And similarly for workspace:

```typescript
import { WorkspaceSettingsSidebarItemCategories } from "@/plane-web/components/settings/workspace/sidebar/item-categories";
```

The `@/plane-web/` alias resolves to `hw/` in the HW build (per tsconfig.json paths: `"@/plane-web/*": ["./hw/*"]`), so:

- HW build picks up `hw/components/settings/project/sidebar/item-categories.tsx` (extended)
- CE build picks up `ce/components/settings/project/sidebar/item-categories.tsx` (re-export of core)

**Verification:**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No type errors.

Navigate to workspace settings — sidebar should show "Issue types" under Features.
Navigate to project settings for any project — sidebar should show "Issue types".

**Commit:** `feat(web): wire sidebar imports through CE/HW overlay for issue-types`

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->

### Task 7: Verify end-to-end infrastructure

**Verifies:** hw-settings-e2e.AC2.7, hw-settings-e2e.AC2.8, hw-settings-e2e.AC2.10

**Files:**

- No file changes — verification only

**Implementation:**

Verify the complete infrastructure chain works:

1. **AC2.8 — Workspace sidebar**: Navigate to `/{workspaceSlug}/settings/` — the sidebar should show an "Issue types" entry under the Features category.
2. **AC2.7 — Project sidebar**: Navigate to `/{workspaceSlug}/settings/projects/{projectId}/` — the sidebar should show an "Issue types" entry.
3. **AC2.10 — No upstream changes**: Run `git diff --name-only packages/` and confirm no files in `packages/` are modified.
4. **Routes work**: Click the "Issue types" sidebar links — they should navigate to the placeholder pages.
5. **Build succeeds**: Run `pnpm build` or `pnpm check:types` to verify the full build passes.

```bash
# Verify no upstream package modifications
git diff --name-only -- packages/

# Type check
cd apps/web && pnpm check:types
```

Expected: No files in `packages/` modified. Type check passes.

**Commit:** No commit — verification only.

<!-- END_TASK_7 -->
