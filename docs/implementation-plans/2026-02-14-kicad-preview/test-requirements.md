# KiCad Preview Pipeline — Test Requirements

Generated from design plan: `docs/design-plans/2026-02-14-kicad-preview.md`

## Automated Test Coverage

| AC ID | Criterion | Test Type | Test File | Test Name/Description |
|-------|-----------|-----------|-----------|----------------------|
| kicad-preview.AC1.1 | Given a render file and valid Plane credentials, the library completes the three-step presigned S3 upload and creates a comment with an embedded `<img>` tag on the target issue | unit | tests/test_client.py | `TestPlaneClient::test_upload_and_create_comment` — mocks the three-step S3 flow (POST presigned URL, POST to S3, PATCH confirm) and comment creation endpoint; verifies all three upload steps complete and a comment with `<img>` tag HTML is created |
| kicad-preview.AC1.1 | (full flow) Upload file then create comment with correct HTML containing `<img>` tag pointing to uploaded asset URL | unit | tests/test_client.py | `TestPlaneClient::test_full_upload_and_comment_flow` — verifies the complete flow: upload file then create comment with correct HTML containing `<img>` tag referencing the uploaded asset URL |
| kicad-preview.AC1.2 | Multiple render files for the same issue are grouped into a single comment with one image per file | unit | tests/test_preview.py | `TestPreviewPosting::test_multiple_renders_grouped_in_single_comment` — creates a PreviewTarget with two render files, mocks uploads and comment creation, verifies only ONE comment is created and its HTML contains two `<img>` tags |
| kicad-preview.AC1.3 | Multiple issues referenced in one commit each receive their own comment containing only the renders relevant to that issue | unit | tests/test_preview.py | `TestPreviewPosting::test_multiple_issues_get_separate_comments` — calls `post_preview()` with two PreviewTargets (different issue IDs, different render files), verifies TWO separate comment creation requests are made, each containing only the renders for that target's issue |
| kicad-preview.AC1.4 | Missing `PLANE_API_KEY` env var causes immediate exit with a clear error message before any API calls | unit | tests/test_client.py | `TestPlaneClient::test_missing_api_key_raises` — constructing PlaneClient with empty string or None API key raises `PlaneAPIError` immediately, before any HTTP calls are made |
| kicad-preview.AC1.5 | Invalid issue ID is logged as a warning; the library continues processing other issues and exits 0 | unit | tests/test_preview.py | `TestPreviewPosting::test_invalid_issue_id_skipped` — mocks comment endpoint to return 404, verifies `post_preview()` does not raise, logs a warning, and continues to the next target |
| kicad-preview.AC1.6 | Re-running the pipeline for the same commit + issue produces no duplicate comment (409 handled gracefully) | unit | tests/test_client.py | `TestPlaneClient::test_duplicate_comment_handled` — mocks comment endpoint returning 409, verifies the client logs a message and does NOT raise an exception |
| kicad-preview.AC2.1 | Commit message containing `PWR-42` is matched to the project configured with prefix `PWR` | unit | tests/test_resolver.py | `TestIssueResolver::test_commit_prefix_matches_project` — message `"fix PWR-42"` resolves to project `power-stage` issue `PWR-42` |
| kicad-preview.AC2.2 | Multiple identifiers in one commit message (e.g., `PWR-42 CTRL-7`) are each resolved independently | unit | tests/test_resolver.py | `TestIssueResolver::test_multiple_identifiers_resolved` — message `"update PWR-42 and CTRL-7"` with files in both projects produces two targets, each containing only the files belonging to that project |
| kicad-preview.AC2.3 | Identifiers are matched case-insensitively (`pwr-42` matches prefix `PWR`) | unit | tests/test_resolver.py | `TestIssueResolver::test_case_insensitive_match` — message `"fix pwr-42"` matches prefix `PWR` |
| kicad-preview.AC2.4 | Identifiers in brackets (`[PWR-42]`) are extracted correctly | unit | tests/test_resolver.py | `TestIssueResolver::test_brackets_extracted` — message `"[PWR-42] fix"` matches |
| kicad-preview.AC2.5 | Commit message with no recognisable identifiers produces no matches (no error) | unit | tests/test_resolver.py | `TestIssueResolver::test_no_identifiers_no_matches` — message `"general cleanup"` with no path mapping match produces empty list |
| kicad-preview.AC3.1 | A changed file matching a `path_mappings` glob is linked to the configured project and `default_issue` | unit | tests/test_resolver.py | `TestIssueResolver::test_path_mapping_resolves_to_default_issue` — changed file `hardware/power-stage/main.kicad_sch` with no commit identifiers resolves to `default_issue: PWR-1` |
| kicad-preview.AC3.2 | Commit message identifiers take priority over path mapping `default_issue` for the same file | unit | tests/test_resolver.py | `TestIssueResolver::test_commit_ref_takes_priority_over_path_mapping` — changed file matching a path mapping, but commit message contains `PWR-42`: resolved issue is `PWR-42`, not the `default_issue` |
| kicad-preview.AC3.3 | Changed files matching no commit pattern and no path mapping are silently skipped | unit | tests/test_resolver.py | `TestIssueResolver::test_unmatched_file_skipped` — changed file `docs/readme.md` matching no pattern and no commit ref produces no targets |
| kicad-preview.AC3.4 | Overlapping path patterns use the most specific match | unit | tests/test_resolver.py | `TestIssueResolver::test_most_specific_path_wins` — two mappings `hardware/**` and `hardware/power-stage/**`; file `hardware/power-stage/main.kicad_sch` resolves to the more specific mapping |
| kicad-preview.AC4.1 | Configured render command is executed with correct `{file}`, `{output_dir}`, and `{config}` interpolation | unit | tests/test_renderer.py | `TestRenderer::test_command_interpolation` — configures renderer with `command="echo {file} {output_dir} {config}"`, mocks `subprocess.run`, verifies command args contain actual values with no literal braces remaining |
| kicad-preview.AC4.2 | Output files matching configured `formats` are collected from the output directory after rendering | unit | tests/test_renderer.py | `TestRenderer::test_output_files_collected_by_format` — configures renderer with `formats=["svg", "png"]`, mocks successful subprocess, creates dummy `.svg` and `.png` files, verifies `render()` returns `RenderFile`s for both with correct `mime_type` values |
| kicad-preview.AC4.3 | When no `renderers` section is configured and `kicad-cli` or KiBot is on PATH, `.kicad_sch` and `.kicad_pcb` files are rendered with auto-detected defaults (`kicad-cli` preferred over KiBot) | unit | tests/test_renderer.py | `TestRenderer::test_kicad_cli_auto_detect_when_on_path` — mocks `shutil.which("kicad-cli")` to return `/usr/bin/kicad-cli`, creates Renderer with `config.renderers=None`, verifies default configs for `.kicad_sch` and `.kicad_pcb`, verifies `kicad-cli sch export svg` command is called |
| kicad-preview.AC4.3 | (fallback) KiBot auto-detected when kicad-cli is not available | unit | tests/test_renderer.py | `TestRenderer::test_kibot_fallback_when_kicad_cli_missing` — mocks `shutil.which("kicad-cli")` to return `None` and `shutil.which("kibot")` to return `/usr/bin/kibot`, creates Renderer with `config.renderers=None`, verifies fallback to KiBot configs with bundled template config paths |
| kicad-preview.AC4.4 | Render command returning non-zero exit code is logged and skipped; other files continue rendering | unit | tests/test_renderer.py | `TestRenderer::test_failed_render_skipped` — mocks `subprocess.run` to return non-zero exit code with stderr, verifies `render()` returns empty list for that file, verifies log message emitted, verifies other files continue to render |
| kicad-preview.AC4.5 | When no `renderers` section is configured and neither `kicad-cli` nor KiBot is on PATH, a clear error message is shown for KiCad files | unit | tests/test_renderer.py | `TestRenderer::test_no_renderer_available_shows_error` — mocks `shutil.which("kicad-cli")` to return `None` and `shutil.which("kibot")` to return `None`, creates Renderer with `config.renderers=None`, calls `render()` with a `.kicad_sch` file, verifies error logged mentioning "No KiCad renderer found" and file is skipped |
| kicad-preview.AC5.1 | Transient Plane API failures are retried 3x with exponential backoff before failing | unit | tests/test_client.py | `TestPlaneClient::test_api_retry_on_transient_failure` — mocks comment creation endpoint to return 500 twice then 201 on third call, verifies client retries and succeeds, verifies exactly 3 requests were made |
| kicad-preview.AC5.2 | Transient S3 upload failures are retried 2x before failing | unit | tests/test_client.py | `TestPlaneClient::test_s3_upload_retry` — mocks S3 upload POST to fail with a connection error once then succeed on retry, verifies client retries and completes the upload |
| kicad-preview.AC5.3 | Plane API unreachable after retries causes non-zero exit (CI step fails) | unit | tests/test_client.py | `TestPlaneClient::test_api_unreachable_raises_after_retries` — mocks presigned URL endpoint to always return 500, verifies client raises `PlaneAPIError` after exhausting retries |
| kicad-preview.AC5.4 | Files exceeding Plane's 5 MB asset limit are logged as warnings and skipped | unit | tests/test_client.py | `TestPlaneClient::test_oversized_file_skipped` — creates a temporary file larger than 5 MB, calls `upload_asset()`, verifies it returns `None` (skipped) and logs a warning, no HTTP requests made |
| kicad-preview.AC6.1 | `plane-preview post --adapter github` extracts commit SHA, message, branch, URL, and changed files from GitHub Actions environment | unit | tests/test_github_adapter.py | `TestGitHubAdapter::test_extracts_commit_info` — sets env vars and creates fixture event payload JSON, calls `GitHubAdapter.extract()`, verifies all AdapterResult fields (SHA, message, branch, URL, changed files) |
| kicad-preview.AC6.2 | `plane-preview init` copies the template config to `.plane-preview.yml` in the current directory | unit | tests/test_cli.py | `test_init_creates_config` — uses Click's CliRunner to invoke `init` in an isolated filesystem, verifies `.plane-preview.yml` is created with valid YAML content |
| kicad-preview.AC6.3 | Running with `--adapter github` outside GitHub Actions (missing env vars) produces a clear error | unit | tests/test_github_adapter.py | `TestGitHubAdapter::test_missing_env_vars_raises` — clears `GITHUB_SHA` and `GITHUB_EVENT_PATH` from env, calls `GitHubAdapter.extract()`, verifies `PlaneAPIError` raised with clear message about missing environment variables |
| kicad-preview.AC7.1 | Full pipeline from GitHub push event → real kicad-cli rendering → image upload → Plane comment executes without manual intervention | smoke | tests/test_integration.py | `TestEndToEndPipeline::test_full_pipeline_posts_preview` — copies real KiCad fixture files to `tmp_path`, sets GitHub Actions env vars, mocks Plane API via respx (asset upload + comment creation endpoints), invokes CLI via CliRunner, verifies exit code 0, verifies uploaded data is real SVG (contains `<svg`), verifies comment creation with `<img>` tags. Requires `kicad-cli` on PATH (`@requires_kicad` skip marker). |
| kicad-preview.AC7.2 | Pipeline handles a commit touching multiple KiCad files across multiple projects, posting correct renders to correct issues | smoke | tests/test_integration.py | `TestEndToEndPipeline::test_multi_project_pipeline` — copies all fixture files to `tmp_path`, uses event.json with both `power-stage/main.kicad_sch` and `control/board.kicad_pcb`, real kicad-cli rendering produces actual SVGs, verifies TWO separate comment creation requests (PWR-42 and CTRL-7), each comment HTML references only its own issue's renders. Requires `kicad-cli` on PATH (`@requires_kicad` skip marker). |

