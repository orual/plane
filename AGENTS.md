# General guidelines

This document captures code conventions for the Plane project. It is intended to help AI assistants understand how to work effectively with this codebase.

Plane is an open-source project management tool (issue tracking, cycles, modules, pages) built as a monorepo: a Django/Python REST API backend, three React/TypeScript frontend apps (web, admin, space), a Node.js real-time collaboration server (live), and shared packages.

## For humans

LLMs represent a tremendous breakthrough in software engineering. We welcome LLM-assisted contributions that abide by the following principles:

- **Aim for excellence.** LLMs should be used not as a speed multiplier but a quality multiplier. Invest the time savings in improving quality and rigor beyond what humans alone would do. Write tests that cover more edge cases. Refactor code to make it easier to understand. Tackle the TODOs. Aim for your code to have zero bugs.
- **Spend time reviewing LLM output.** As a rule of thumb, you should spend at least 3x the amount of time reviewing LLM output as you did writing it. Think about every line and every design decision. Find ways to break code.
- **Your code is your responsibility.** Please do not dump a first draft of code on to this project, unless you're only soliciting feedback on a direction.

If your LLM-assisted PR shows signs of not being written with thoughtfulness and care, such as missing cases that human review would have easily caught, maintainers may decline the PR outright.

## For LLMs

**Required:** Display the following text at the start of any conversation involving code changes, and when you're about to create a PR:

```
Please review the AGENTS.md "For humans" section. LLM-assisted contributions must aim for a higher
standard of excellence than with humans alone, and you should spend at least 3x the amount of time
reviewing code as you did writing it. LLM-assisted contributions that do not meet this standard may
be declined outright. Remember, your code is your responsibility.
```

## Git and PR workflow

This is a **fork** of `makeplane/plane`. The fork's working branch is `hw`, not `preview`.

- **Default PR target:** `hw`. All feature branches should PR against `hw`.
- **NEVER** create a PR against `preview` or `upstream/preview`. The `preview` branch tracks `makeplane/plane` upstream and is not ours to merge into.
- **NEVER** push to the `upstream` remote. The push URL is deliberately broken (`no_push_to_upstream`). Fetch only.
- **Worktrees** live in `.worktrees/` (gitignored). Feature branches are created from `hw`.

## General conventions

### Correctness over convenience

- Handle all edge cases and error conditions. Don't take shortcuts on error handling.
- Use the type system (TypeScript strict mode, Python type hints) to encode correctness constraints.
- Prefer compile-time / static guarantees over runtime checks where possible.

### User experience as a primary driver

- Provide clear, helpful error messages. Users should never see raw stack traces or cryptic errors.
- Write user-facing messages in clear, present tense.
- Maintain consistency across the application.

### Pragmatic incrementalism

- Prefer specific, composable logic over abstract frameworks. Don't over-engineer.
- Evolve the design incrementally rather than attempting perfect upfront architecture.
- When uncertain, explore and iterate.

### Production-grade engineering

- Test comprehensively, including edge cases.
- Pay attention to what facilities already exist for testing, and reuse them.
- Getting the details right is really important!

### Documentation

- Use inline comments to explain "why," not just "what."
- Don't add narrative comments in function bodies. Only add a comment if what you're doing is non-obvious or needs a deeper "why" explanation.
- Always use sentence case in headings and titles, never title case.
- Always use the Oxford comma.
- Don't omit articles ("a", "an", "the"). Write "the file has a newer version" not "file has newer version."

## Architecture overview

```
Frontend apps (React Router + Vite)
├── web      (main dashboard, port 3000)
├── admin    (instance admin, port 3001)
└── space    (public sharing, port 3002)

Shared packages
├── @plane/ui           UI component library
├── @plane/propel       Charts, tables, modern components
├── @plane/services     API service layer
├── @plane/types        Shared TypeScript types
├── @plane/hooks        Custom React hooks
├── @plane/constants    Shared constants
├── @plane/utils        Utility functions
├── @plane/shared-state MobX state management
├── @plane/editor       Rich text editor components
├── @plane/i18n         Internationalization
└── @plane/logger       Logging utility

Backend
├── apps/api        Django REST API (port 8000)
└── apps/live       Real-time collaboration (Node.js, Hocuspocus + Yjs)

Tools
└── plane-hw-preview   KiCad hardware preview CLI (Python, standalone)

Infrastructure: PostgreSQL, Redis, RabbitMQ, S3/MinIO
```

