# KiCad preview pipeline — human test plan

## Prerequisites

- A working Nix development shell (or `kicad-cli` installed on PATH)
- Python 3.12+ with the project installed in dev mode: `pip install -e ".[dev]"` from `tools/plane-hw-preview`
- All automated tests passing: `pytest` from the project root (61 tests)
- A Plane instance with API access (staging or dev recommended)
- A GitHub repository with GitHub Actions enabled (for CI tests)

## Phase 1: Local CLI smoke test

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Run `plane-preview init` in an empty directory | `.plane-preview.yml` is created; the file contains valid YAML with `plane.base_url`, `plane.workspace`, `commit_patterns`, and `path_mappings` sections |
| 1.2 | Run `plane-preview init` again in the same directory (without `--force`) | Exit code 1; output contains ".plane-preview.yml already exists" and "Use --force to overwrite" |
| 1.3 | Run `plane-preview init --force` | Exit code 0; the existing file is replaced with the fresh template |
| 1.4 | Run `plane-preview post --adapter github` without `PLANE_API_KEY` set | Exit code 1; output contains "PLANE_API_KEY" and "not set" |
| 1.5 | Run `plane-preview post --adapter github` with `PLANE_API_KEY=test` but outside GitHub Actions (no `GITHUB_SHA`, etc.) | Exit code 1; output contains "GitHub Actions environment not detected" and lists required env vars |

## Phase 2: Real KiCad rendering verification

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | From the project root, run `kicad-cli sch export svg -o /tmp/kicad-test/ tests/fixtures/power-stage/main.kicad_sch` | An SVG file is created in `/tmp/kicad-test/`; opening it shows a schematic diagram (not blank, not truncated) |
| 2.2 | From the project root, run `kicad-cli pcb export svg -o /tmp/kicad-test/board.svg tests/fixtures/control/board.kicad_pcb` | An SVG file is created; opening it shows a PCB layout |
| 2.3 | Examine the SVG files from steps 2.1 and 2.2 | Both files are valid SVG (contain `<svg` root element), are under 5 MB, and render correctly in a browser |

## Phase 3: Real Plane API integration

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Create a test project in a staging Plane instance with a known project identifier (e.g., `TEST`) | Project is created and accessible via the API |
| 3.2 | Create a test issue in the project (e.g., `TEST-1`) | Issue is created |
| 3.3 | Configure `.plane-preview.yml` with the staging Plane URL, workspace slug, and a `commit_patterns` entry mapping prefix `TEST` to the project ID, with a `path_mappings` entry for `tests/fixtures/power-stage/**` | Valid YAML config file |
| 3.4 | Simulate the full pipeline locally by setting GitHub Actions env vars manually and running the CLI with a valid `event.json` referencing `TEST-1` in the commit message and `power-stage/main.kicad_sch` as a changed file | Exit code 0; output says "Posted previews to 1 issue(s)" |
| 3.5 | Navigate to the test issue in the Plane UI | A comment is visible containing: a header with the short commit SHA linked to the commit URL, the branch name, and an embedded image showing the rendered schematic |
| 3.6 | Re-run the exact same command from step 3.4 | Exit code 0; no duplicate comment is created (the 409 is handled gracefully); output indicates the comment was skipped |
| 3.7 | Verify in the Plane UI that still only one comment exists on the issue | Only the original comment is present (idempotency confirmed) |

## Phase 4: GitHub Actions CI test

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | In a test GitHub repository, create `.plane-preview.yml` and a GitHub Actions workflow that runs `plane-preview post --adapter github` on push | Workflow file is committed |
| 4.2 | Push a commit with message `[TEST-1] update schematic` that modifies a `.kicad_sch` file matching the path mappings | GitHub Actions workflow triggers |
| 4.3 | Check the GitHub Actions workflow log | The step completes successfully (exit code 0); logs show: config loaded, adapter extracted commit info, resolver found matching target, renderer executed kicad-cli, files uploaded, comment created |
| 4.4 | Check the Plane issue `TEST-1` | A new comment with rendered preview images is visible |
| 4.5 | Push a commit touching files in two different projects (e.g., `[TEST-1] [CTRL-2] update both`) | Both issues receive their own comments with renders relevant to only their respective files |

## End-to-end: Multi-project in a single commit

**Purpose:** Validates that a single commit touching KiCad files across multiple hardware projects results in correctly separated preview comments, each containing only the renders for their respective issue.

1. Set up a `.plane-preview.yml` with two `commit_patterns` entries (`PWR` → `power-stage` project, `CTRL` → `control-board` project) and corresponding `path_mappings`.
2. Create a commit with message `PWR-42 CTRL-7 update both boards` modifying `power-stage/main.kicad_sch` and `control/board.kicad_pcb`.
3. Run the pipeline (either locally with simulated env or via GitHub Actions).
4. Verify in the Plane UI that issue `PWR-42` has a comment with only the schematic render and issue `CTRL-7` has a comment with only the PCB render.
5. Verify there is no cross-contamination (PWR-42 comment does not reference board.kicad_pcb renders).

## End-to-end: Graceful degradation on partial failure

**Purpose:** Validates that if one file fails to render (e.g., a corrupted KiCad file), the pipeline continues processing other files and posts partial previews.

