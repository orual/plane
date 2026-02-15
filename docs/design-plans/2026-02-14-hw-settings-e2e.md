# HW Settings Pages and E2E Testing Design

## Summary

Unblocks local development and adds issue type/property management UI by: (1) adding a Django DEBUG-only reverse proxy that routes `/uploads/*` to MinIO, fixing project creation and file uploads without a separate proxy container; (2) building workspace and project settings pages for issue type CRUD and project linking via the CE/HW overlay system, with property definitions managed in a side panel; (3) filling the `IssuePropertyStore` CRUD gap; and (4) replacing broken E2E tests with smoke and critical-path tests that exercise real UI flows and verify persistence via API.

## Definition of Done

1. **Django dev middleware** proxies `/uploads/*` requests to MinIO when `DEBUG=True`, unblocking project creation and all file uploads in local development without a separate proxy container.

2. **Settings pages for issue types and properties** — Workspace-level settings page for issue type CRUD. Project-level settings page for linking/unlinking issue types to a project. Property definitions managed within the issue type detail view. All integrated using an HW override mechanism that does not modify upstream shared packages (`packages/constants`, `packages/types`).

3. **E2E smoke and critical path tests** — Smoke tests confirming settings pages load and key elements render. Critical path tests for creating an issue type through the UI, viewing associated properties on a type, and selecting a type when creating an issue. API verification that UI actions persist data. All runnable against the local dev stack.

4. **IssuePropertyStore gap filled** — Add create, update, and delete actions for property definitions to the MobX store (currently only fetches).

**Out of scope:** Full CRUD lifecycle E2E tests (edit, delete, project linking/unlinking), upstream contribution of proxy fix, mobile/responsive testing.

## Acceptance Criteria

### DoD 1: Django dev middleware proxies `/uploads/*` to MinIO

**hw-settings-e2e.AC1.1** — With `DEBUG=True`, a GET request to `http://localhost:8000/uploads/{any-valid-path}` returns the corresponding object from MinIO with correct `Content-Type` and status 200.

**hw-settings-e2e.AC1.2** — With `DEBUG=True`, a HEAD request to the same URL returns headers without a body.

**hw-settings-e2e.AC1.3** — With `DEBUG=False`, requests to `/uploads/*` are never routed to the proxy view (URL pattern not registered or view returns 403).

**hw-settings-e2e.AC1.4** — Paths containing `..` are rejected by the URL regex and never reach the view.

**hw-settings-e2e.AC1.5** — POST/PUT/DELETE requests to `/uploads/*` return 405 Method Not Allowed.

**hw-settings-e2e.AC1.6** — When MinIO is unreachable, the proxy returns 502; when MinIO times out, it returns 504. Both are logged.

**hw-settings-e2e.AC1.7** — Project creation succeeds in the local dev stack (cover image upload completes without 404).

### DoD 2: Settings pages for issue types and properties

**hw-settings-e2e.AC2.1** — Navigating to `/{workspaceSlug}/settings/issue-types` renders the workspace issue types list page with the `data-test="issue-type-list"` container.

**hw-settings-e2e.AC2.2** — An ADMIN user can create an issue type via the UI (name, description, color) and the new type appears in the list.

**hw-settings-e2e.AC2.3** — Clicking an issue type in the list opens a side panel (`data-test="issue-type-side-panel"`) showing the type's details and associated properties.

**hw-settings-e2e.AC2.4** — An ADMIN user can create a property definition within the side panel and it appears in the property list.

**hw-settings-e2e.AC2.5** — Navigating to `/{workspaceSlug}/settings/projects/{projectId}/issue-types` renders the project issue types linking page.

**hw-settings-e2e.AC2.6** — An ADMIN user can toggle issue types on/off for a project, and the linked/unlinked state persists across page reloads.

**hw-settings-e2e.AC2.7** — The project settings sidebar shows an "Issue types" entry under the correct category, linking to the project issue types page.

**hw-settings-e2e.AC2.8** — The workspace settings sidebar shows an "Issue types" entry linking to the workspace issue types page.

**hw-settings-e2e.AC2.9** — Non-ADMIN users see the settings pages in read-only mode (action buttons hidden, no create/edit/delete).

**hw-settings-e2e.AC2.10** — No files in `packages/constants/`, `packages/types/`, or other upstream shared packages are modified.

### DoD 3: E2E smoke and critical path tests

