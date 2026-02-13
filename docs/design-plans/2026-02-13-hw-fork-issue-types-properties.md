# Hardware-aware fork: issue types, custom properties, and dev environment

## Summary

This design implements a hardware-focused fork of the Plane project management system, adding issue type categorization and custom properties tailored for hardware development workflows. The implementation leverages Plane's existing Community Edition overlay pattern: all frontend changes live in a copied `hw/` directory that replaces CE stubs via TypeScript path aliases, while backend changes are isolated in a new `plane.hw` Django app. This architecture minimizes merge conflicts with upstream — only three upstream files are modified (tsconfig path alias, URL routing, and installed apps), with all feature code in new directories.

The system introduces workspace-level issue types (Design, Electrical, Mechanical, Software, Hardware) that projects can enable, and per-issue-type custom property schemas stored in normalized database tables. Users can categorize issues by type, attach type-specific metadata (e.g., schematic link, part number, PCB revision), and filter by type in list views. The development environment uses a Nix flake providing all tooling, while existing Docker Compose infrastructure continues to provide data services. A comprehensive test suite spans pytest contract tests for API endpoints, Vitest tests for frontend state management, and Playwright E2E tests for critical user journeys.

## Definition of Done

1. **Dev environment**: A `flake.nix` providing Node.js 22.18+, pnpm 10.24, Python 3.12, Ruff, Docker, and docker-compose directly via nixpkgs. `.mise.toml` coexists for non-NixOS contributors. `.envrc` with `use flake` for direnv integration. Playwright browser dependencies included for E2E testing.

2. **Fork infrastructure**: A clean `hw` branch off `preview` with all `ce/` files copied to `hw/`, `tsconfig.json` path alias changed to `"@/plane-web/*": ["./hw/*"]`, and the `plane.hw` Django app wired in. Three upstream files modified: `apps/web/tsconfig.json` (path alias), `apps/api/plane/urls.py` (include hw URLs), `apps/api/plane/settings/common.py` (INSTALLED_APPS). All other changes in new directories (`apps/web/hw/`, `apps/api/plane/hw/`).

3. **IssueType API + frontend**: CRUD endpoints for workspace-scoped `IssueType` and project-scoped `ProjectIssueType`, using the existing database model. Frontend components replacing CE stubs: issue type switcher in detail header, issue type select in creation modal, filter and applied-filter components. Five default types seeded: Design, Electrical, Mechanical, Software, Hardware.

4. **Custom properties model + API + frontend**: `IssuePropertyDefinition` and `IssuePropertyValue` normalized tables in the `hw_*` namespace. CRUD API endpoints with type-aware validation and a bulk upsert endpoint. Frontend sidebar rendering of per-issue-type custom fields (text, number, select, multi-select, URL, date, boolean). Predefined property schemas seeded as additive defaults (all optional) for each issue type plus universal properties (Branch, PR Link, Revision).

5. **Comprehensive test suite**: Backend pytest unit + contract tests for all new API endpoints. Frontend Vitest component and store tests. Playwright E2E tests for critical user journeys against a running dev instance.

**Success criteria:**
- `pnpm build` succeeds with the `hw/` overlay
- All new API endpoints return correct responses for CRUD operations, permission checks, and edge cases
- Frontend components render and function in the issue detail sidebar, creation modal, and filter panels
- All tests pass (existing upstream + new hw tests + E2E)
- Clean git history with atomic commits on the `hw` branch

**Out of scope:**
- KiCad preview pipeline (Phase 3 of the broader plan)
- AI provider updates (Phase 4)
- Production deployment, polish, and activity tracking (Phase 5)
- Workspace admin UI for managing issue type and property schemas

## Glossary

