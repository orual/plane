# KiCad Preview Pipeline Implementation Plan — Phase 4

**Goal:** Wire everything together with the GitHub Actions adapter and CLI entrypoint.

**Architecture:** A thin `GitHubAdapter` (~30 lines) that extracts commit metadata
from GitHub Actions environment variables and event payload JSON, plus a Click CLI
with `post` and `init` commands that wire adapter → resolver → renderer → client.

**Tech Stack:** Python 3.10+, click, json (stdlib), os (stdlib), shutil (stdlib)

**Scope:** 5 phases from original design (phases 1-5)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### kicad-preview.AC6: GitHub adapter and CLI

- **kicad-preview.AC6.1 Success:** `plane-preview post --adapter github` extracts commit
  SHA, message, branch, URL, and changed files from GitHub Actions environment
- **kicad-preview.AC6.2 Success:** `plane-preview init` copies the template config to
  `.plane-preview.yml` in the current directory
- **kicad-preview.AC6.3 Failure:** Running with `--adapter github` outside GitHub Actions
  (missing env vars) produces a clear error

---

<!-- START_TASK_1 -->
### Task 1: GitHubAdapter implementation

**Verifies:** kicad-preview.AC6.1, kicad-preview.AC6.3

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/adapters/github.py`

**Implementation:**

`GitHubAdapter` class with a single method:

**Class method** `extract() -> AdapterResult`:
- Read environment variables:
  - `GITHUB_SHA` → `commit_sha`
  - `GITHUB_REF_NAME` → `branch`
  - `GITHUB_SERVER_URL` → server URL (default `https://github.com`)
  - `GITHUB_REPOSITORY` → `owner/repo`
  - `GITHUB_EVENT_PATH` → path to event payload JSON
- Construct `commit_url` as `{server_url}/{repository}/commit/{sha}`
- Read the event payload JSON from `GITHUB_EVENT_PATH`:
  - Extract `commit_message` from `head_commit.message`
  - Extract `changed_files` by collecting all filenames from `commits[].added`,
    `commits[].modified` (deduplicated, excludes `removed`)
  - If `head_commit` is not present (e.g., non-push event), fall back to first
    commit in `commits[]`
- If required env vars are missing (`GITHUB_SHA`, `GITHUB_EVENT_PATH`), raise
  `PlaneAPIError` with message:
  "GitHub Actions environment not detected. Required environment variables
  (GITHUB_SHA, GITHUB_EVENT_PATH) are missing. Are you running inside GitHub Actions?"
- Return `AdapterResult`

The adapter is ~30 lines of code. Keep it minimal — all complex logic lives in the
core library.

**Testing:**

Create `tools/plane-hw-preview/tests/test_github_adapter.py` with class
`TestGitHubAdapter`:

- **kicad-preview.AC6.1:** `test_extracts_commit_info` — Set env vars and create a
  fixture event payload JSON file (using `tmp_path`). Call `GitHubAdapter.extract()`.
  Verify all fields of the returned `AdapterResult` are correct: SHA, message, branch,
  URL, and changed files list.

- **kicad-preview.AC6.3:** `test_missing_env_vars_raises` — Clear `GITHUB_SHA` and
  `GITHUB_EVENT_PATH` from env. Call `GitHubAdapter.extract()`. Verify it raises
  `PlaneAPIError` with a clear message about missing environment variables.

- `test_deduplicates_changed_files` — Event payload with the same file in both `added`
  and `modified` across multiple commits. Verify `changed_files` contains it only once.

Use `unittest.mock.patch.dict(os.environ, ...)` for env var manipulation.
Use `tmp_path` fixture to write event payload JSON files.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_github_adapter.py -v
```

Expected: All tests pass.

**Commit:** `feat: implement GitHubAdapter for GitHub Actions environment`
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-4) -->
<!-- START_TASK_2 -->
### Task 2: CLI `init` command

**Verifies:** kicad-preview.AC6.2

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/cli.py`

**Implementation:**

Create a Click CLI application with a group command `main` and an `init` subcommand:

```python
@click.group()
def main():
    """plane-hw-preview: Post hardware design previews to Plane issues."""
    pass

@main.command()
def init():
    """Copy template config to .plane-preview.yml in the current directory."""
```

The `init` command:
- Check if `.plane-preview.yml` already exists in CWD. If so, print
  "`.plane-preview.yml` already exists. Use --force to overwrite." and exit with
  code 1.
