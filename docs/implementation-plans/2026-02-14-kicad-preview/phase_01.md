# KiCad Preview Pipeline Implementation Plan — Phase 1

**Goal:** Establish the Python package structure and implement the core Plane API
interaction layer (presigned S3 upload and comment creation).

**Architecture:** Standalone pip-installable Python package (`plane-hw-preview`,
importable as `plane_preview`) using httpx for HTTP calls, tenacity for retry logic.
Lives in `tools/plane-hw-preview/` at the repository root. This is the first standalone
Python package in the repo — all existing Python code lives in the Django API at
`apps/api/`.

**Tech Stack:** Python 3.10+, httpx, tenacity, click, pyyaml, respx (dev), pytest (dev)

**Scope:** 5 phases from original design (phases 1-5)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### kicad-preview.AC1: Library uploads images and creates comments on Plane issues

- **kicad-preview.AC1.1 Success:** Given a render file and valid Plane credentials, the
  library completes the three-step presigned S3 upload and creates a comment with an
  embedded `<img>` tag on the target issue
- **kicad-preview.AC1.2 Success:** Multiple render files for the same issue are grouped
  into a single comment with one image per file
- **kicad-preview.AC1.3 Success:** Multiple issues referenced in one commit each receive
  their own comment containing only the renders relevant to that issue
- **kicad-preview.AC1.4 Failure:** Missing `PLANE_API_KEY` env var causes immediate exit
  with a clear error message before any API calls
- **kicad-preview.AC1.5 Failure:** Invalid issue ID is logged as a warning; the library
  continues processing other issues and exits 0
- **kicad-preview.AC1.6 Edge:** Re-running the pipeline for the same commit + issue
  produces no duplicate comment (409 handled gracefully)

### kicad-preview.AC5: Error handling and retry behaviour

- **kicad-preview.AC5.1 Success:** Transient Plane API failures are retried 3x with
  exponential backoff before failing
- **kicad-preview.AC5.2 Success:** Transient S3 upload failures are retried 2x before
  failing
- **kicad-preview.AC5.3 Failure:** Plane API unreachable after retries causes non-zero
  exit (CI step fails)
- **kicad-preview.AC5.4 Edge:** Files exceeding Plane's 5 MB asset limit are logged as
  warnings and skipped

---

<!-- START_TASK_1 -->
### Task 1: Package scaffolding

**Files:**
- Modify: `flake.nix` (add `kicad` to devShell)
- Create: `tools/plane-hw-preview/pyproject.toml`
- Create: `tools/plane-hw-preview/.gitignore`
- Create: `tools/plane-hw-preview/plane_preview/__init__.py`
- Create: `tools/plane-hw-preview/plane_preview/adapters/__init__.py`
- Create: `tools/plane-hw-preview/plane_preview/templates/` (empty directory)
- Create: `tools/plane-hw-preview/tests/__init__.py`
- Create: `tools/plane-hw-preview/tests/conftest.py`

**Step 0: Add kicad to flake.nix devShell**

Add `kicad` to the `buildInputs` list in `flake.nix` so that `kicad-cli` is available
for rendering and integration tests inside `nix develop`:

```nix
buildInputs = with pkgs; [
  # ... existing entries ...

  # KiCad CLI for hardware design rendering (kicad-cli sch/pcb export svg)
  kicad
];
```

This provides `kicad-cli` on PATH for both development and test execution.

**Step 1: Create directory structure, pyproject.toml, and .gitignore**

Create the full directory tree under `tools/plane-hw-preview/`.

`pyproject.toml` must include:
- `[project]` section: name `plane-hw-preview`, version `0.1.0`, requires-python `>=3.10`
- Dependencies: `httpx>=0.27`, `click>=8.0`, `pyyaml>=6.0`, `tenacity>=8.0`
- Optional dependencies group `dev`: `pytest>=7.0`, `respx>=0.21`, `pytest-cov`
- `[project.scripts]` entry: `plane-preview = "plane_preview.cli:main"`
- `[tool.ruff]` section matching the project style: line-length 120, double quotes,
  4-space indent, select `["E", "F"]`, known-first-party `["plane_preview"]`
- `[tool.pytest.ini_options]` section: `testpaths = ["tests"]`, `python_files = "test_*.py"`,
  `python_classes = "Test*"`, `python_functions = "test_*"`,
  `markers = ["unit: unit tests", "smoke: smoke tests"]`