- **CE (Community Edition)**: Plane's open-source core. Commercial features are implemented as "overlays" that replace CE stub files via TypeScript path aliases.
- **hw overlay**: The hardware fork's frontend implementation strategy — a full copy of the `ce/` directory with ~20 modified files implementing hardware features and ~260 unmodified stubs.
- **Django app**: A self-contained Python package within a Django project, encapsulating models, views, serializers, and URLs for a logical domain. `plane.hw` is our new app; `plane.db` and `plane.app` are existing upstream apps.
- **ViewSet**: Django REST Framework's class-based view pattern for CRUD operations. Each ViewSet method (list, create, update, destroy) maps to an HTTP verb.
- **BaseViewSet**: Plane's abstract base class for ViewSets, providing workspace/project filtering, membership checks, and soft-delete handling. Located in `apps/api/plane/app/views/base.py`.
- **MobX**: JavaScript reactive state management library. Observable data triggers automatic re-renders in React components. Plane uses it for client-side caching and data synchronization.
- **APIService**: Plane's base class for frontend API client wrappers, providing typed methods for HTTP requests. Defined in `@plane/services`.
- **Soft deletion**: Database pattern where deletes set a `deleted_at` timestamp instead of removing rows. Default queries filter out soft-deleted records.
- **Factory Boy**: Python library for generating test data via factory classes. `UserFactory.create()` builds a User with sensible defaults; attributes can be overridden.
- **pytest markers**: Decorators categorizing tests (`@pytest.mark.unit`, `@pytest.mark.contract`). Enables selective test execution via `pytest -m unit`.
- **JSONField**: Django/PostgreSQL field type storing structured data as JSON. Used for flexible property options lists and property values.
- **Normalized tables**: Database design storing each fact once in its own row/column, as opposed to a single JSONB column with all properties. Enables efficient filtering and sorting.
- **Nix flake**: Declarative specification for reproducible development environments. Defines exact package versions from the Nix package repository (nixpkgs).
- **direnv**: Shell extension that automatically loads environment variables from `.envrc` when entering a directory. `use flake` loads a Nix flake's development shell.
- **Playwright**: Browser automation library for E2E testing. Drives Chromium via DevTools protocol to simulate user interactions.
- **vite-tsconfig-paths**: Vite plugin that reads TypeScript path aliases from `tsconfig.json` and resolves them during bundling. Does not support multi-path fallback.
- **react-hook-form**: React library for form state management. Provides a `control` prop for integrating custom inputs into forms.
- **SWR (stale-while-revalidate)**: React hooks library for data fetching. Returns cached data immediately, then revalidates in the background.

## Architecture

### Fork overlay strategy

Plane's commercial edition uses a TypeScript path alias (`@/plane-web/*` → `./ce/*`) to swap Community Edition stubs for full implementations. The `ce/` directory contains ~280 files — most are stubs returning `<></>` or `null` with correct TypeScript interfaces, though some have real logic (stores, hooks, type definitions).

We copy all of `ce/` to `hw/` and change the path alias to resolve to `hw/`. Only the ~20 files implementing our features are modified; the rest remain identical to `ce/`. On upstream rebase, new stubs added to `ce/` are detected as build failures (core imports a file missing from `hw/`) and resolved by copying the new file.

The `vite-tsconfig-paths` plugin (v5.1.4) does not support multi-path fallback resolution, which is why copying is necessary rather than cascading `["./hw/*", "./ce/*"]`.

### Backend: self-contained Django app

All backend code lives in `apps/api/plane/hw/`, a standard Django app with its own models, serializers, views, URLs, and migrations. It references existing models from `plane.db` (IssueType, Issue, Workspace, Project) but creates new tables only in the `hw_*` namespace.

URL routing is wired via one line in the top-level `apps/api/plane/urls.py`: `path("api/", include("plane.hw.urls"))`. This keeps the hw app fully self-contained — upstream changes to how `plane.app` composes its URLs don't affect us.

### Frontend: CE stub replacement