- Add `--force` flag to overwrite existing file.
- Copy `plane_preview/templates/plane-preview.yml` to `./.plane-preview.yml`
  using `shutil.copy2()`.
- Print "Created `.plane-preview.yml` — edit it with your Plane workspace settings."

Get the template path via `Path(__file__).parent / "templates" / "plane-preview.yml"`.

**Testing:**

Add to `tools/plane-hw-preview/tests/test_cli.py`:

- **kicad-preview.AC6.2:** `test_init_creates_config` — Use Click's `CliRunner` to
  invoke `init` in an isolated filesystem. Verify `.plane-preview.yml` is created
  with valid YAML content.

- `test_init_refuses_overwrite` — Create `.plane-preview.yml` first, then run `init`.
  Verify exit code 1 and error message.

- `test_init_force_overwrites` — Create `.plane-preview.yml`, run `init --force`.
  Verify exit code 0 and file is overwritten.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_cli.py -v -k init
```

Expected: All init tests pass.

**Commit:** `feat: implement CLI init command`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: CLI `post` command

**Verifies:** kicad-preview.AC6.1

**Files:**
- Modify: `tools/plane-hw-preview/plane_preview/cli.py`

**Implementation:**

Add a `post` subcommand to the CLI group:

```python
@main.command()
@click.option("--adapter", type=click.Choice(["github"]), required=True,
              help="Git hosting adapter to use")
@click.option("--config", type=click.Path(exists=True), default=".plane-preview.yml",
              help="Path to config file")
def post(adapter, config):
    """Post hardware preview renders to Plane issues."""
```

The `post` command wires the full pipeline:
1. Load config via `ConfigLoader.load(Path(config))`
2. Validate `PLANE_API_KEY` env var is set (exit with error if missing)
3. Extract commit info via adapter:
   - `"github"` → `GitHubAdapter.extract()`
4. Resolve changed files to targets via `IssueResolver(config).resolve(
   adapter_result.changed_files, adapter_result.commit_message)`
5. If no targets resolved, print "No Plane issues matched. Nothing to post." and
   exit 0.
6. Render changed files via `Renderer(config).render(adapter_result.changed_files)`
7. Match render outputs to targets: Build a dict mapping `source_path` → rendered
   `RenderFile`s from the renderer output. For each `PreviewTarget`, iterate its
   placeholder `render_files` and look up the actual rendered `RenderFile`s by
   `source_path`. Construct new `PreviewTarget`s with the actual `RenderFile`s
   (which have `render_path` populated). Skip targets that have no rendered files.
8. Post previews via `PlaneClient` (from Phase 1):
   ```python
   with PlaneClient(config.base_url, api_key, config.workspace) as client:
       client.post_preview(targets, adapter_result.commit_sha,
                          adapter_result.commit_url, adapter_result.branch)
   ```
9. Print summary: "Posted previews to N issue(s)."

On `PlaneAPIError`, catch it, print the error message, and exit with code 1.

**Testing:**

Add to `tools/plane-hw-preview/tests/test_cli.py`:

- `test_post_requires_adapter` — Run `post` without `--adapter`. Verify exit code
  is non-zero with usage error.

- `test_post_missing_config_file` — Run `post --adapter github --config nonexistent.yml`.
  Verify exit code non-zero with error about missing config.

- `test_post_missing_api_key` — Set up valid GitHub env vars and config, but no
  `PLANE_API_KEY`. Verify exit code 1 with clear error message.

Use Click's `CliRunner` with `catch_exceptions=False` for clearer test failures.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_cli.py -v
```

Expected: All CLI tests pass.

**Commit:** `feat: implement CLI post command wiring full pipeline`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Verify CLI entrypoint works

**Files:** None (verification only)

**Step 1: Verify entrypoint is registered**

```bash
cd tools/plane-hw-preview
pip install -e .
plane-preview --help
```

Expected: Shows help text with `init` and `post` commands.

**Step 2: Verify init command**

```bash
cd /tmp
plane-preview init
cat .plane-preview.yml
rm .plane-preview.yml
```

Expected: Creates config file, prints success message, content is valid YAML.

**Step 3: Run full test suite**

```bash
cd tools/plane-hw-preview
pytest tests/ -v
```

Expected: All tests across all modules pass.

**Commit:** No commit needed (verification only).
<!-- END_TASK_4 -->
<!-- END_SUBCOMPONENT_A -->