`.gitignore` for common Python build/test artifacts:
```
__pycache__/
*.egg-info/
dist/
build/
.eggs/
*.pyc
.pytest_cache/
.coverage
htmlcov/
```

`plane_preview/__init__.py` should export the package version:
```python
__version__ = "0.1.0"
```

`tests/conftest.py` — shared test fixtures used across all test files:
```python
import pytest
from pathlib import Path
from plane_preview.types import RenderFile, PreviewTarget


@pytest.fixture
def render_file_factory(tmp_path):
    """Factory fixture to create RenderFile instances with real temp files."""
    def _create(source_path="board.kicad_pcb", filename="board-pcb.svg",
                content=b"<svg></svg>", mime_type="image/svg+xml"):
        render_path = tmp_path / filename
        render_path.write_bytes(content)
        return RenderFile(
            source_path=source_path,
            render_path=render_path,
            mime_type=mime_type,
        )
    return _create


@pytest.fixture
def preview_target_factory(render_file_factory):
    """Factory fixture to create PreviewTarget instances."""
    def _create(project_id="proj-uuid", issue_id="issue-uuid", render_files=None):
        if render_files is None:
            render_files = (render_file_factory(),)
        return PreviewTarget(
            project_id=project_id,
            issue_id=issue_id,
            render_files=render_files,
        )
    return _create
```

**Step 2: Verify package installs**

```bash
cd tools/plane-hw-preview
pip install -e ".[dev]"
python -c "import plane_preview; print(plane_preview.__version__)"
```

Expected: Installs without errors, prints `0.1.0`.

**Step 3: Commit**

```bash
git add tools/plane-hw-preview/
git commit -m "chore: scaffold plane-hw-preview package structure"
```
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-5) -->
<!-- START_TASK_2 -->
### Task 2: AdapterResult dataclass and shared types

**Verifies:** None (type definitions only — compiler/runtime verifies)

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/adapters/base.py`
- Create: `tools/plane-hw-preview/plane_preview/types.py`

**Implementation:**

`plane_preview/adapters/base.py` — the `AdapterResult` dataclass that all git-host
adapters produce. Fields:
- `commit_sha: str`
- `commit_message: str`
- `commit_url: str`
- `branch: str`
- `changed_files: tuple[str, ...]`

`plane_preview/types.py` — shared types used across the package:
- `AssetUploadResult` dataclass: `asset_id: str`, `asset_url: str`
- `RenderFile` dataclass: `source_path: str` (relative path of the KiCad source file),
  `render_path: Path` (absolute path to rendered image), `mime_type: str`
- `PreviewTarget` dataclass: `project_id: str`, `issue_id: str`,
  `render_files: tuple[RenderFile, ...]`
- `PlaneAPIError` exception class (extends `Exception`): for API-level errors
- `MAX_FILE_SIZE: int = 5_242_880` constant (5 MB, matching Plane's default
  `FILE_SIZE_LIMIT`)

Use `dataclasses.dataclass` with `frozen=True` for immutability. Use `pathlib.Path` for
file paths. Use `tuple` (not `list`) for collection fields in frozen dataclasses to
preserve the immutability contract.

**Verification:**

```bash
cd tools/plane-hw-preview
python -c "from plane_preview.adapters.base import AdapterResult; from plane_preview.types import RenderFile, AssetUploadResult, PreviewTarget, PlaneAPIError, MAX_FILE_SIZE; print('OK')"
```

Expected: Prints `OK`.

**Commit:** `feat: add AdapterResult dataclass and shared types`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: PlaneClient tests

**Verifies:** kicad-preview.AC1.1, kicad-preview.AC1.4, kicad-preview.AC1.6,
kicad-preview.AC5.1, kicad-preview.AC5.2, kicad-preview.AC5.3, kicad-preview.AC5.4

**Files:**
- Create: `tools/plane-hw-preview/tests/test_client.py`

**Testing:**

Write tests BEFORE the PlaneClient implementation. Tests will not pass until Task 4
implements the client. **Do NOT commit this task separately** — these tests will be
committed together with the implementation in Task 4 to maintain bisectability.

Tests must verify each AC listed above. The test file should contain a class
`TestPlaneClient` with the following test methods:

- **kicad-preview.AC1.1:** `test_upload_and_create_comment` — Mock the three-step S3
  flow (POST presigned URL → POST to S3 → PATCH confirm) and comment creation endpoint.
  Verify that given a render file and valid credentials, the client completes all three
  upload steps and creates a comment with `<img>` tag HTML on the target issue.
  Mock endpoints:
  - `POST /api/v1/workspaces/test-ws/assets/` → 200 with
    `{"upload_data": {"url": "https://s3.example.com/upload", "fields": {"key": "test"}}, "asset_id": "asset-uuid", "asset_url": "https://s3.example.com/asset.png"}`
  - `POST https://s3.example.com/upload` → 204
  - `PATCH /api/v1/workspaces/test-ws/assets/asset-uuid/` → 204
  - `POST /api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-uuid/comments/` → 201