**hw-settings-e2e.AC3.1** — `issue-types-create.spec.ts` and `properties-management.spec.ts` are deleted (they test non-existent routes).

**hw-settings-e2e.AC3.2** — Smoke tests verify both settings pages load and key elements render.

**hw-settings-e2e.AC3.3** — A critical path test creates an issue type through the UI and verifies persistence via API fetch.

**hw-settings-e2e.AC3.4** — A critical path test creates a property on an issue type through the UI and verifies persistence via API fetch.

**hw-settings-e2e.AC3.5** — A critical path test selects an issue type when creating an issue and verifies the issue's `type_id` via API fetch.

**hw-settings-e2e.AC3.6** — All new components use `data-test` attributes following the documented convention.

**hw-settings-e2e.AC3.7** — All E2E tests pass when run against the local dev stack (`docker-compose-local.yml` + `pnpm dev`).

### DoD 4: IssuePropertyStore CRUD gap filled

**hw-settings-e2e.AC4.1** — `IssuePropertyStore` exposes `createDefinition()`, `updateDefinition()`, and `deleteDefinition()` actions.

**hw-settings-e2e.AC4.2** — Each action calls the corresponding method on `IssuePropertyService` and updates the observable `definitionsMap`.

**hw-settings-e2e.AC4.3** — `updateDefinition()` and `deleteDefinition()` use optimistic updates with rollback on API error, matching the pattern in `IssueTypeStore`.

## Glossary

| Term                      | Definition                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CE/HW overlay**         | The build-time module resolution system where `@/plane-web/` resolves to `hw/` in the HW fork or `ce/` in the community edition. Components in `hw/` override those in `ce/`, which re-export from `core/`. |
| **Issue type**            | A workspace-level entity defining a category of issue (e.g., Bug, Feature, Task). Managed via `IssueTypeStore`. Can be linked to projects.                                                                  |
| **Property definition**   | A workspace-level schema describing a custom field (name, type, options) that can be associated with an issue type via `issue_type_id`. Managed via `IssuePropertyStore`.                                   |
| **Property value**        | An issue-scoped instance of a property definition holding the actual data for a specific issue.                                                                                                             |
| **Project linking**       | The act of associating a workspace-level issue type with a specific project so issues in that project can use that type.                                                                                    |
| **Side panel**            | The right-column detail view that opens when an issue type is selected in the workspace settings list, showing type details and associated properties.                                                      |
| **Optimistic update**     | Updating the MobX observable store immediately before the API call completes, then rolling back if the call fails.                                                                                          |
| **`data-test` attribute** | HTML attribute added to components for stable E2E test selectors, following the convention `data-test="{entity}-{action}"`.                                                                                 |
| **Upload proxy**          | A DEBUG-only Django view that reverse-proxies `/uploads/*` requests to MinIO, replacing the Caddy proxy that is commented out in the local dev Docker Compose.                                              |
| **`extended.ts`**         | The route definition file at `apps/web/app/routes/extended.ts` designed for HW-specific routes, merged into core routes via `mergeRoutes()`.                                                                |

---

## Architecture

### Workstream 1: Upload Proxy

A Django view in `plane.hw` that proxies `/uploads/*` to MinIO in local dev.

**URL pattern**: `re_path(r'^uploads/(?P<path>[\w\-./]+)$', proxy_minio_upload)` added to `plane/urls.py` inside a `if settings.DEBUG:` guard.

**View** (`apps/api/plane/hw/views/proxy.py`):

- Accepts GET and HEAD only
- Uses `requests.get(minio_url, stream=True)` with 30s timeout
- Returns `StreamingHttpResponse` with 8KB chunked content
- Passes through: `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Cache-Control`, `Content-Disposition`
- MinIO URL: `{settings.AWS_S3_ENDPOINT_URL}/uploads/{path}` (already `http://plane-minio:9000` in Docker)
- Returns 502 on connection error, 504 on timeout, logs both
- No new dependencies (`requests` already in `apps/api/requirements/base.txt`)

**URL wiring** (`apps/api/plane/urls.py`):

```python
if settings.DEBUG:
    urlpatterns += [
        re_path(r'^uploads/(?P<path>[\w\-./]+)$', proxy_minio_upload),
    ]
```

**Security boundaries**:

