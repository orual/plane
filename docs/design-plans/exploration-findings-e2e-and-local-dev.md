# Exploration Findings: E2E Tests and Local Dev Environment

Date: 2026-02-14
Branch: hw-fork-issue-types-properties

## Finding 1: Local Dev Upload Proxy is Broken

### Symptoms

- Project creation fails because cover image upload is mandatory
- Browser requests to `http://localhost:8000/uploads/...` return 404
- MinIO container is running and healthy on port 9000

### Root Cause Chain

1. **Proxy service commented out** in `docker-compose-local.yml` (lines with `# proxy:`)
2. **Django generates wrong URLs**: `apps/api/plane/settings/common.py` lines 254-257:
   ```python
   if AWS_S3_ENDPOINT_URL and USE_MINIO:
       parsed_url = urlparse(os.environ.get("WEB_URL", "http://localhost"))
       AWS_S3_CUSTOM_DOMAIN = f"{parsed_url.netloc}/{AWS_STORAGE_BUCKET_NAME}"
       AWS_S3_URL_PROTOCOL = f"{parsed_url.scheme}:"
   ```
3. With `WEB_URL="http://localhost:8000"`, this produces `AWS_S3_CUSTOM_DOMAIN = "localhost:8000/uploads"`
4. Upload URLs resolve to `http://localhost:8000/uploads/...` but nothing handles `/uploads` on the API server
5. In production, the Caddy proxy (`apps/proxy/Caddyfile.ce` line 20-21) routes `/{BUCKET_NAME}/*` to `plane-minio:9000`

### Architecture Context

**Services in Docker** (docker-compose-local.yml):

- `plane-db` (PostgreSQL 15.7) — port 5432
- `plane-redis` (Valkey 7.2.11) — port 6379
- `plane-mq` (RabbitMQ 3.13.6) — port 5672
- `plane-minio` (MinIO) — ports 9000 (API), 9090 (Console)
- `api` (Django) — port 8000
- `worker` (Celery worker)
- `beat-worker` (Celery beat)
- `migrator`

**Services running locally** (via `pnpm dev`):

- `web` — port 3000
- `space` — port 3002
- `admin` — port 3001
- `live` — port 3100

**Commented out in Docker** (intended for local dev):

- `proxy` (Caddy reverse proxy)
- `web`, `space`, `admin`, `live`

### Caddy Proxy Routing (when enabled)

From `apps/proxy/Caddyfile.ce`:

```
/spaces/*         → space:3000
/god-mode/*       → admin:3000
/live/*           → live:3000
/api/*            → api:8000
/auth/*           → api:8000
/static/*         → api:8000
/{BUCKET_NAME}/*  → plane-minio:9000
/*                → web:3000 (default)
```

**Problem**: These use Docker service names (`space:3000`, `web:3000`) which don't resolve when those apps run locally on the host machine.

### Key Environment Variables

| Variable              | Location        | Value                     | Used For                                            |
| --------------------- | --------------- | ------------------------- | --------------------------------------------------- |
| `WEB_URL`             | `apps/api/.env` | `http://localhost:8000`   | S3 custom domain generation, email links, redirects |
| `AWS_S3_ENDPOINT_URL` | `apps/api/.env` | `http://plane-minio:9000` | Django → MinIO connection (inside Docker)           |
| `USE_MINIO`           | `apps/api/.env` | `1`                       | Enables MinIO integration                           |
| `AWS_S3_BUCKET_NAME`  | `apps/api/.env` | `uploads`                 | Bucket name                                         |
| `VITE_API_BASE_URL`   | `apps/web/.env` | `http://localhost:8000`   | Frontend API calls                                  |

### Why `WEB_URL` Can't Simply Be Changed

`WEB_URL` is used in multiple places beyond S3 URL generation:

- `apps/api/plane/settings/common.py:363` — general `WEB_URL` setting
- Email links and redirects
- CORS and other origin checks