- **kicad-preview.AC1.4:** `test_missing_api_key_raises` — Constructing PlaneClient
  with empty string or None API key raises `PlaneAPIError` immediately, before any
  HTTP calls are made.

- **kicad-preview.AC1.6:** `test_duplicate_comment_handled` — Mock comment endpoint
  returning 409 with `{"error": "Work item comment with the same external id and external source already exists", "id": "comment-uuid"}`.
  Verify the client logs a message and does NOT raise an exception.

- **kicad-preview.AC5.1:** `test_api_retry_on_transient_failure` — Mock the comment
  creation endpoint to return 500 twice, then 201 on the third call. Verify the client
  retries and ultimately succeeds. Verify exactly 3 requests were made.

- **kicad-preview.AC5.2:** `test_s3_upload_retry` — Mock the S3 upload POST to fail
  with a connection error once, then succeed on retry. Verify the client retries and
  completes the upload.

- **kicad-preview.AC5.3:** `test_api_unreachable_raises_after_retries` — Mock the
  presigned URL endpoint to always return 500. Verify the client raises `PlaneAPIError`
  after exhausting retries.

- **kicad-preview.AC5.4:** `test_oversized_file_skipped` — Create a temporary file
  larger than 5 MB. Call `upload_asset()`. Verify it returns `None` (skipped) and logs
  a warning. No HTTP requests should be made.

Follow project testing patterns: use `pytest.mark.unit` marker on the test class.
Use `respx.mock` context manager or `respx_mock` fixture for HTTP mocking.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_client.py -v
```

Expected: Tests fail with `ImportError` (PlaneClient not yet implemented).
No commit — tests are committed with their implementation in Task 4.
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: PlaneClient implementation — init, upload, retry

**Verifies:** kicad-preview.AC1.1, kicad-preview.AC1.4, kicad-preview.AC5.1,
kicad-preview.AC5.2, kicad-preview.AC5.3, kicad-preview.AC5.4

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/client.py`

**Implementation:**

Create `PlaneClient` class with the following structure. Use `logging.getLogger(__name__)`
at module level for all log messages throughout this module.

**Constructor** `__init__(self, base_url: str, api_key: str, workspace: str)`:
- Raise `PlaneAPIError("PLANE_API_KEY is required")` if `api_key` is falsy
- Store `workspace` slug
- Create `httpx.Client` with:
  - `base_url` set to the provided URL
  - `headers` including `{"X-Api-Key": api_key}`
  - `timeout` of 30 seconds

**Method** `upload_asset(self, file_path: Path, mime_type: str) -> AssetUploadResult | None`:
- Check file size against `MAX_FILE_SIZE`. If exceeded, log warning and return `None`.
- Step 1: POST to `/api/v1/workspaces/{workspace}/assets/` with JSON body:
  `{"name": file_path.name, "type": mime_type, "size": file_size}`.
  Use tenacity retry: 3 attempts, exponential backoff (wait 1s, 2s, 4s),
  retry on `httpx.TransportError` or HTTP 5xx responses.
- Step 2: POST the file to the presigned S3 URL from step 1's `upload_data`.
  The `upload_data` dict contains `url` and `fields`. POST as multipart form with
  the fields plus the file content. Use tenacity retry: 2 attempts, retry on
  `httpx.TransportError` or HTTP 5xx.
  Note: S3 upload uses a separate `httpx.Client` (no auth headers, different base URL).
- Step 3: PATCH to `/api/v1/workspaces/{workspace}/assets/{asset_id}/` with
  `{"is_uploaded": true}`. Use same retry config as step 1.
- Return `AssetUploadResult(asset_id=..., asset_url=...)`.
- On non-retryable failure, raise `PlaneAPIError` with details.

