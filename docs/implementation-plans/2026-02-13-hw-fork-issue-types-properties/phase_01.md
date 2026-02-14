# Hardware Fork Implementation Plan - Phase 1

**Goal:** Working Nix development shell, `hw` branch with CE overlay copied, Django app scaffolded and wired, `pnpm build` succeeds.

**Architecture:** Infrastructure-only phase. Create a Nix flake for reproducible dev tooling, copy the CE frontend overlay directory to `hw/`, update the TypeScript path alias, and scaffold an empty Django app wired into the project. No application logic.

**Tech Stack:** Nix flakes, Node.js 22.18+, pnpm 10.24, Python 3.12, Django 4.2

**Scope:** Phase 1 of 6 from original design

**Codebase verified:** 2026-02-13

**Testing context:** Backend tests use pytest with `@pytest.mark.unit`, `@pytest.mark.contract`, `@pytest.mark.smoke` markers. Tests run from `apps/api/` via `python run_tests.py`. Tests use real database with `--reuse-db --nomigrations`. No frontend tests exist for the main web app. No E2E tests exist. See `apps/api/plane/tests/conftest.py` for fixtures and `apps/api/plane/tests/factories.py` for Factory Boy patterns. See `CLAUDE.md` for testing philosophy.

---

## Phase 1: Dev environment and fork infrastructure

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->
### Task 1: Create Nix flake

**Files:**
- Create: `flake.nix`
- Create: `.envrc`

**Step 1: Create `flake.nix` at the repository root**

This flake provides all system-level dependencies needed for the Plane dev environment. The configuration includes:
- System libraries required by Python C extensions (psycopg3, cryptography, lxml)
- NIX_LD / NIX_LD_LIBRARY_PATH setup so dynamically linked binaries work
- Playwright browser configuration matching the pattern from `~/Projects/weaver.sh`

```nix
{
  description = "Plane hardware fork development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        inherit (pkgs) lib;
      in
      {
        devShells.default = pkgs.mkShell {
          name = "plane-hw-dev";

          buildInputs = with pkgs; [
            # Node.js and JavaScript tooling
            nodejs_22
            pnpm

            # Python and Python tooling
            python312
            ruff

            # System libraries for Python C extensions
            # psycopg3 / psycopg-c (PostgreSQL adapter)
            postgresql
            libpq

            # cryptography (needs OpenSSL and libffi)
            openssl
            libffi

            # lxml (XML/HTML parsing)
            libxml2
            libxslt

            # Build tools for compiling C extensions
            pkg-config
            gcc

            # Playwright browser dependencies
            playwright-driver

            # Docker (for infrastructure services)
            docker
            docker-compose
          ];

          nativeBuildInputs = [
            pkgs.playwright-driver.browsers
          ];

          # Dynamic linker configuration for Nix
          # Required so Python C extensions and Playwright can find shared libraries
          NIX_LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath [
            stdenv.cc.cc
            openssl
            libffi
            libpq
            libxml2
            libxslt
            zlib
          ];
          NIX_LD = lib.fileContents "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

          # Playwright configuration
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = true;
          PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu-24.04";

          shellHook = ''
            # Extend LD_LIBRARY_PATH with Nix library paths
            export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$NIX_LD_LIBRARY_PATH"

            # Python venv setup for Django development
            if [ ! -d .venv ]; then
              echo "Creating Python virtual environment..."
              python -m venv .venv
            fi
            source .venv/bin/activate

            echo "Plane HW dev shell ready."
            echo "  Node.js: $(node --version)"
            echo "  pnpm: $(pnpm --version)"
            echo "  Python: $(python --version)"
          '';
        };
      }
    );
}
```

**Step 2: Create `.envrc` at the repository root**

```
watch_file flake.nix
watch_file flake.lock
use flake
```

**Step 3: Add `flake.nix` and `.envrc` to git tracking**

Nix flakes can only see git-tracked files. Both files must be added before `nix develop` will work.

```bash
git add flake.nix .envrc
```

**Step 4: Update `.gitignore`**

Add the following entries to `.gitignore` if not already present:

```
# Nix
result
.direnv/

# Python venv
.venv/
```

Check if these entries already exist first. Only add missing ones.

**Step 5: Verify the Nix dev shell**

```bash
nix develop
```

Expected: Drops into a shell. Verify tool versions:

```bash
node --version    # Should print v22.x.x (>= 22.18.0)
pnpm --version    # Should print 10.x.x
python --version  # Should print Python 3.12.x
ruff --version    # Should print ruff 0.x.x
```

**Step 6: Commit**

```bash
git add flake.nix .envrc .gitignore
git commit -m "chore: add Nix flake dev environment with Node.js, Python, and Playwright"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Install Python dependencies in the venv

**Prerequisite:** Inside the Nix dev shell (`nix develop`).

**Step 1: Install Python dependencies**

```bash
cd apps/api
pip install -r requirements/local.txt
```

Expected: Installs Django 4.2, DRF, Celery, and all other dependencies without errors.

**Step 2: Verify Django starts**

```bash
python manage.py check
```

Expected: `System check identified no issues.` (Some warnings about unapplied migrations are acceptable since we're using `--nomigrations` for tests.)

**Step 3: Return to repo root**

```bash
cd ../..
```

No commit needed — `.venv/` is gitignored.
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Install Node.js dependencies and verify build

**Prerequisite:** Inside the Nix dev shell (`nix develop`).

**Step 1: Install Node.js dependencies**

```bash
pnpm install
```

Expected: Installs all packages without errors. The lockfile should already exist.

**Step 2: Verify the current build works**

```bash
pnpm build
```

Expected: All packages and apps build successfully. This establishes a baseline before any frontend changes.

No commit needed — `node_modules/` is gitignored and this step only installs existing dependencies.
<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-5) -->

<!-- START_TASK_4 -->
### Task 4: Copy CE overlay to hw/ and update path alias

**Files:**
- Create: `apps/web/hw/` (copy of entire `apps/web/ce/` directory, ~280 files)
- Modify: `apps/web/tsconfig.json:9` (change path alias)

**Step 1: Copy the CE directory to hw/**

```bash
cp -r apps/web/ce apps/web/hw
```

Expected: `apps/web/hw/` now contains ~280 files identical to `apps/web/ce/`.

**Step 2: Verify the copy**

```bash
diff -rq apps/web/ce apps/web/hw
```

Expected: No differences reported.

**Step 3: Modify `apps/web/tsconfig.json`**

Change line 9 from:

```json
      "@/plane-web/*": ["./ce/*"],
```

to:

```json
      "@/plane-web/*": ["./hw/*"],
```

The full file after modification:

```json
{
  "compilerOptions": {
    "rootDirs": [".", "./.react-router/types"],
    "paths": {
      "@/*": ["./core/*"],
      "@/app/*": ["./app/*"],
      "@/helpers/*": ["./helpers/*"],
      "@/styles/*": ["./styles/*"],
      "@/plane-web/*": ["./hw/*"],
      "package.json": ["./package.json"]
    },
    "strictNullChecks": true,
    "exactOptionalPropertyTypes": false,
    "noUnusedParameters": false,
    "noUnusedLocals": false,
    "noImplicitReturns": false,
    "noImplicitOverride": false,
    "types": ["vite/client"]
  },
  "extends": "@plane/typescript-config/react-router.json",
  "include": ["**/*", "**/.server/**/*", "**/.client/**/*", ".react-router/types/**/*"]
}
```

**Step 4: Verify the build still works with the hw overlay**

```bash
pnpm build
```

Expected: Build succeeds. The hw/ files are identical to ce/ so all imports resolve correctly.

**Step 5: Commit**

```bash
git add apps/web/hw/ apps/web/tsconfig.json
git commit -m "feat: copy CE overlay to hw/ and update tsconfig path alias"
```

Note: This is a large commit (~280 files). This is expected and correct — it's the full CE stub copy.
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Scaffold the Django hw app and wire it in

**Files:**
- Create: `apps/api/plane/hw/__init__.py`
- Create: `apps/api/plane/hw/apps.py`
- Create: `apps/api/plane/hw/models/__init__.py`
- Create: `apps/api/plane/hw/views/__init__.py`
- Create: `apps/api/plane/hw/serializers/__init__.py`
- Create: `apps/api/plane/hw/urls/__init__.py`
- Modify: `apps/api/plane/settings/common.py:55` (add to INSTALLED_APPS)
- Modify: `apps/api/plane/urls.py:23` (add URL include)

**Step 1: Create the Django app directory structure**

```bash
mkdir -p apps/api/plane/hw/models
mkdir -p apps/api/plane/hw/views
mkdir -p apps/api/plane/hw/serializers
mkdir -p apps/api/plane/hw/urls
```

**Step 2: Create `apps/api/plane/hw/__init__.py`**

```python
```

(Empty file.)

**Step 3: Create `apps/api/plane/hw/apps.py`**

```python
from django.apps import AppConfig