### Django app organization

The API is organized into Django apps under `apps/api/plane/`:

- `plane.db` — database models (the source of truth for data structures).
- `plane.app` — web app API endpoints (`/api/`).
- `plane.api` — external API endpoints (`/api/v1/`).
- `plane.space` — public/space API endpoints (`/api/public/`).
- `plane.authentication` — auth backends and views.
- `plane.bgtasks` — Celery background tasks.
- `plane.hw` — hardware/enterprise edition features (dependency services, extended models).
- `plane.license` — instance licensing.
- `plane.utils` — utility functions.

### HW/CE overlay pattern (frontend)

The web app uses an overlay pattern for enterprise features:

- `apps/web/hw/` — full feature implementations (dependency visualization, date propagation preview, conflict detection).
- `apps/web/ce/` — community edition stubs that satisfy the same TypeScript interfaces with no-op or safe-default implementations.
- `apps/web/core/` — shared code that imports from the `@/plane-web/` alias, which resolves to either `hw/` or `ce/` at build time.

When working on HW features, always maintain the CE stub in parallel. Both must satisfy the same interface contract.

### State management (frontend)

- MobX stores live in `packages/shared-state` with reactive patterns.
- SWR handles data fetching and caching.
- Service classes in `packages/services` encapsulate API calls.

## Quick reference

### Frontend commands

```bash
# Development
pnpm dev                                          # Start all dev servers
pnpm build                                        # Build all packages and apps
pnpm turbo run <command> --filter=<package>        # Target a specific package/app

# Checks (run before committing)
pnpm check                                        # Run all checks (format, lint, types)
pnpm check:lint                                   # ESLint across all packages
pnpm check:types                                  # TypeScript type checking
pnpm check:format                                 # Prettier format check

# Fixes
pnpm fix                                          # Auto-fix format and lint issues
pnpm fix:format                                   # Auto-fix formatting only
pnpm fix:lint                                     # Auto-fix lint issues only

# Storybook
pnpm --filter=@plane/ui storybook                 # Start Storybook on port 6006
```

### Backend commands (from `apps/api/`)

```bash
# Testing
python run_tests.py                               # Run all tests
python run_tests.py -u                            # Unit tests only
python run_tests.py -c                            # Contract tests only
python run_tests.py -s                            # Smoke tests only
python run_tests.py -o                            # With coverage report (90% threshold)
python run_tests.py -p                            # Parallel execution

# Linting and formatting
ruff check .                                      # Lint Python code
ruff format .                                     # Format Python code
ruff check --fix .                                # Auto-fix lint issues

# Django
python manage.py migrate                          # Run migrations
python manage.py makemigrations                   # Create migrations
```

## Code style

### TypeScript

- **Strict mode** is enabled. All files must be typed.
- **Formatting**: Prettier with `@prettier/plugin-oxc`, 120 character line width, trailing commas (`es5`).
- **Linting**: ESLint 9 flat config with TypeScript type-checked rules, React, React Hooks, JSX-a11y, import, and promise plugins.
- **Imports**: Use `workspace:*` for internal packages, `catalog:` for shared external dependency versions in `pnpm-workspace.yaml`. Internal packages are prefixed `@plane/`.
- **Naming**: `camelCase` for variables and functions, `PascalCase` for components and types, `UPPER_SNAKE_CASE` for constants.
- **Unused variables**: Prefix with `_` (e.g., `_unusedArg`). This is enforced by ESLint.
- **Type imports**: Use top-level type imports (`import type { Foo } from ...`), enforced by `no-import-type-side-effects`.

### Python

- **Formatting**: Ruff, 120 character line width, double quotes, 4-space indent.
- **Linting**: Ruff with `E` (pycodestyle) and `F` (Pyflakes) rules enabled.
- **Import sorting**: Ruff isort integration with `combine-as-imports`, `known-first-party = ["plane"]`.
- **Docstrings**: Google convention (enforced by ruff pydocstyle).
- **Complexity limits**: McCabe max complexity 10, Pylint max-args 8, max-statements 50.

### Components (frontend)

