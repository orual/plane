# KiCad Preview Pipeline Design

## Summary

This design describes a Python library and CLI tool (`plane-hw-preview`) that automatically
posts rendered hardware design previews to Plane issues when developers push KiCad schematic
or PCB layout changes. The core library is git-host-agnostic: it takes rendered image files
(PNG/SVG), resolves which Plane issues should receive previews based on commit messages or
file paths, uploads the images via Plane's presigned S3 API, and creates grouped comments
with embedded images. GitHub Actions is the first supported CI environment, with a thin
adapter (~30 lines) that extracts commit metadata from GitHub's environment variables.

The system follows a library + adapters pattern. The core modules (PlaneClient for API
interaction, IssueResolver for mapping files to issues, Renderer for executing configurable
render commands, ConfigLoader for YAML parsing) are imported by git-host-specific adapters.
Issue resolution uses two strategies: regex extraction of identifiers from commit messages
(e.g., `PWR-42` matches the project with prefix `PWR`) and glob pattern matching of changed
file paths against configured mappings with fallback default issues. The library handles
errors gracefully — invalid issue IDs and failed renders produce warnings but don't block
the pipeline; duplicate comments are prevented via Plane's `external_source`/`external_id`
deduplication fields. This is the first external tool to post automated content to Plane
issues.

## Definition of Done

When a developer pushes KiCad schematic or PCB layout changes to a git repository, rendered
preview images are automatically posted as comments on the linked Plane issue, with no manual
steps beyond including an issue identifier in the commit message or having a path mapping
configured. The posting library is reusable across git hosting providers, with GitHub Actions
as the first supported CI consumer.

Specifically:

1. A reusable Python library/CLI (`plane-hw-preview`) that takes rendered image files and
   posts them as image-embedded comments on Plane issues via the Plane REST API.
2. Issue linking via two mechanisms: commit message parsing (e.g., `PROJ-42`) and
   config-based path-to-project/issue mapping (e.g., `hardware/power-stage/**` maps to a
   specific project).
3. A GitHub Actions workflow that triggers on KiCad file changes (`.kicad_sch`, `.kicad_pcb`),
   runs KiBot to render schematics/PCB layouts to SVG/PNG, and uses the library to post
   previews to Plane.
4. The core library is git-host-agnostic: Plane posting logic is separate from
   git-host-specific commit/webhook parsing. GitHub is the first integration; GitLab/Gitea
   parsers can be added without restructuring.

**Out of scope:** persistent sidecar/webhook service (future option), Altium/SolidWorks
rendering, Plane frontend UI changes, bidirectional sync (Plane → git).

## Acceptance Criteria

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

### kicad-preview.AC2: Commit message parsing extracts issue identifiers

- **kicad-preview.AC2.1 Success:** Commit message containing `PWR-42` is matched to the
  project configured with prefix `PWR`
- **kicad-preview.AC2.2 Success:** Multiple identifiers in one commit message (e.g.,
  `PWR-42 CTRL-7`) are each resolved independently
- **kicad-preview.AC2.3 Success:** Identifiers are matched case-insensitively (`pwr-42`
  matches prefix `PWR`)
- **kicad-preview.AC2.4 Success:** Identifiers in brackets (`[PWR-42]`) are extracted
  correctly
- **kicad-preview.AC2.5 Failure:** Commit message with no recognisable identifiers
  produces no matches (no error)

### kicad-preview.AC3: Path mapping resolves changed files to issues

- **kicad-preview.AC3.1 Success:** A changed file matching a `path_mappings` glob is
  linked to the configured project and `default_issue`
- **kicad-preview.AC3.2 Success:** Commit message identifiers take priority over path
  mapping `default_issue` for the same file
- **kicad-preview.AC3.3 Success:** Changed files matching no commit pattern and no path
  mapping are silently skipped
- **kicad-preview.AC3.4 Edge:** Overlapping path patterns (e.g., `hardware/**` and
  `hardware/power-stage/**`) use the most specific match

### kicad-preview.AC4: Renderer executes configurable commands

- **kicad-preview.AC4.1 Success:** Configured render command is executed with correct
  `{file}`, `{output_dir}`, and `{config}` interpolation
- **kicad-preview.AC4.2 Success:** Output files matching configured `formats` are
  collected from the output directory after rendering
- **kicad-preview.AC4.3 Success:** When no `renderers` section is configured and KiBot is
  on PATH, `.kicad_sch` and `.kicad_pcb` files are rendered with KiBot defaults
- **kicad-preview.AC4.4 Failure:** Render command returning non-zero exit code is logged
  and skipped; other files continue rendering