class HwConfig(AppConfig):
    name = "plane.hw"
```

This follows the exact pattern used by `plane.app` in `apps/api/plane/app/apps.py`.

**Step 4: Create `apps/api/plane/hw/models/__init__.py`**

```python
```

(Empty file. Models will be added in Phase 4.)

**Step 5: Create `apps/api/plane/hw/views/__init__.py`**

```python
```

(Empty file. Views will be added in Phase 2.)

**Step 6: Create `apps/api/plane/hw/serializers/__init__.py`**

```python
```

(Empty file. Serializers will be added in Phase 2.)

**Step 7: Create `apps/api/plane/hw/urls/__init__.py`**

```python
urlpatterns = []
```

This provides an empty URL pattern list. URL routes will be added in Phase 2.

**Step 8: Modify `apps/api/plane/settings/common.py`**

Add `"plane.hw"` to INSTALLED_APPS. Insert it after `"plane.authentication"` (the last inhouse app) and before the third-party apps comment.

Change lines 55-56 from:

```python
    "plane.authentication",
    # Third-party things
```

to:

```python
    "plane.authentication",
    "plane.hw",
    # Third-party things
```

**Step 9: Modify `apps/api/plane/urls.py`**

Add the hw app URL include. Insert it after the existing `plane.app.urls` line. This uses `include()` at the top level rather than modifying `plane.app.urls`, keeping the hw app self-contained.

Change line 18 from:

```python
    path("api/", include("plane.app.urls")),
```

to:

```python
    path("api/", include("plane.app.urls")),
    path("api/", include("plane.hw.urls")),
```

Both `plane.app.urls` and `plane.hw.urls` are included under `api/`. Django tries URL patterns in order, so hw patterns are checked after app patterns. Since they'll have distinct paths (e.g., `/api/workspaces/.../issue-types/`), there will be no conflicts.

**Step 10: Verify Django recognizes the new app**

```bash
cd apps/api
python manage.py check
```

Expected: `System check identified no issues.`

```bash
cd ../..
```

**Step 11: Verify existing backend tests still pass**

```bash
cd apps/api
python run_tests.py
```

Expected: All existing tests pass. The empty hw app should not break anything.

```bash
cd ../..
```

**Step 12: Commit**

```bash
git add apps/api/plane/hw/ apps/api/plane/settings/common.py apps/api/plane/urls.py
git commit -m "feat: scaffold plane.hw Django app and wire into settings and URLs"
```
<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_6 -->
### Task 6: Final verification

**Step 1: Verify the complete build pipeline from a clean state**

Inside the Nix dev shell:

```bash
pnpm build
```

Expected: Build succeeds with the hw overlay.

**Step 2: Verify Django starts**

```bash
cd apps/api
python manage.py check
cd ../..
```

Expected: No issues.

**Step 3: Verify backend tests**

```bash
cd apps/api
python run_tests.py
cd ../..
```

Expected: All existing tests pass.

**Step 4: Verify the git state is clean**

```bash
git status
```

Expected: Clean working tree. All changes committed.

No commit needed — this is a verification-only task.
<!-- END_TASK_6 -->