Frontend components in `hw/` replace CE stubs via the path alias. Core components already import and render these with correct props — no changes to `core/` are needed. State management uses MobX stores following the `label.store.ts` pattern. API calls go through service classes extending `APIService` from `@plane/services`.

### Data model

IssueType and ProjectIssueType already exist in the `plane.db` schema with tables created by existing migrations. The `Issue` model has a `type` FK to `IssueType` and `Project` has `is_issue_type_enabled`. There are zero API endpoints for these models — we build the full API layer.

Custom properties use two new normalized tables:
- `hw_issue_property_definitions` — workspace-scoped property schemas (name, type, options, required flag), optionally scoped to an issue type
- `hw_issue_property_values` — one row per (issue, property_definition) pair, with a JSONField value column

Normalized tables over JSONB because: ORM-native filtering for "all issues where PCB Revision = 3.2", sortable property columns, schema-level constraints, and no future migration from JSONB to normalized.

### Testing layers

Three layers, each serving a distinct purpose:
- **pytest contract + unit** — verifies API contracts (every endpoint × every role × edge cases) and model/serializer logic
- **Vitest component + store** — verifies frontend state management and component rendering in isolation
- **Playwright E2E** — verifies critical user journeys against a running full-stack instance

### Dev environment

A Nix flake provides all dev tools (Node.js, pnpm, Python, Ruff, Playwright browsers) directly via nixpkgs. `.mise.toml` coexists for non-NixOS contributors. Infrastructure services (PostgreSQL, Redis, RabbitMQ, MinIO) remain in Docker Compose.

## Existing patterns

### Patterns followed

**ViewSet structure** — `StateViewSet` in `apps/api/plane/app/views/state/base.py` and `LabelViewSet` in `apps/api/plane/app/views/label/base.py` are the templates for our ViewSets. They inherit from `BaseViewSet`, filter queryset by `workspace__slug` and `project_id` from URL kwargs, check active membership, and use `@allow_permission` with workspace or project-level scoping.

**Permission decorator** — `@allow_permission([ROLE.ADMIN], level="WORKSPACE")` for workspace-scoped operations, default `level="PROJECT"` for project-scoped. Three roles: ADMIN (20), MEMBER (15), GUEST (5). Defined in `apps/api/plane/app/permissions/base.py`.

**Soft deletion** — `BaseModel` and `ProjectBaseModel` inherit from `SoftDeleteModel` (`apps/api/plane/db/mixins.py`). Default `objects` manager filters out `deleted_at` rows. `.delete()` sets `deleted_at` by default. `ProjectIssueType` has a unique constraint conditioned on `deleted_at__isnull=True`.

**Serializer pattern** — `BaseSerializer` in `apps/api/plane/app/serializers/base.py`. Nested detail serializers use `source="fk_field"` with `read_only=True` for reads; bare UUID accepted for writes.

**URL composition** — URL modules in `apps/api/plane/app/urls/` export `urlpatterns` lists which are spread into the main list in `__init__.py`. Full paths including `workspaces/<str:slug>/...` are explicit in each route. Our hw app uses `include()` from the top-level `urls.py` instead, to stay self-contained.

**MobX store pattern** — `label.store.ts` in `apps/web/core/store/` uses observable maps keyed by ID, actions for CRUD, computed getters filtered by project. Our `IssueTypeStore` and `IssuePropertyStore` follow this pattern.

**Service layer** — Service classes extend `APIService` from `@plane/services`, with methods returning typed promises. Constructor takes `API_BASE_URL` from `@plane/constants`.

**Test infrastructure** — pytest with `@pytest.mark.unit`, `@pytest.mark.contract` markers. Factory Boy factories in `apps/api/plane/tests/factories.py`. Fixtures for authenticated clients, workspaces, and projects in `apps/api/plane/tests/conftest.py`.

### Divergences from existing patterns

**URL wiring point** — existing modules spread into `plane/app/urls/__init__.py`. We wire via `plane/urls.py` with `include()` to keep the hw app self-contained and reduce merge conflicts. This is a minor structural divergence — the URLs resolve identically from the client's perspective.