- **kicad-preview.AC4.5 Failure:** When no `renderers` section is configured and KiBot is
  not on PATH, a clear error message is shown for KiCad files

### kicad-preview.AC5: Error handling and retry behaviour

- **kicad-preview.AC5.1 Success:** Transient Plane API failures are retried 3× with
  exponential backoff before failing
- **kicad-preview.AC5.2 Success:** Transient S3 upload failures are retried 2× before
  failing
- **kicad-preview.AC5.3 Failure:** Plane API unreachable after retries causes non-zero
  exit (CI step fails)
- **kicad-preview.AC5.4 Edge:** Files exceeding Plane's 5 MB asset limit are logged as
  warnings and skipped

### kicad-preview.AC6: GitHub adapter and CLI

- **kicad-preview.AC6.1 Success:** `plane-preview post --adapter github` extracts commit
  SHA, message, branch, URL, and changed files from GitHub Actions environment
- **kicad-preview.AC6.2 Success:** `plane-preview init` copies the template config to
  `.plane-preview.yml` in the current directory
- **kicad-preview.AC6.3 Failure:** Running with `--adapter github` outside GitHub Actions
  (missing env vars) produces a clear error

### kicad-preview.AC7: End-to-end pipeline

- **kicad-preview.AC7.1 Success:** Full pipeline from GitHub push event → file rendering →
  image upload → Plane comment executes without manual intervention
- **kicad-preview.AC7.2 Success:** Pipeline handles a commit touching multiple KiCad files
  across multiple projects, posting correct renders to correct issues

## Glossary

- **KiCad**: Open-source electronic design automation (EDA) software for designing
  schematics and printed circuit boards. Files: `.kicad_sch` (schematics), `.kicad_pcb`
  (PCB layouts).
- **KiBot**: Automation tool for KiCad that renders schematic and PCB files to various
  output formats (PNG, SVG, PDF, Gerber) via command-line interface.
- **Presigned S3 upload**: Three-step file upload flow where the client requests a
  temporary signed URL from the server, uploads directly to S3, then notifies the server
  of completion. Avoids routing file data through the application server.
- **Adapter pattern**: Design where a thin compatibility layer translates one interface to
  another. Here, git-host-specific adapters translate hosting event data into a common
  `AdapterResult` format consumed by the core library.
- **External source/ID**: Plane database fields (`external_source`, `external_id`) that
  identify content created by external integrations. Used for deduplication — creating a
  comment with an existing pair returns 409 instead of a duplicate.
- **Glob pattern**: File path matching syntax with wildcards, e.g.,
  `hardware/**/*.kicad_sch` matches all `.kicad_sch` files under `hardware/`.
- **Exponential backoff**: Retry strategy where wait time doubles after each failure
  (e.g., 1s, 2s, 4s). Used for transient API failures.
- **Workspace-scoped token**: Plane API key granting access within a specific workspace.
  Verified via `X-Api-Key` header.

## Architecture

The system uses a **library + adapters** pattern with three layers:

**Core library (`plane_preview`)** — git-host-agnostic, pip-installable as `plane-hw-preview`:

- **PlaneClient** — handles Plane API interaction: three-step presigned S3 upload
  (request presigned URL → upload to S3 → confirm), comment creation with HTML `<img>`
  tags referencing uploaded asset URLs. Uses `X-Api-Key` header authentication.
  Leverages Plane's `external_source`/`external_id` fields for idempotent comment
  creation (`external_source: "plane-hw-preview"`,
  `external_id: "{commit_sha}:{issue_id}"`) — re-runs produce a 409 Conflict instead
  of duplicate comments.

- **IssueResolver** — takes changed file list and commit messages, returns a list of
  `(project_id, issue_id)` targets. Two resolution strategies, both checked per file:
  1. Regex extraction of issue identifiers from commit messages (e.g., `PWR-42`) matched
     against configured project prefixes. Explicit references always win.
  2. Glob pattern matching of changed file paths against `.plane-preview.yml` path
     mappings, falling back to a configured `default_issue` per path.
     If neither matches a file, the file is silently skipped.

- **Renderer** — runs configurable render commands per file type. Default: KiBot for
  `.kicad_sch`/`.kicad_pcb` when KiBot is on PATH. Custom commands supported via YAML
  config with `{file}`, `{output_dir}`, `{config}` template variables. Failed renders
  are logged and skipped — one broken file does not block others.

- **ConfigLoader** — parses `.plane-preview.yml` from the repo root. Applies defaults
  for missing sections (auto-detect KiCad renderers if no `renderers` block).

**Adapters** — thin modules per git hosting provider:

- **GitHubAdapter** — extracts commit SHA, message, branch, URL, and changed file list
  from GitHub Actions environment variables (`$GITHUB_SHA`, `$GITHUB_REF_NAME`,
  `$GITHUB_EVENT_PATH`). Approximately 30 lines.
- Future adapters (GitLab, Gitea) implement the same interface.

All adapters produce an `AdapterResult` dataclass:

```python
@dataclass
class AdapterResult:
    commit_sha: str
    commit_message: str
    commit_url: str
    branch: str
    changed_files: list[str]
```

**CLI entrypoint** — `plane-preview post --adapter github` wires adapter → resolver →
renderer → client. `plane-preview init` copies the template config to the repo root.

**Data flow:**

```
Git push triggers CI
  → Adapter extracts commit info (AdapterResult)
  → IssueResolver maps changed files to Plane issues
  → Renderer executes render commands, collects output images
  → PlaneClient uploads images via presigned S3 flow
  → PlaneClient creates one comment per issue with grouped renders
```

### Config format

`.plane-preview.yml` lives in the hardware repository root:

```yaml
plane:
  base_url: https://plane.example.com
  workspace: my-workspace

commit_patterns:
  - prefix: "PWR"
    project: "power-stage"
  - prefix: "CTRL"
    project: "control-board"

path_mappings:
  - pattern: "hardware/power-stage/**"
    project: "power-stage"
    default_issue: "PWR-1"
  - pattern: "hardware/control/**"
    project: "control-board"
    default_issue: "CTRL-1"

renderers:
  - match: "**/*.kicad_sch"
    command: "kibot -c {config} -d {output_dir} -b {file}"
    config: "hardware/kibot.yaml"
    formats: ["png", "svg"]
  - match: "**/*.kicad_pcb"
    command: "kibot -c {config} -d {output_dir} -b {file}"
    config: "hardware/kibot.yaml"
    formats: ["png", "svg"]
```

A template config with commented examples ships with the library at
`plane_preview/templates/plane-preview.yml`.

### Comment format

One comment per issue per commit, with all relevant renders grouped:

```html
<h3>Hardware preview — commit <a href="{commit_url}">{short_sha}</a></h3>
<p>Branch: <code>{branch}</code></p>
<h4>{relative_file_path}</h4>
<p><img src="{asset_url}" alt="{filename} render" /></p>
<!-- repeated for each changed file linked to this issue -->
```

### Plane API endpoints used

- `POST /api/v1/workspaces/{slug}/assets/` — request presigned upload URL
- `PATCH /api/v1/workspaces/{slug}/assets/{asset_id}/` — confirm upload
- `POST /api/v1/workspaces/{slug}/projects/{project_id}/work-items/{issue_id}/comments/`
  — create comment with `comment_html` and `external_source`/`external_id`

Auth: `X-Api-Key` header with token from `PLANE_API_KEY` environment variable.

### Error handling

| Scenario                           | Behaviour                                                            |
| ---------------------------------- | -------------------------------------------------------------------- |
| Plane API unreachable              | Retry 3× with exponential backoff, then fail CI step (non-zero exit) |
| S3 upload fails                    | Retry 2×, then fail                                                  |
| Invalid issue ID in commit message | Log warning, skip that issue, continue. Exit 0.                      |
| Render command fails for one file  | Log error, skip that file, continue with others                      |
| Duplicate comment (CI re-run)      | Plane returns 409 via `external_id` dedup. Log skip, no error.       |
| `PLANE_API_KEY` missing            | Fail fast at init with clear error message                           |
| File exceeds Plane's 5 MB limit    | Log warning, skip file                                               |

## Existing Patterns

This design follows Plane's established integration patterns:

- **Presigned S3 upload** — the three-step flow (request → upload → confirm) matches
  Plane's `GenericAssetEndpoint` pattern used by the web frontend and existing
  integrations. Located at `apps/api/plane/api/views/asset.py:495-617`.

- **External source/ID deduplication** — Plane's comment and asset models support
  `external_source` and `external_id` fields for preventing duplicate creation from
  external integrations. This is the same pattern used by Plane's own import tools.
  Returns HTTP 409 Conflict on duplicate.

- **API key authentication** — Plane's external API (`/api/v1/`) uses `X-Api-Key` header
  auth with workspace-scoped tokens. Token model at
  `apps/api/plane/db/models/api.py:23-48`, middleware at
  `apps/api/plane/api/middleware/api_authentication.py`.

No existing patterns exist for render pipelines or CI integrations in the Plane
codebase — this is the first external tooling that posts automated content to Plane
issues.

## Implementation Phases

<!-- START_PHASE_1 -->

### Phase 1: Package scaffolding and PlaneClient

