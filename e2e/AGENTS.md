# E2E tests

End-to-end tests for Plane using Playwright. Tests run against a live local dev environment.

## Prerequisites

Before running tests, two things must be running:

1. **Infrastructure containers** (PostgreSQL, Redis, RabbitMQ, MinIO):

   ```bash
   docker compose -f docker-compose-local.yml up -d
   ```

2. **Dev servers** (API on port 8000, web on port 3000):
   ```bash
   pnpm dev
   ```

If you cannot start these yourself (e.g., you're a non-interactive agent), ask the user to confirm they are running before proceeding with tests.

The test fixtures handle everything else automatically:

- Instance initialization (first-admin creation via god-mode API)
- User sign-up (email + password, no SMTP required)
- Onboarding completion (profile + `is_onboarded` flag)
- Workspace and project creation

Each worker gets a single authenticated user via `fixtures/index.ts`. Each test gets a fresh browser context (with the worker's session cookie), workspace, and project.

## Running tests

The `e2e/` directory is a pnpm workspace member. From the repo root:

```bash
pnpm --filter plane-e2e test            # Run all tests
pnpm --filter plane-e2e test:headed     # Run with browser visible
pnpm --filter plane-e2e test:debug      # Run in debug mode
```

Or from inside the directory:

```bash
cd e2e
pnpm test
```

## Rate limiting

Plane's API has a 30 request/minute anonymous rate limit (`AnonRateThrottle`). Each test run consumes anonymous requests for user sign-up (2 per worker × 4 workers = 8, plus a few from `globalSetup`). If you run the suite twice within ~30 seconds, later tests may fail with a "Looks like Plane didn't start up correctly" error page because the accumulated anonymous requests exceed the limit. Wait at least 60 seconds between runs, or the `globalSetup` cooldown will handle it automatically.

## NixOS / Nix flake environment

`@playwright/test` is pinned to `=1.57.0` to match the Nix-provided `playwright-driver` and `chromium-1200`. Do not change this version without also updating the Nix flake. The `PLAYWRIGHT_BROWSERS_PATH` environment variable is set by the flake shell — do not set `executablePath` manually in `playwright.config.ts`.

## Architecture

```
e2e/
├── globalSetup.ts              # Runs once before all workers (API readiness, rate limit cooldown, instance init)
├── fixtures/index.ts           # Test fixtures (worker-scoped auth, per-test workspace/project)
├── helpers/
│   ├── auth.ts                 # Authentication flow (sign-up, onboarding, rate limit retry)
│   └── api.ts                  # API helpers (workspace, project, issue type, issue, relation creation)
├── tests/                      # Test files (*.spec.ts)
└── playwright.config.ts        # Playwright configuration
```

### Key conventions

- **Session cookie**: Plane uses `session-id` (with hyphen) as the cookie name, not `sessionid`. All API helpers must use `Cookie: session-id=${token}` in headers.
- **Auth uses `page.request`**: The `signUpTestUser` function uses `page.request` (not the standalone `request` fixture) so the session cookie is shared with the browser context. This means `page.goto()` calls are authenticated after sign-up.
- **CSRF tokens**: Sign-up and sign-in endpoints require a CSRF token. Call `GET /auth/get-csrf-token/` first, then include the token as `csrfmiddlewaretoken` in form-encoded POST bodies.
- **Form-encoded auth**: The `/auth/sign-up/` and `/auth/sign-in/` endpoints use form-encoded POST (not JSON) and return 302 redirects.

### DRF serializer gotcha

Django REST Framework treats `_id`-suffixed field names as `ReadOnlyField` when the model field is a ForeignKey. If a serializer needs a writable FK field like `issue_type_id`, it must explicitly declare a `PrimaryKeyRelatedField` with `source="issue_type"`. This has bitten us multiple times — see the `PropertyDefinitionSerializer` and `ProjectIssueTypeSerializer` for the correct pattern.

## Adding new tests

1. Create a new `*.spec.ts` file in `tests/`.
2. Import from `../fixtures/index` (not `@playwright/test` directly) to get authenticated fixtures.
3. Use `data-test` attributes for selectors where possible.
4. Verify UI changes via API calls for stronger assertions.
5. Run all tests to ensure nothing regresses: `pnpm --filter plane-e2e test`.
