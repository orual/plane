# plane-hw-preview

Last verified: 2026-02-15

## Purpose

Standalone CLI tool that renders KiCad hardware design files (schematics and PCB layouts) into preview images and posts them as comments on Plane issues. Designed to run inside GitHub Actions on push events so hardware engineers get visual diffs on every commit.

## Contracts

- **Exposes**: `plane-preview` CLI with two commands: `init` (scaffold config) and `post` (render and upload).
- **Guarantees**: Idempotent comment posting (deduplicates by `{commit_sha}:{issue_id}`). Files exceeding 5 MB are skipped, never uploaded. Render failures are logged and skipped; the pipeline does not abort on partial failure.
- **Expects**: `PLANE_API_KEY` env var. A `.plane-preview.yml` config file. For rendering: `kicad-cli` or `kibot` on PATH (auto-detected when no explicit renderer config is provided).

## Dependencies

- **Uses**: Plane external API v1 (`/api/v1/workspaces/{slug}/assets/`, `/api/v1/workspaces/{slug}/projects/{id}/work-items/{id}/comments/`). S3-compatible storage via presigned URLs returned by the Plane API.
- **Used by**: GitHub Actions workflows (not imported by any other package in this repo).
- **Boundary**: This is a standalone Python package with its own `pyproject.toml`. It does not import from the Django backend or frontend packages.

## Key decisions

- Standalone package (not a Django app): Keeps CI dependencies minimal; only needs Python, httpx, and a KiCad renderer.
- Adapter pattern for CI environments: `GitHubAdapter` extracts commit metadata from GitHub Actions env vars. New adapters (GitLab, etc.) implement the same `AdapterResult` dataclass.
- Auto-detect renderer priority: kicad-cli first (built into KiCad, no config needed), then KiBot (needs config file). Explicit `renderers` config in YAML overrides auto-detection.

## Invariants

- Comments always include `external_source: "plane-hw-preview"` and `external_id: "{sha}:{issue_id}"` for deduplication.
- Commit message parsing uses word-boundary-anchored regex to avoid false matches inside words.
- All API calls use retry with exponential backoff (3 attempts for Plane API, 2 for S3).

## Key files

- `cli.py` -- Click CLI entry point (`init`, `post` commands)
- `client.py` -- PlaneClient: S3 upload flow (presign, upload, confirm) and comment creation
- `config.py` -- ConfigLoader: YAML parsing and validation
- `renderer.py` -- Renderer: command interpolation, subprocess execution, output collection
- `resolver.py` -- IssueResolver: maps changed files to Plane issues via commit patterns and path mappings
- `adapters/github.py` -- GitHubAdapter: extracts commit metadata from GitHub Actions environment
- `types.py` -- Shared dataclasses (AssetUploadResult, RenderFile, PreviewTarget, PlaneAPIError)

## Commands

```bash
# Install in dev mode
pip install -e ".[dev]"

# Run tests
pytest

# Lint and format
ruff check .
ruff format .
```

## Gotchas

- Temp directories for rendered output are intentionally not cleaned up by the renderer; they must persist until the client uploads them.
- The resolver creates placeholder `RenderFile` objects (with empty render_path) that the CLI later matches against actual render output by `source_path`.