**Goal:** Establish the Python package structure and implement the core Plane API
interaction layer.

**Components:**

- `pyproject.toml` with project metadata, dependencies (httpx, click, pyyaml), and
  CLI entrypoint
- `plane_preview/client.py` — PlaneClient class handling presigned S3 upload (three-step
  flow) and comment creation with HTML content
- `plane_preview/adapters/base.py` — AdapterResult dataclass

**Dependencies:** None (first phase)

**Done when:** PlaneClient can upload a file and create a comment on a Plane issue via
the external API. Tests verify the three-step upload flow, comment creation, 409
deduplication handling, retry logic, and auth failure. Covers `kicad-preview.AC1.*`
and `kicad-preview.AC5.*`.

<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->

### Phase 2: Config and issue resolution

**Goal:** Parse `.plane-preview.yml` config and resolve changed files to Plane issue
targets.

**Components:**

- `plane_preview/config.py` — ConfigLoader that reads YAML, validates structure, applies
  defaults (auto-detect KiCad renderers when `renderers` section omitted and KiBot on
  PATH)
- `plane_preview/resolver.py` — IssueResolver implementing commit message regex parsing
  and glob-based path mapping with resolution priority (commit message wins)
- `plane_preview/templates/plane-preview.yml` — template config with commented examples

**Dependencies:** Phase 1 (AdapterResult dataclass)

**Done when:** Config parsing handles valid YAML, missing optional sections, and invalid
configs with clear errors. Issue resolution correctly handles commit message extraction,
path mapping, multiple issues per commit, multiple files per issue grouping, and
no-match skipping. Tests cover all resolution strategies and edge cases. Covers
`kicad-preview.AC2.*` and `kicad-preview.AC3.*`.

<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->

### Phase 3: Renderer system

**Goal:** Execute configurable render commands and collect output files.

**Components:**

- `plane_preview/renderer.py` — Renderer class that matches changed files to renderer
  configs, interpolates command templates (`{file}`, `{output_dir}`, `{config}`),
  executes via subprocess, and collects output files by format glob
- Default KiBot renderer auto-configuration when no `renderers` section present

**Dependencies:** Phase 2 (config loading)

**Done when:** Renderer executes configured commands, collects output files, handles
command failures gracefully (log + skip), and auto-detects KiBot for KiCad files when
unconfigured. Tests verify command interpolation, output collection, failure isolation,
and default detection. Covers `kicad-preview.AC4.*`.

<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->

### Phase 4: GitHub adapter and CLI

**Goal:** Wire everything together with the GitHub Actions adapter and CLI entrypoint.

**Components:**

- `plane_preview/adapters/github.py` — GitHubAdapter extracting commit info from GitHub
  Actions environment variables and event payload JSON
- `plane_preview/cli.py` — Click CLI with `post` command (wires adapter → resolver →
  renderer → client) and `init` command (copies template config)

**Dependencies:** Phases 1-3

**Done when:** `plane-preview post --adapter github` runs the full pipeline from adapter
through posting. `plane-preview init` creates a `.plane-preview.yml` from the template.
Tests verify GitHub env var extraction, CLI argument handling, and end-to-end pipeline
with fixture data. Covers `kicad-preview.AC6.*`.

<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->

### Phase 5: Integration testing and documentation

**Goal:** End-to-end validation and user-facing documentation.

**Components:**

- `tests/test_integration.py` — full pipeline test with fixture KiCad files, mock Plane
  API, and mock renderer
- `README.md` — quickstart guide, config reference, GitHub Actions workflow example
- Example GitHub Actions workflow YAML

**Dependencies:** Phase 4

**Done when:** Integration test exercises the full data flow (adapter → resolver →
renderer → client → comment). README covers installation, config, and GitHub Actions
setup. Covers `kicad-preview.AC7.*`.

<!-- END_PHASE_5 -->

## Additional Considerations

**Renderer agnosticism:** although named `plane-hw-preview` and designed with KiCad as
the primary use case, the renderer system is fully generic. Any tool that produces image
files from source files can be configured. The library does not depend on KiBot at the
Python level — KiBot is a runtime dependency only when using the default KiCad renderer
config.

**Future sidecar service:** the core library (PlaneClient, IssueResolver, Renderer) is
designed to be importable. A future persistent webhook service could import these
components directly rather than shelling out to the CLI. No architectural changes needed.

**File size limits:** Plane's default asset size limit is 5 MB. KiBot PNG renders of
complex boards with many layers can exceed this. The library logs a warning and skips
oversized files. Users can mitigate by configuring SVG output (typically smaller) or
adjusting KiBot DPI settings.