- `if not settings.DEBUG: return HttpResponseForbidden()` as first line of view (defense in depth beyond URL guard)
- Path regex constrains to `[\w\-./]+` — prevents directory traversal with `..`
- Only GET/HEAD methods — no write operations through proxy
- Explicit timeout on upstream request

### Workstream 2: Settings Pages

#### 2A. HW Sidebar Override (CE Abstraction Layer)

The project settings sidebar currently imports from `@/components/settings/project/sidebar` (resolves to `core/`). To use the HW override, we route through the CE/HW overlay system.

**Step 1 — CE abstraction**: Create `ce/components/settings/project/sidebar/item-categories.tsx` that re-exports the core version:

```typescript
export { ProjectSettingsSidebarItemCategories } from "@/components/settings/project/sidebar/item-categories";
```

**Step 2 — HW override**: Create `hw/components/settings/project/sidebar/item-categories.tsx` that extends the core constants with issue type and property entries. This component:

- Imports `PROJECT_SETTINGS_CATEGORIES`, `GROUPED_PROJECT_SETTINGS` from `@plane/constants`
- Defines HW-specific additions (issue-types under WORK_STRUCTURE category)
- Merges them at render time
- Uses the same `SettingsSidebarItem` component as core

**Step 3 — Wire the import**: The app layout for project settings (`app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx`) needs its sidebar import changed from `@/components/settings/project/sidebar` to `@/plane-web/components/settings/project/sidebar`. This is one line, and the CE abstraction ensures the CE build still works.

Similarly for workspace settings sidebar — add an "Issue types" entry that links to the workspace-level issue types page.

**Files created/modified**:

- NEW: `apps/web/ce/components/settings/project/sidebar/item-categories.tsx` (re-export)
- NEW: `apps/web/hw/components/settings/project/sidebar/item-categories.tsx` (extended)
- NEW: `apps/web/hw/components/settings/project/sidebar/item-icon.tsx` (adds icons for issue-types)
- MODIFIED: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/layout.tsx` (import path change)

#### 2B. Route Definitions

Add routes in `apps/web/app/routes/extended.ts` (currently empty, designed for HW-specific routes):

**Workspace-level**:

- `/:workspaceSlug/settings/issue-types` — Issue type list + CRUD page

**Project-level**:

- `/:workspaceSlug/settings/projects/:projectId/issue-types` — Project issue type linking page

Routes reference page components in `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/` following the same directory layout pattern as labels/states.

#### 2C. Workspace Issue Types Settings Page

**Route**: `/:workspaceSlug/settings/issue-types`

**Layout**: Two-column — list on left, side panel on right.

**List view** (left column):

- Fetches from `issueTypeStore.fetchIssueTypes(workspaceSlug)` on mount
- Renders each issue type as a row: color dot + name + description excerpt
- "Add issue type" button at top (ADMIN only, via `allowPermissions`)
- Click a type to open side panel
- Each row has a kebab menu with Edit and Delete actions
- Delete opens confirmation modal (warns if issues reference the type)

**Side panel** (right column, appears when a type is selected):

- Shows full issue type details: name, description, color, is_default, is_active
- Below the details: **Properties section** listing property definitions associated with this type (`issue_type_id` filter)
- "Add property" button within the panel
- Each property shows: name, type badge, required indicator
- Click a property to edit inline
- Delete property via kebab menu with confirmation

**Create/Edit form** (modal):

- Fields: name (required), description, color picker, is_default toggle
- On create: calls `issueTypeStore.createIssueType()`
- On edit: calls `issueTypeStore.updateIssueType()`

**Property create/edit** (inline form within side panel):

- Fields: name (required), property_type dropdown (text/number/select/multi_select/url/date/boolean), is_required toggle
- For select/multi_select: options editor (add/remove string options)
- On create: calls `issuePropertyStore.createDefinition()` (new action)
- On edit: calls `issuePropertyStore.updateDefinition()` (new action)

**Components** (all in `apps/web/hw/components/settings/issue-types/`):

- `root.tsx` — Page root, manages selected type state
- `list.tsx` — Type list with search/filter
- `list-item.tsx` — Individual type row
- `side-panel.tsx` — Detail panel with properties
- `create-update-modal.tsx` — Type create/edit modal
- `property-list.tsx` — Properties within side panel
- `property-form.tsx` — Inline property editor
- `delete-modal.tsx` — Delete confirmation

**Headers** (in same directory or app layer):

- `header.tsx` — Breadcrumb with SettingsPageHeader pattern

#### 2D. Project Issue Types Settings Page

**Route**: `/:workspaceSlug/settings/projects/:projectId/issue-types`

**Simpler than workspace page** — this is about linking/unlinking, not CRUD.

**Layout**: Single column list.

**Content**:

- Fetches workspace issue types and project issue types on mount
- Shows all workspace types with a toggle or checkbox for each: linked/unlinked to this project
- Toggling calls `issueTypeStore.linkProjectIssueType()` or `unlinkProjectIssueType()`
- Shows which type is the default for this project
- Option to set a different type as project default

**Components** (in `apps/web/hw/components/settings/project-issue-types/`):

- `root.tsx` — Page root
- `type-link-item.tsx` — Row with toggle

#### 2E. IssuePropertyStore CRUD Gap

The `IssuePropertyStore` at `apps/web/hw/store/issue-property.store.ts` currently only has `fetchDefinitions()`, `fetchIssueValues()`, and `upsertIssueValues()`. Add:

- `createDefinition(workspaceSlug, data)` — POST via service, add to `definitionsMap`
- `updateDefinition(workspaceSlug, propertyId, data)` — PATCH via service, update in `definitionsMap`, optimistic with rollback
- `deleteDefinition(workspaceSlug, propertyId)` — DELETE via service, remove from `definitionsMap`, optimistic with rollback

The `IssuePropertyService` at `apps/web/hw/services/issue-property.service.ts` already has `createPropertyDefinition()`, `updatePropertyDefinition()`, `deletePropertyDefinition()` methods. The store just needs to call them and manage the observable state.

### Workstream 3: E2E Tests

#### 3A. Test Infrastructure Fixes

Before writing new tests, fix the existing infrastructure:

- **Remove tests for non-existent routes**: Delete `issue-types-create.spec.ts` (navigates to `/settings/issue-types` which won't exist at workspace settings level in the same URL pattern) and `properties-management.spec.ts` (navigates to `/settings/properties` which won't exist). These will be rewritten.
- **Add `data-test` attributes** to all new HW settings components. Convention: `data-test="issue-type-{action}"`, `data-test="property-{action}"`. Examples: `data-test="issue-type-list"`, `data-test="issue-type-create-btn"`, `data-test="issue-type-side-panel"`, `data-test="property-add-btn"`.
- **Keep** `issue-types-switching.spec.ts` and `issue-types-filtering.spec.ts` — these test real components that exist. Update their selectors to use `data-test` attributes once added.

#### 3B. Smoke Tests (Pages Load)

New file: `e2e/tests/settings-pages-smoke.spec.ts`

Tests:

1. **Workspace issue types settings page loads** — Navigate to `/{workspaceSlug}/settings/issue-types`, verify page title and list container render (`data-test="issue-type-list"`)
2. **Project issue types settings page loads** — Navigate to project settings issue types page, verify link/unlink UI renders
3. **Side panel opens** — Create an issue type via API, navigate to workspace settings, click the type, verify side panel opens (`data-test="issue-type-side-panel"`)

#### 3C. Critical Path Tests

New file: `e2e/tests/issue-type-crud.spec.ts`

Tests:

1. **Create issue type through UI** — Navigate to workspace settings → Click "Add issue type" → Fill form (name, description, color) → Submit → Verify type appears in list → Verify via API that type was persisted
2. **View properties on issue type** — Create issue type + property via API → Navigate to settings → Click type → Verify side panel shows the property
3. **Create property on issue type** — Navigate to settings → Click type → Click "Add property" in side panel → Fill form → Submit → Verify property appears → Verify via API

New file: `e2e/tests/issue-type-selection.spec.ts`

Tests:

1. **Select issue type when creating issue** — Create issue types via API, link to project → Navigate to project issues → Open create issue modal → Verify type dropdown shows linked types → Select a type → Create issue → Verify via API that issue has correct type_id

#### 3D. API Verification Pattern

Tests follow a consistent pattern:

```
1. Setup via API (fixtures create workspace, project, auth session)
2. Perform action through UI (navigate, click, fill, submit)
3. Verify UI reflects change (element appears/disappears)
4. Verify via API that data persisted (fetch from API, assert values)
```

This "UI action + API verification" pattern catches cases where the UI looks right but didn't actually persist.

#### 3E. Test Data Attributes Convention

All new components get `data-test` attributes following this convention:

- Lists: `data-test="{entity}-list"` (e.g., `issue-type-list`)
- Items: `data-test="{entity}-item-{id}"` or `data-test="{entity}-item"` for generic
- Buttons: `data-test="{entity}-{action}-btn"` (e.g., `issue-type-create-btn`)
- Forms: `data-test="{entity}-form"`
- Inputs: `data-test="{entity}-{field}-input"` (e.g., `issue-type-name-input`)
- Panels: `data-test="{entity}-side-panel"`
- Modals: `data-test="{entity}-{action}-modal"` (e.g., `issue-type-delete-modal`)

---

## Existing Patterns Followed

| Pattern                              | Source                                                                  | Applied To                                       |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Settings page template               | `apps/web/app/(all)/.../labels/page.tsx`                                | Issue type and project issue type settings pages |
| Settings header with breadcrumbs     | `apps/web/app/(all)/.../labels/header.tsx`                              | Issue type settings header                       |
| Sidebar item-categories              | `apps/web/core/components/settings/project/sidebar/item-categories.tsx` | HW sidebar override                              |
| CE/HW overlay (re-export + override) | `apps/web/hw/components/issues/` pattern                                | Sidebar component override                       |
| MobX store CRUD pattern              | `apps/web/hw/store/issue-type.store.ts`                                 | Property store CRUD additions                    |
| Observer + permission check          | All existing settings pages                                             | New settings pages                               |
| Extended routes merging              | `apps/web/app/routes/helper.ts` mergeRoutes()                           | Adding HW routes in extended.ts                  |
| E2E fixture pattern                  | `e2e/fixtures/index.ts`                                                 | Test setup reuse                                 |

---

## Implementation Phases

### Phase 1: Upload Proxy

- Create `apps/api/plane/hw/views/proxy.py` with the proxy view
- Wire into `plane/urls.py` with DEBUG guard
- Verify: project creation works in local dev (cover image uploads succeed)

### Phase 2: Store Gap + Route Infrastructure

- Add CRUD actions to `IssuePropertyStore`
- Add routes to `apps/web/app/routes/extended.ts`
- Create CE abstraction for sidebar
- Create HW sidebar override with issue-types entry
- Wire the layout import change
- Verify: sidebar shows issue-types link, routes resolve to placeholder pages

### Phase 3: Workspace Issue Types Settings Page

- Create all components in `hw/components/settings/issue-types/`
- Implement list view, side panel, create/edit modal
- Implement property list and inline form within side panel
- Add `data-test` attributes to all components
- Verify: full CRUD workflow works in browser

### Phase 4: Project Issue Types Settings Page

- Create components in `hw/components/settings/project-issue-types/`
- Implement link/unlink toggle list
- Add `data-test` attributes
- Verify: linking/unlinking works in browser

### Phase 5: E2E Tests

- Fix existing test infrastructure (remove broken tests, update selectors)
- Write smoke tests for page loading
- Write critical path tests (create type, view properties, create property, select type on issue)
- Verify: all tests pass against local dev stack

---

## Additional Considerations

### Data test attributes and upstream

Adding `data-test` attributes is a code change to HW components only (since all new settings components live in `hw/`). The existing components that need `data-test` updates (issue type switcher, filter, select) also live in `hw/`. No upstream component modifications needed.

### Property definitions and issue types

Property definitions have an optional `issue_type_id` FK. When viewing a type's properties in the side panel, we filter by `issue_type_id`. Properties with `issue_type_id = null` are "global" properties not tied to any type. The current design shows only type-specific properties in the side panel. Global properties could be surfaced later as a separate section or a dedicated page.

### Optimistic updates and error recovery

The `IssueTypeStore` already implements optimistic updates with rollback on error. The new `IssuePropertyStore` CRUD actions should follow the same pattern: update the observable map immediately, revert on API error, show toast notification.

### E2E test isolation

Each test creates its own workspace and project via fixtures. Tests don't share state. This is slower but prevents order dependencies and flaky interactions between tests.

### Permissions

All new settings pages check permissions via `allowPermissions()`:

- Workspace issue type CRUD: ADMIN role at workspace level
- Project issue type linking: ADMIN role at project level
- Property CRUD: follows the parent issue type's permission (workspace ADMIN)
- Viewing: ADMIN, MEMBER, GUEST (read-only rendering with action buttons hidden)