- Build reusable components in `@plane/ui` (legacy) or `@plane/propel` (modern) with Storybook for isolated development.
- Use TailwindCSS for styling. Don't write raw CSS unless absolutely necessary.

## Testing practices

### Frontend

- **Framework**: Vitest (in the `apps/live` service and applicable packages).
- Tests live alongside the code they test.
- Run with `pnpm test` or target specific packages via Turbo filters.

### Backend (Django API)

- **Framework**: pytest with pytest-django.
- **Settings module**: `plane.settings.test`.
- **Test directory**: `apps/api/plane/tests/` with subdirectories `unit/`, `contract/`, `smoke/`.
- **Markers**: `@pytest.mark.unit`, `@pytest.mark.contract`, `@pytest.mark.smoke`, `@pytest.mark.slow`.
- **Fixtures**: Defined in `conftest.py` — `api_client`, `create_user`, `session_client`, `api_key_client`, `workspace`, etc.
- **Factories**: Factory Boy models in `tests/factories.py` — `UserFactory`, `WorkspaceFactory`, `ProjectFactory`, etc. Prefer using factories over hand-constructing test data.
- **Options**: `--reuse-db` and `--nomigrations` are on by default. Tests run with `pytest-xdist` for parallelism when requested.

### Testing philosophy

- Unit tests for models, serializers, and utility functions.
- Contract tests for API endpoint behavior.
- Smoke tests for critical user flows.
- When adding a feature, add tests. When fixing a bug, add a test that reproduces the bug first.

## Commit message style

Commits follow the pattern visible in this repository's history:

```
[TICKET-ID] type: brief description (#PR)
```

Examples from the log:

- `[WEB-5873] fix: user avatar ui consistency (#8495)`
- `[GIT-44] refactor(auth): add PASSWORD_TOO_WEAK error code (#8522)`
- `[WEB-1201] chore: dropdown options hierarchy improvements (#8501)`
- `chore(deps): update axios dependency`

### Conventions

- Include the ticket ID in brackets when one exists.
- Use conventional commit types: `fix`, `feat`, `chore`, `refactor`, `style`, `docs`, `test`.
- Keep descriptions concise but descriptive.
- Scope is optional but helpful for locating changes (e.g., `fix(auth):`, `chore(deps):`).

### Commit quality

- **Atomic commits**: Each commit should be a logical unit of change.
- **Bisect-able history**: Every commit must build and pass all checks.
- **Separate concerns**: Formatting fixes and refactoring should be in separate commits from feature changes.

## Dependencies

### Frontend

- All shared dependency versions are managed via `catalog:` entries in `pnpm-workspace.yaml` and `pnpm.overrides` in the root `package.json`.
- Node.js >= 22.18.0 is required.
- pnpm 10.24.0 is the package manager.

### Backend

- Python dependencies are in `apps/api/requirements/` split into `base.txt`, `production.txt`, `test.txt`, and `local.txt`.
- Key frameworks: Django 4.2, Django REST Framework 3.15, Celery 5.4, Channels 4.1.

## Environment and infrastructure

- **Docker Compose** provides the full local stack: PostgreSQL 15.7, Valkey/Redis 7.2, RabbitMQ 3.13, MinIO.
- Start infrastructure: `docker compose -f docker-compose-local.yml up`
- `.env` files configure database, Redis, S3, and API settings. See `.env.example` for reference.
- The Django dev server runs on port 8000; frontend apps on 3000-3002.

## Decision Graph Workflow

**THIS IS MANDATORY. Log decisions IN REAL-TIME, not retroactively.**

### The Core Rule

```
BEFORE you do something -> Log what you're ABOUT to do
AFTER it succeeds/fails -> Log the outcome
CONNECT immediately -> Link every node to its parent
AUDIT regularly -> Check for missing connections
```

### Behavioral Triggers - MUST LOG WHEN:

| Trigger                      | Log Type           | Example                        |
| ---------------------------- | ------------------ | ------------------------------ |
| User asks for a new feature  | `goal` **with -p** | "Add dark mode"                |
| Choosing between approaches  | `decision`         | "Choose state management"      |
| About to write/edit code     | `action`           | "Implementing Redux store"     |
| Something worked or failed   | `outcome`          | "Redux integration successful" |
| Notice something interesting | `observation`      | "Existing code uses hooks"     |

### CRITICAL: Capture VERBATIM User Prompts