**Model location** — existing models live in `plane.db.models`. Our new models (`IssuePropertyDefinition`, `IssuePropertyValue`) live in `plane.hw.models` with `hw_*` table prefixes. This isolates our migrations from upstream migration numbering. We reference `plane.db` models via FK but don't modify them.

## Implementation phases

<!-- START_PHASE_1 -->
### Phase 1: Dev environment and fork infrastructure

**Goal:** Working development shell on NixOS, `hw` branch created, `ce/` overlay copied, Django app scaffolded and wired, `pnpm build` succeeds.

**Components:**
- `flake.nix` at repo root — devShell with nodejs_22, pnpm, python312, ruff, playwright-driver, docker, docker-compose from nixpkgs. shellHook for Python venv activation. `PLAYWRIGHT_BROWSERS_PATH` set.
- `.envrc` at repo root — `use flake` for direnv
- `apps/web/hw/` — full copy of `apps/web/ce/` (all ~280 files)
- `apps/web/tsconfig.json` — path alias changed to `["./hw/*"]`
- `apps/api/plane/hw/` — Django app scaffold: `__init__.py`, `apps.py`, empty `models/__init__.py`, empty `views/__init__.py`, empty `serializers/__init__.py`, `urls/__init__.py` with empty urlpatterns
- `apps/api/plane/settings/common.py` — add `"plane.hw"` to INSTALLED_APPS
- `apps/api/plane/urls.py` — add `path("api/", include("plane.hw.urls"))`

**Dependencies:** None (first phase)

**Done when:** `nix develop` drops into a shell with correct tool versions. `pnpm install && pnpm build` succeeds with the hw overlay. Django starts without errors with the hw app registered. All existing upstream tests still pass.
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: IssueType backend API

**Goal:** Full CRUD API for workspace-scoped issue types and project-scoped issue type linking, with comprehensive tests.