Changing it to `http://localhost:9000` would break non-upload functionality.

---

## Finding 2: E2E Tests Navigate to Non-Existent Routes

### Routes Referenced in Tests That Don't Exist

| Test File                       | Route                                                       | Status                  |
| ------------------------------- | ----------------------------------------------------------- | ----------------------- |
| `issue-types-create.spec.ts`    | `/{workspaceSlug}/settings/issue-types`                     | **NOT FOUND** in router |
| `properties-management.spec.ts` | `/{workspaceSlug}/projects/{projectId}/settings/properties` | **NOT FOUND** in router |

### Routes That DO Exist for Issue Types/Properties

The HW overlay components are embedded in existing views, not standalone pages:

| Component                         | Location                                        | Where It's Used            |
| --------------------------------- | ----------------------------------------------- | -------------------------- |
| `issue-type-switcher.tsx`         | `hw/components/issues/issue-details/`           | Issue detail sidebar       |
| `issue-types.tsx` (filter)        | `hw/components/issues/filters/`                 | Filter panel in list views |
| `issue-type-select.tsx`           | `hw/components/issues/issue-modal/`             | Issue creation/edit modal  |
| `modal-additional-properties.tsx` | `hw/components/issues/issue-modal/`             | Issue creation/edit modal  |
| `applied-filters/issue-types.tsx` | `hw/components/issues/filters/applied-filters/` | Applied filter chips       |

### Existing Settings Routes (from router)

The project settings router supports: labels, members, states, estimates, automations. There is **no** `issue-types` or `properties` settings route.

---

## Finding 3: E2E Test Quality Assessment

### Test Inventory (4 files, 11 cases)

**`issue-types-create.spec.ts`** (3 tests) — Navigates to non-existent settings page

- "user can create a new issue type from workspace settings"
- "user cannot create an issue type without a name"
- "issue type creation shows validation feedback"

**`issue-types-switching.spec.ts`** (2 tests) — Tests real component but with fragile selectors

- "user can switch issue type of an existing issue"
- "issue type dropdown only shows linked types"

**`issue-types-filtering.spec.ts`** (2 tests) — Tests real component but incomplete assertions

- "user can filter issues by issue type"
- "clearing issue type filter shows all issues again"

**`properties-management.spec.ts`** (4 tests) — Navigates to non-existent settings page

- "user can create a custom property in project settings"
- "user can edit a custom property"
- "user can delete a custom property"
- "user can set property options visibility"

### Systemic Issues

1. **7 of 11 tests navigate to pages that don't exist** (would 404 immediately)
2. **No `data-test` attributes** on any HW components — tests use fragile `:has-text()` selectors
3. **API shortcuts everywhere** — workspace, project, issue types, issues all created via API helpers, not UI
4. **No real user flow coverage** — project creation, issue creation through UI never tested
5. **Incomplete assertions** — some `.toBeVisible()` calls missing `await`, conditional assertion guards
6. **No error/edge case coverage** — no tests for validation errors, permission errors, network failures
7. **No data verification** — UI changes never verified via API re-fetch

### What Tests Actually Validate vs What They Should

| Actually Tests               | Should Test                                |
| ---------------------------- | ------------------------------------------ |
| Auth flow works (magic link) | Full project creation through UI           |
| API endpoints respond        | Issue creation with type selection (modal) |
| Some components render       | Issue type switching (detail view)         |
|                              | Issue filtering by type (list view)        |
|                              | Custom property values on issues           |
|                              | Error handling and validation              |
|                              | Navigation between views                   |

---

## Finding 4: Build Toolchain Issue (Resolved)

`@plane/utils` package had empty `dist/` directory. Fixed by running `npx tsdown` directly. Root cause: turbo cache thought build was complete but artifacts were missing. `pnpm build` from root may have silently skipped it.

## Finding 5: Docker Networking Gotchas (Resolved)