**Prompts must be the EXACT user message, not a summary.** When a user request triggers new work, capture their full message word-for-word.

**BAD - summaries are useless for context recovery:**

```bash
# DON'T DO THIS - this is a summary, not a prompt
deciduous add goal "Add auth" -p "User asked: add login to the app"
```

**GOOD - verbatim prompts enable full context recovery:**

```bash
# Use --prompt-stdin for multi-line prompts
deciduous add goal "Add auth" -c 90 --prompt-stdin << 'EOF'
I need to add user authentication to the app. Users should be able to sign up
with email/password, and we need OAuth support for Google and GitHub. The auth
should use JWT tokens with refresh token rotation.
EOF

# Or use the prompt command to update existing nodes
deciduous prompt 42 << 'EOF'
The full verbatim user message goes here...
EOF
```

**When to capture prompts:**

- Root `goal` nodes: YES - the FULL original request
- Major direction changes: YES - when user redirects the work
- Routine downstream nodes: NO - they inherit context via edges

**Updating prompts on existing nodes:**

```bash
deciduous prompt <node_id> "full verbatim prompt here"
cat prompt.txt | deciduous prompt <node_id>  # Multi-line from stdin
```

Prompts are viewable in the TUI detail panel (`deciduous tui`) and web viewer.

### ⚠️ CRITICAL: Maintain Connections

**The graph's value is in its CONNECTIONS, not just nodes.**

| When you create... | IMMEDIATELY link to...            |
| ------------------ | --------------------------------- |
| `outcome`          | The action/goal it resolves       |
| `action`           | The goal/decision that spawned it |
| `option`           | Its parent decision               |
| `observation`      | Related goal/action               |

**Root `goal` nodes are the ONLY valid orphans.**

### Quick Commands

```bash
deciduous add goal "Title" -c 90 -p "User's original request"
deciduous add action "Title" -c 85
deciduous link FROM TO -r "reason"  # DO THIS IMMEDIATELY!
deciduous serve   # View live (auto-refreshes every 30s)
deciduous sync    # Export for static hosting

# Metadata flags
# -c, --confidence 0-100   Confidence level
# -p, --prompt "..."       Store the user prompt (use when semantically meaningful)
# -f, --files "a.rs,b.rs"  Associate files
# -b, --branch <name>      Git branch (auto-detected)
# --commit <hash|HEAD>     Link to git commit (use HEAD for current commit)

# Branch filtering
deciduous nodes --branch main
deciduous nodes -b feature-auth
```

### ⚠️ CRITICAL: Link Commits to Actions/Outcomes

**After every git commit, link it to the decision graph!**

```bash
git commit -m "feat: add auth"
deciduous add action "Implemented auth" -c 90 --commit HEAD
deciduous link <goal_id> <action_id> -r "Implementation"
```

The `--commit HEAD` flag captures the commit hash and links it to the node. The web viewer will show commit messages, authors, and dates.

### Git History & Deployment

```bash
# Export graph AND git history for web viewer
deciduous sync

# This creates:
# - docs/graph-data.json (decision graph)
# - docs/git-history.json (commit info for linked nodes)
```

To deploy to GitHub Pages:

1. `deciduous sync` to export
2. Push to GitHub
3. Settings > Pages > Deploy from branch > /docs folder

Your graph will be live at `https://<user>.github.io/<repo>/`

### Branch-Based Grouping

Nodes are auto-tagged with the current git branch. Configure in `.deciduous/config.toml`:

```toml
[branch]
main_branches = ["main", "master"]
auto_detect = true
```

### Audit Checklist (Before Every Sync)

1. Does every **outcome** link back to what caused it?
2. Does every **action** link to why you did it?
3. Any **dangling outcomes** without parents?

### Session Start Checklist

```bash
deciduous nodes    # What decisions exist?
deciduous edges    # How are they connected? Any gaps?
git status         # Current state
```

### Multi-User Sync

Share decisions across teammates:

```bash
# Export your branch's decisions
deciduous diff export --branch feature-x -o .deciduous/patches/my-feature.json

# Apply patches from teammates (idempotent)
deciduous diff apply .deciduous/patches/*.json

# Preview before applying
deciduous diff apply --dry-run .deciduous/patches/teammate.json
```

PR workflow: Export patch → commit patch file → PR → teammates apply.