1. Prepare a commit that modifies two KiCad files for the same issue: one valid `.kicad_sch` and one corrupted/empty `.kicad_pcb`.
2. Run the pipeline.
3. Check the CLI output for a logged error about the failed render.
4. Verify that the Plane comment was still created, containing the successfully rendered schematic image.
5. Verify the CLI exits with code 0 (partial success is not a failure).

## End-to-end: File size limit enforcement

**Purpose:** Validates that files exceeding 5 MB are skipped without aborting the pipeline.

1. Create a KiCad schematic that renders to an SVG larger than 5 MB (e.g., a very complex multi-sheet schematic).
2. Include a second smaller file in the same commit.
3. Run the pipeline.
4. Verify the oversized file is logged as skipped.
5. Verify the smaller file is still uploaded and a comment is created.

## Human verification items

| Criterion | Why manual | Steps |
|-----------|-----------|-------|
| Visual render quality | Automated tests verify SVG files exist and contain `<svg`; only a human can assess whether the rendered schematic/PCB is visually correct and readable | Open rendered SVGs from step 2.1/2.2 in a browser; verify components, labels, and traces are visible and not corrupted |
| Plane UI comment appearance | Automated tests verify HTML structure; only a human can confirm the comment renders well in the Plane web UI (images load, headers format correctly, links work) | Complete phase 3 steps 3.5 and 3.7; visually inspect the comment in the Plane UI |
| CI environment compatibility | Unit tests mock the GitHub Actions environment; only a real CI run confirms that env vars, file paths, and process isolation work as expected | Complete phase 4 |
| Config template usability | Tests verify the template is valid YAML; only a human can assess whether the generated config is self-documenting and easy to customise | Run `plane-preview init` and review the generated `.plane-preview.yml` for clarity of comments and placeholder values |

## Traceability

| Acceptance criterion | Automated test | Manual step |
|----------------------|----------------|-------------|
| AC1.1 S3 upload + comment | `test_client.py::test_upload_and_create_comment`, `test_full_upload_and_comment_flow` | Phase 3, steps 3.4–3.5 |
| AC1.2 Multiple renders grouped | `test_preview.py::test_multiple_renders_grouped_in_single_comment` | Multi-project E2E |
| AC1.3 Separate comments per issue | `test_preview.py::test_multiple_issues_get_separate_comments` | Phase 4, step 4.5 |
| AC1.4 Missing API key | `test_client.py::test_missing_api_key_raises` | Phase 1, step 1.4 |
| AC1.5 Invalid issue skipped | `test_preview.py::test_invalid_issue_id_skipped` | — |
| AC1.6 Duplicate comment (409) | `test_client.py::test_duplicate_comment_handled` | Phase 3, steps 3.6–3.7 |
| AC2.1 Commit prefix match | `test_resolver.py::test_commit_prefix_matches_project` | Phase 4, step 4.3 |
| AC2.2 Multiple identifiers | `test_resolver.py::test_multiple_identifiers_resolved` | Phase 4, step 4.5 |
| AC2.3 Case-insensitive | `test_resolver.py::test_case_insensitive_match` | — |
| AC2.4 Brackets | `test_resolver.py::test_brackets_extracted` | — |
| AC2.5 No identifiers | `test_resolver.py::test_no_identifiers_no_matches` | — |
| AC3.1 Path mapping default | `test_resolver.py::test_path_mapping_resolves_to_default_issue` | — |
| AC3.2 Commit ref priority | `test_resolver.py::test_commit_ref_takes_priority_over_path_mapping` | — |
| AC3.3 Unmatched file skipped | `test_resolver.py::test_unmatched_file_skipped` | — |
| AC3.4 Most specific path | `test_resolver.py::test_most_specific_path_wins` | — |
| AC4.1 Command interpolation | `test_renderer.py::test_command_interpolation` | — |
| AC4.2 Output collection | `test_renderer.py::test_output_files_collected_by_format` | Phase 2, step 2.3 |
| AC4.3 kicad-cli auto-detect | `test_renderer.py::test_kicad_cli_auto_detect_when_on_path` | Phase 2, steps 2.1–2.2 |
| AC4.3 KiBot fallback | `test_renderer.py::test_kibot_fallback_when_kicad_cli_missing` | — |
| AC4.4 Failed render skipped | `test_renderer.py::test_failed_render_skipped` | Partial failure E2E |
| AC4.5 No renderer error | `test_renderer.py::test_no_renderer_available_shows_error` | — |
| AC5.1 API retry | `test_client.py::test_api_retry_on_transient_failure` | — |
| AC5.2 S3 retry | `test_client.py::test_s3_upload_retry` | — |
| AC5.3 API unreachable | `test_client.py::test_api_unreachable_raises_after_retries` | — |
| AC5.4 Oversized file skipped | `test_client.py::test_oversized_file_skipped` | File size limit E2E |
| AC6.1 GitHub adapter extract | `test_github_adapter.py::test_extracts_commit_info` | Phase 4, step 4.3 |
| AC6.2 `init` creates config | `test_cli.py::test_init_creates_config` | Phase 1, step 1.1 |
| AC6.3 Missing GitHub env vars | `test_github_adapter.py::test_missing_env_vars_raises` | Phase 1, step 1.5 |
| AC7.1 Full pipeline E2E | `test_integration.py::test_full_pipeline_posts_preview` | Phase 3 + phase 4 |
| AC7.2 Multi-project E2E | `test_integration.py::test_multi_project_pipeline` | Multi-project E2E |