**Components:**
- `apps/api/plane/hw/serializers/issue_type.py` — `IssueTypeSerializer` and `ProjectIssueTypeSerializer` with nested detail
- `apps/api/plane/hw/views/issue_type.py` — `IssueTypeViewSet` (workspace-scoped, ADMIN create/update/delete, MEMBER list) and `ProjectIssueTypeViewSet` (project-scoped, ADMIN create/delete, all roles list)
- `apps/api/plane/hw/urls/v1.py` — routes for issue type CRUD and project linking
- `apps/api/plane/hw/urls/__init__.py` — imports and exposes v1 patterns
- Data migration for seed types — creates Design, Electrical, Mechanical, Software, Hardware as default workspace types
- `apps/api/plane/tests/unit/hw/` — unit tests for serializers (field validation, nested output shape)
- `apps/api/plane/tests/contract/hw/` — contract tests for every endpoint: list, create, update, delete issue types; link/unlink project types; permission checks (MEMBER can't create, GUEST can list project types); delete protection when issues reference a type
- `apps/api/plane/tests/factories.py` — add `IssueTypeFactory`, `ProjectIssueTypeFactory`

**Dependencies:** Phase 1 (hw app scaffold and wiring)

**Done when:** All four workspace endpoints and three project endpoints return correct responses. Permission checks enforce role requirements. Delete is blocked when issues reference the type. All contract and unit tests pass.
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: IssueType frontend

**Goal:** Issue types visible and functional in the web UI — selectable in creation modal, switchable in detail view, filterable in list views.

**Components:**
- `apps/web/hw/services/issue-type.service.ts` — API client extending `APIService` for all issue type endpoints
- `apps/web/hw/store/issue-type.store.ts` — MobX store with observable map, CRUD actions, computed getters by workspace and project
- `apps/web/hw/store/root.store.ts` — extends `CoreRootStore` with `IssueTypeStore` (overrides `ce/store/root.store.ts`)
- `apps/web/hw/types/issue-types/index.ts` — TypeScript interfaces for IssueType, ProjectIssueType, API responses
- `apps/web/hw/components/issues/issue-details/issue-type-switcher.tsx` — dropdown in detail header for changing type
- `apps/web/hw/components/issues/issue-modal/issue-type-select.tsx` — searchable dropdown in creation modal, integrates with react-hook-form
- `apps/web/hw/components/issues/filters/issue-types.tsx` — checkbox list in filter panel
- `apps/web/hw/components/issues/filters/applied-filters/issue-types.tsx` — filter chips with remove
- `apps/web/hw/components/issues/issue-layouts/additional-properties.tsx` — compact type pill in list/kanban/table views
- Vitest tests for `IssueTypeStore` (state transitions, computed getters) and key components (IssueTypeSelect renders options, filter checkbox list)

**Dependencies:** Phase 2 (API endpoints must exist)

**Done when:** Issue types are selectable during issue creation, changeable in detail view, filterable in list views. Type displays as a colored pill in layout views. Store correctly caches and updates data. Vitest tests pass.
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: Custom properties backend

**Goal:** Property definition and value CRUD API with type-aware validation, seed data, and comprehensive tests.

**Components:**
- `apps/api/plane/hw/models/issue_property.py` — `IssuePropertyDefinition` (workspace-scoped, optional FK to IssueType, property_type choices, options JSONField, is_required, sort_order) and `IssuePropertyValue` (issue-scoped, FK to definition, value JSONField, unique on issue+definition)
- `apps/api/plane/hw/migrations/0001_initial.py` — creates `hw_issue_property_definitions` and `hw_issue_property_values` tables. Dependency on `("db", "__first__")` only.
- `apps/api/plane/hw/serializers/issue_property.py` — `PropertyDefinitionSerializer` and `IssuePropertyValueSerializer` with type-aware validation (numbers are numeric, selects from options list, booleans are bool, required field enforcement)
- `apps/api/plane/hw/views/issue_property.py` — `PropertyDefinitionViewSet` (workspace CRUD, ADMIN create/update/delete, MEMBER list) and `IssuePropertyValueViewSet` (issue-scoped list + bulk PUT upsert via `update_or_create`)
- URL routes for definition CRUD and value list/bulk-upsert
- Seed data migration — universal properties (Branch, PR Link, Revision) plus type-specific properties (Electrical: Schematic Link, Part Number, Component Count; Mechanical: CAD File Link, Material, Weight; Design: Document Link; Hardware: Datasheet Link; Software: none beyond universal). All optional.
- `apps/api/plane/tests/unit/hw/` — property model validation, serializer type checking
- `apps/api/plane/tests/contract/hw/` — definition CRUD, value bulk upsert, validation errors (wrong type, invalid select option), permission checks
- `apps/api/plane/tests/factories.py` — add `PropertyDefinitionFactory`, `PropertyValueFactory`

**Dependencies:** Phase 2 (IssueType must exist for type-scoped definitions)

**Done when:** Property definitions are CRUD-able. Values can be bulk-upserted per issue with type validation. Seed data creates correct defaults. All contract and unit tests pass.
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: Custom properties frontend

**Goal:** Custom properties visible and editable in the web UI — in issue detail sidebar, creation modal, and layout views.

**Components:**
- `apps/web/hw/services/issue-property.service.ts` — API client for definition CRUD and value bulk upsert
- `apps/web/hw/store/issue-property.store.ts` — MobX store with two observable maps (definitions keyed by ID, values keyed by issue ID). Computed getter `getDefinitionsForType(typeId)` returns type-specific + universal definitions merged and sorted by `sort_order`.
- `apps/web/hw/store/root.store.ts` — updated to include `IssuePropertyStore`
- `apps/web/hw/types/issue-types/issue-property-values.d.ts` — TypeScript interfaces for definitions, values, API shapes
- `apps/web/hw/hooks/use-issue-properties.tsx` — convenience hook composing store lookups: takes issueId + typeId, returns definitions, values, isLoading, updateValue
- `apps/web/hw/components/issues/issue-details/additional-properties.tsx` — sidebar panel rendering property rows. Fetches definitions for issue's type, fetches current values, renders field per property_type, debounces changes and calls bulk upsert.
- `apps/web/hw/components/issues/issue-details/property-fields/` — field renderers: `text-field.tsx`, `number-field.tsx`, `select-field.tsx`, `multi-select-field.tsx`, `url-field.tsx`, `date-field.tsx`, `boolean-field.tsx`. All receive same interface: definition, value, onChange, isEditable.
- `apps/web/hw/components/issues/issue-modal/modal-additional-properties.tsx` — property inputs in create/edit modal via react-hook-form control prop. Dynamically updates when issue type selection changes.
- `apps/web/hw/components/issues/issue-layouts/additional-properties.tsx` — compact read-only display showing first 2-3 properties (by sort_order) as pills in list/kanban/table views
- `apps/web/hw/components/issues/issue-details/issue-properties-activity/root.tsx` — activity display for property changes (minimal, shows old/new values)
- Vitest tests for `IssuePropertyStore` (definition merging, value caching), `useWorkItemProperties` hook, and key field renderers

**Dependencies:** Phase 3 (IssueType frontend must exist for type selection), Phase 4 (property API must exist)

**Done when:** Custom properties appear in the issue detail sidebar for the issue's type, are editable inline, persist via bulk upsert, appear in the creation modal, and display compactly in layout views. Vitest tests pass.
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: End-to-end testing

**Goal:** Playwright E2E tests covering critical user journeys against a running full-stack instance. Playwright infrastructure working within the Nix dev shell.

**Components:**
- `e2e/` directory at repo root (or `apps/web/e2e/`) — Playwright configuration, test helpers, test suites
- Playwright config — uses Nix-provided Chromium via `PLAYWRIGHT_BROWSERS_PATH`, base URL pointing to local dev server
- Test data helpers — API-based setup/teardown in `beforeAll` (create workspace, project, types, properties via REST API), no shared state between tests
- E2E test suites:
  - Issue type creation flow: create issue with specific type, verify type displays correctly after reload
  - Issue type switching: change type in detail view, verify property panel updates
  - Custom property editing: set values in sidebar, reload, verify persistence
  - Issue filtering by type: filter in list view, verify correct issue subset
  - Property definition management: create definition, verify it appears on issues of target type

**Dependencies:** Phase 5 (all features must be functional)

**Done when:** All E2E tests pass against a running dev instance. Tests are runnable from the Nix dev shell. Test data setup and teardown is reliable and isolated.
<!-- END_PHASE_6 -->

## Additional considerations

**Upstream rebase workflow:** When rebasing onto new upstream releases, check for: (1) new files in `ce/` that need copying to `hw/` (detected as build errors), (2) changes to `ce/store/root.store.ts` that need reflecting in `hw/store/root.store.ts` (this ~20-line file is the one overlay file requiring manual sync), (3) migration conflicts in `plane.db` (our `hw_` tables depend only on `("db", "__first__")` so numbered migration conflicts are avoided).

**Seed data for new workspaces:** The seed migration runs once for existing workspaces. New workspaces created after deployment need default types and properties. This should be handled via a Django signal on workspace creation or a post-create hook in the workspace serializer. The specific mechanism is an implementation detail to resolve during Phase 2.

**Property value filtering in list views:** The current design supports filtering issues by type but not by property values (e.g., "all issues where PCB Revision = 3.2"). The normalized table structure supports this query efficiently via Django ORM joins. Adding property-value filters to the frontend filter panel is a natural extension but is not part of this design scope — it can be added once the base property system is proven.