- `AWS_S3_ENDPOINT_URL` in `apps/api/.env` needs `http://plane-minio:9000` (Docker service name), not `http://localhost:9000` (host machine)
- `127.0.0.1` ≠ `localhost` for CORS purposes — browser must use `localhost` consistently

---

## Design Decisions (from clarification phase)

### Architecture Decisions

1. **Issue type management UI**: Both levels
   - Workspace settings page (`/{workspaceSlug}/settings/issue-types`) for CRUD
   - Project settings page (`/settings/projects/{projectId}/issue-types`) for linking/unlinking types to that project

2. **Property management UI**: Alongside issue types
   - Properties are managed within the issue type detail view
   - Each issue type shows its associated property definitions
   - No standalone properties settings page

3. **Upstream integration**: HW override mechanism
   - Do NOT modify `packages/constants/src/settings/project.ts`
   - Do NOT modify `packages/types/src/settings.ts`
   - Create HW-specific extension point for sidebar entries and routes
   - Route additions go in `apps/web/app/routes/extended.ts` (currently empty, designed for this)

4. **Local dev proxy fix**: Django dev middleware
   - Add a Django middleware or URL handler that proxies `/uploads` to MinIO when `DEBUG=True`
   - No separate proxy container needed
   - Lives in the HW fork, contribuable upstream later

5. **E2E test scope**: Smoke tests + critical paths first
   - Phase 1: Pages load, key elements visible, API verification of data changes
   - Phase 1: Critical paths — create issue type, verify properties on type detail, type selection in issue modal
   - Phase 2 (future session): Full CRUD lifecycle through UI, edit/delete flows, project linking/unlinking

### Settings Page Patterns (from exploration)

**Existing pattern for project settings pages:**

- Route definition: `apps/web/app/routes/core.ts`
- Constants: `packages/constants/src/settings/project.ts` (PROJECT_SETTINGS, GROUPED_PROJECT_SETTINGS)
- Types: `packages/types/src/settings.ts` (TProjectSettingsTabs)
- Sidebar: `apps/web/core/components/settings/project/sidebar/item-categories.tsx`
- Page template: observer → permission check → SettingsContentWrapper → header + main content
- Layout: `SettingsContentWrapper` → `AppHeader` → `ScrollArea` → Content
- CRUD pattern: List component → item component → inline form → modal for delete

**HW overlay routing:**

- `apps/web/app/routes/extended.ts` is currently empty but designed for adding routes
- `apps/web/app/routes/helper.ts` has `mergeRoutes()` that merges extended into core
- HW components live in `apps/web/hw/` — routes should use these components

### API Surface Available

**Issue Types (workspace CRUD + project linking):**

- `GET/POST /api/workspaces/{slug}/issue-types/` — list/create
- `GET/PATCH/DELETE /api/workspaces/{slug}/issue-types/{id}/` — retrieve/update/delete
- `GET/POST /api/workspaces/{slug}/projects/{projectId}/issue-types/` — list linked / link new
- `DELETE /api/workspaces/{slug}/projects/{projectId}/issue-types/{id}/` — unlink

**Property Definitions (workspace CRUD):**

- `GET/POST /api/workspaces/{slug}/property-definitions/` — list/create
- `GET/PATCH/DELETE /api/workspaces/{slug}/property-definitions/{id}/` — retrieve/update/delete

**Property Values (issue-scoped):**

- `GET/POST /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/property-values/` — list/create
- `PATCH/DELETE .../property-values/{id}/` — update/delete
- `PUT .../property-values/bulk-upsert/` — bulk upsert

**Frontend stores:**

- `IssueTypeStore` — full CRUD actions + computed getters
- `IssuePropertyStore` — fetch + upsert actions + computed selectors (no create/update/delete for definitions)

**Store gap:** `IssuePropertyStore` needs CRUD actions for property definitions (currently only fetches).