**Method** `close(self)`:
- Close the httpx client. Support context manager protocol (`__enter__`/`__exit__`).

Use `tenacity.retry` decorator or inline `Retrying` for retry logic. Define two retry
configurations:
- `api_retry`: stop after 3 attempts, exponential backoff (multiplier=1, min=1, max=10),
  retry on `httpx.TransportError` or when response status >= 500
- `s3_retry`: stop after 2 attempts, same backoff, same retry conditions

For retry on HTTP status, use a custom retry callback that checks
`response.status_code >= 500` and raises `tenacity.TryAgain` or uses
`retry_if_exception_type`.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_client.py -v -k "upload or api_key or oversized or retry or unreachable"
```

Expected: Tests for AC1.1 (upload part), AC1.4, AC5.1, AC5.2, AC5.3, AC5.4 pass.

**Commit:** `feat: implement PlaneClient with S3 upload and retry logic`

This commit includes both `tests/test_client.py` (from Task 3) and
`plane_preview/client.py`.
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: PlaneClient implementation — comment creation and preview posting

**Verifies:** kicad-preview.AC1.1, kicad-preview.AC1.2, kicad-preview.AC1.3,
kicad-preview.AC1.5, kicad-preview.AC1.6

**Files:**
- Modify: `tools/plane-hw-preview/plane_preview/client.py`
- Create: `tools/plane-hw-preview/tests/test_preview.py`

**Implementation:**

Add these methods to `PlaneClient` (use the existing `logger` from Task 4):

**Method** `create_comment(self, project_id: str, issue_id: str, comment_html: str, external_source: str, external_id: str) -> str | None`:
- POST to `/api/v1/workspaces/{workspace}/projects/{project_id}/work-items/{issue_id}/comments/`
  with JSON body: `{"comment_html": comment_html, "external_source": external_source, "external_id": external_id}`.
- Use `api_retry` configuration (3 attempts, exponential backoff).
- On 409 response: log that comment already exists, return `None` (not an error).
- On 404 response: log warning about invalid issue ID, return `None` (not an error).
- On success (201): return the comment ID from the response.
- On other errors after retries: raise `PlaneAPIError`.

**Method** `post_preview(self, targets: list[PreviewTarget], commit_sha: str, commit_url: str, branch: str) -> None`:
- For each `PreviewTarget` in `targets`:
  - Upload each `RenderFile` via `upload_asset()`. Skip files that return `None`
    (oversized). Collect successful `AssetUploadResult`s.
  - If no uploads succeeded for this target, skip it.
  - Construct HTML comment body (see format below).
  - Call `create_comment()` with:
    - `external_source: "plane-hw-preview"`
    - `external_id: "{commit_sha}:{issue_id}"`
  - Log result (created, skipped as duplicate, or failed).

**Comment HTML format:**
```html
<h3>Hardware preview — commit <a href="{commit_url}">{short_sha}</a></h3>
<p>Branch: <code>{branch}</code></p>
<h4>{source_path}</h4>
<p><img src="{asset_url}" alt="{filename} render" /></p>
```
Repeat the `<h4>` + `<p><img>` block for each render file in the target.
`short_sha` is first 7 characters of `commit_sha`.

**Testing:**

Create `tests/test_preview.py` with class `TestPreviewPosting`:

- **kicad-preview.AC1.2:** `test_multiple_renders_grouped_in_single_comment` — Create a
  `PreviewTarget` with two render files. Mock uploads and comment creation. Verify only
  ONE comment is created, and its HTML contains two `<img>` tags.

- **kicad-preview.AC1.3:** `test_multiple_issues_get_separate_comments` — Call
  `post_preview()` with two `PreviewTarget`s (different issue IDs, different render files).
  Verify TWO separate comment creation requests are made, each containing only the
  renders for that target's issue.

- **kicad-preview.AC1.5:** `test_invalid_issue_id_skipped` — Mock comment endpoint to
  return 404. Verify `post_preview()` does not raise, logs a warning, and continues to
  the next target.

Also add to `tests/test_client.py`:
- **kicad-preview.AC1.1 (full):** `test_full_upload_and_comment_flow` — Verify the
  complete flow: upload file → create comment with correct HTML containing `<img>` tag
  pointing to the uploaded asset URL.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/ -v
```

Expected: ALL tests pass.

**Commit:** `feat: implement comment creation and preview posting`
<!-- END_TASK_5 -->
<!-- END_SUBCOMPONENT_A -->