## Human Verification

| AC ID | Criterion | Justification | Verification Approach |
|-------|-----------|---------------|----------------------|
| (none) | | | |

All 29 acceptance criteria (across AC1 through AC7) are covered by automated tests. No human verification is required because:

- Unit tests (AC1–AC6) mock external boundaries (Plane API via respx, subprocess via `unittest.mock`, GitHub Actions env via `patch.dict`).
- Integration tests (AC7) use **real `kicad-cli` rendering** against minimal KiCad fixture files, with only the Plane API boundary mocked via respx. This provides genuine end-to-end confidence that the render → collect → upload → comment flow works with real file I/O and subprocess execution.
- Integration tests are decorated with `@requires_kicad` (`pytest.mark.skipif` on `shutil.which("kicad-cli")`) and skip gracefully when `kicad-cli` is not on PATH. In the Nix devShell, `kicad-cli` is always available.
- The GitHub adapter tests (AC6) simulate the GitHub Actions environment by setting environment variables and creating fixture event payload JSON files via `unittest.mock.patch.dict` and `tmp_path`.

## Test File Inventory

| Test File | Phase | Test Class/Scope | Markers | AC Coverage |
|-----------|-------|------------------|---------|-------------|
| `tests/test_client.py` | 1 | `TestPlaneClient` | `@pytest.mark.unit` | AC1.1, AC1.4, AC1.6, AC5.1, AC5.2, AC5.3, AC5.4 |
| `tests/test_preview.py` | 1 | `TestPreviewPosting` | `@pytest.mark.unit` | AC1.2, AC1.3, AC1.5 |
| `tests/test_config.py` | 2 | `TestConfigLoader` | `@pytest.mark.unit` | (infrastructure; no AC directly) |
| `tests/test_resolver.py` | 2 | `TestIssueResolver` | `@pytest.mark.unit` | AC2.1, AC2.2, AC2.3, AC2.4, AC2.5, AC3.1, AC3.2, AC3.3, AC3.4 |
| `tests/test_renderer.py` | 3 | `TestRenderer` | `@pytest.mark.unit` | AC4.1, AC4.2, AC4.3, AC4.4, AC4.5 |
| `tests/test_github_adapter.py` | 4 | `TestGitHubAdapter` | `@pytest.mark.unit` | AC6.1, AC6.3 |
| `tests/test_cli.py` | 4 | (module-level functions) | `@pytest.mark.unit` | AC6.2 |
| `tests/test_integration.py` | 5 | `TestEndToEndPipeline` | `@pytest.mark.smoke`, `@requires_kicad` | AC7.1, AC7.2 |

All test files live under `tools/plane-hw-preview/tests/`.

## Coverage Summary

- Total acceptance criteria: 29
- Automated tests: 29 (31 test methods; AC1.1 and AC4.3 are each covered by two complementary tests)
- Human verification: 0
- Coverage: 100%
