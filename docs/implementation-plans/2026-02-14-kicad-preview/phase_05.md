# KiCad Preview Pipeline Implementation Plan — Phase 5

**Goal:** End-to-end validation with real KiCad rendering and user-facing documentation.

**Architecture:** Integration tests exercising the full pipeline with real `kicad-cli`
rendering against minimal KiCad fixture files. Only the Plane API boundary is mocked
(via respx). This validates the actual render → collect → upload → comment flow with
real file I/O and subprocess execution. Plus README documentation and an example
GitHub Actions workflow YAML.

**Tech Stack:** Python 3.10+, pytest, respx, Click CliRunner, kicad-cli (runtime)

**Scope:** 5 phases from original design (phases 1-5)

**Codebase verified:** 2026-02-15

**Prerequisites:** `kicad-cli` must be on PATH (provided by `kicad` in flake.nix devShell).

---

## Acceptance Criteria Coverage

This phase implements and tests:

### kicad-preview.AC7: End-to-end pipeline

- **kicad-preview.AC7.1 Success:** Full pipeline from GitHub push event → file rendering →
  image upload → Plane comment executes without manual intervention
- **kicad-preview.AC7.2 Success:** Pipeline handles a commit touching multiple KiCad files
  across multiple projects, posting correct renders to correct issues

**Design evolution note:** The original Phase 5 used mocked subprocess calls for
rendering. This was updated to use real `kicad-cli` rendering against minimal KiCad
fixture files, providing genuine end-to-end confidence. Only the Plane API (httpx
calls) remains mocked via respx.

---

<!-- START_TASK_1 -->
### Task 1: Integration test fixtures

**Files:**
- Create: `tools/plane-hw-preview/tests/fixtures/event.json`
- Create: `tools/plane-hw-preview/tests/fixtures/config.yml`
- Create: `tools/plane-hw-preview/tests/fixtures/power-stage/main.kicad_sch`
  (minimal real KiCad schematic that kicad-cli can render)
- Create: `tools/plane-hw-preview/tests/fixtures/control/board.kicad_pcb`
  (minimal real KiCad PCB that kicad-cli can render)

**Step 1: Create fixture data**

`event.json` — simulates a GitHub push event touching files in two projects:
```json
{
  "head_commit": {
    "id": "abc1234567890def",
    "message": "PWR-42 CTRL-7 update board layouts",
    "url": "https://github.com/org/hw-repo/commit/abc1234567890def"
  },
  "commits": [
    {
      "id": "abc1234567890def",
      "added": ["power-stage/main.kicad_sch"],
      "modified": ["control/board.kicad_pcb"],
      "removed": []
    }
  ],
  "ref": "refs/heads/main"
}
```

`config.yml` — maps prefixes and paths to two projects, with `kicad-cli` as the
explicit renderer (not relying on auto-detect so the test config is self-contained):
```yaml
plane:
  base_url: https://plane.example.com
  workspace: test-workspace

commit_patterns:
  - prefix: "PWR"
    project: "power-stage"
  - prefix: "CTRL"
    project: "control-board"

path_mappings:
  - pattern: "power-stage/**"
    project: "power-stage"
    default_issue: "PWR-1"
  - pattern: "control/**"
    project: "control-board"
    default_issue: "CTRL-1"

renderers:
  - match: "**/*.kicad_sch"
    command: "kicad-cli sch export svg -o {output_dir} {file}"
    config: ""
    formats: ["svg"]
  - match: "**/*.kicad_pcb"
    command: "kicad-cli pcb export svg -o {output_dir}/{file_stem}-pcb.svg --layers F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts --page-size-mode 2 {file}"
    config: ""
    formats: ["svg"]
```

**Step 2: Create minimal KiCad fixture files**

These are real KiCad files that `kicad-cli` can render to SVG. They should be as
small as possible while still being valid.

`power-stage/main.kicad_sch` — minimal schematic with a single resistor symbol:
```
(kicad_sch
  (version 20231120)
  (generator "test_fixture")
  (generator_version "9.0")
  (uuid "00000000-0000-0000-0000-000000000001")
  (paper "A4")
  (lib_symbols
    (symbol "Device:R"
      (pin_numbers hide)
      (pin_names (offset 0))
      (exclude_from_sim no)
      (in_bom yes)
      (on_board yes)
      (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (symbol "R_0_1"
        (rectangle (start -1.016 -2.54) (end 1.016 2.54)
          (stroke (width 0.254) (type default))
          (fill (type none))
        )
      )
      (symbol "R_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27)
          (name "~" (effects (font (size 1.27 1.27)))) (number "1"))
        (pin passive line (at 0 -3.81 90) (length 1.27)
          (name "~" (effects (font (size 1.27 1.27)))) (number "2"))
      )
    )
  )
  (symbol
    (lib_id "Device:R")
    (at 100 100 0)
    (unit 1)
    (exclude_from_sim no)
    (in_bom yes)
    (on_board yes)
    (dnp no)
    (uuid "00000000-0000-0000-0000-000000000002")
    (property "Reference" "R1"
      (at 102.032 100 90) (effects (font (size 1.27 1.27))))
    (property "Value" "10k"
      (at 100 100 90) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "00000000-0000-0000-0000-000000000003"))
    (pin "2" (uuid "00000000-0000-0000-0000-000000000004"))
  )
)
```

`control/board.kicad_pcb` — minimal PCB with an edge cut rectangle and silkscreen text:
```
(kicad_pcb
  (version 20240108)
  (generator "test_fixture")
  (generator_version "9.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (44 "Edge.Cuts" user)
  )
  (setup
    (pad_to_mask_clearance 0)
  )
  (net 0 "")
  (gr_rect
    (start 100 100)
    (end 150 130)
    (stroke (width 0.1) (type default))
    (fill none)
    (layer "Edge.Cuts")
    (uuid "00000000-0000-0000-0000-000000000010")
  )
  (gr_text "Test PCB"
    (at 125 115)
    (layer "F.SilkS")
    (uuid "00000000-0000-0000-0000-000000000011")
    (effects (font (size 3 3) (thickness 0.5)))
  )
)
```

These files have been verified to render successfully with `kicad-cli` 9.0.7,
producing SVG output of ~50KB each in under 1 second.

**Step 3: Verify fixtures render**

```bash
cd tools/plane-hw-preview
mkdir -p /tmp/fixture-test
kicad-cli sch export svg -o /tmp/fixture-test tests/fixtures/power-stage/main.kicad_sch
kicad-cli pcb export svg -o /tmp/fixture-test/board-pcb.svg \
  --layers F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts --page-size-mode 2 \
  tests/fixtures/control/board.kicad_pcb
ls -lh /tmp/fixture-test/
rm -rf /tmp/fixture-test
```

Expected: Both commands succeed, SVG files are created.

**Commit:** `test: add real KiCad integration test fixtures`
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-3) -->
<!-- START_TASK_2 -->
### Task 2: Integration test with real rendering

**Verifies:** kicad-preview.AC7.1, kicad-preview.AC7.2

**Files:**
- Create: `tools/plane-hw-preview/tests/test_integration.py`

**Testing:**

```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"
```

Helper to check if kicad-cli is available:
```python
import shutil

KICAD_CLI_AVAILABLE = shutil.which("kicad-cli") is not None
requires_kicad = pytest.mark.skipif(
    not KICAD_CLI_AVAILABLE,
    reason="kicad-cli not on PATH (install KiCad or enter nix develop)"
)
```

Class `TestEndToEndPipeline` with `@pytest.mark.smoke` and `@requires_kicad`:

- **kicad-preview.AC7.1:** `test_full_pipeline_posts_preview` — Exercise the complete
  pipeline with real rendering using Click's `CliRunner`:
  1. Copy fixture KiCad files from `FIXTURES_DIR` to `tmp_path` preserving directory
     structure (so the renderer can find them at the paths listed in event.json)
  2. Copy `config.yml` to `tmp_path`
  3. Write a modified `event.json` to `tmp_path` that references only one project
     (e.g., just the schematic file in `power-stage/`)
  4. Set up GitHub Actions env vars (`GITHUB_SHA`, `GITHUB_REF_NAME`,
     `GITHUB_EVENT_PATH`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, `PLANE_API_KEY`)
     pointing to the `tmp_path` fixtures
  5. Mock httpx via `respx`:
     - Asset upload: presigned URL endpoint returns `{"upload_data": {"url": "...",
       "fields": {}}, "asset_id": "asset-uuid", "asset_url": "https://s3/asset.svg"}`
     - S3 upload: POST to the presigned URL returns 204
     - Asset confirm: PATCH returns 204
     - Comment creation: POST returns 201 with `{"id": "comment-uuid"}`
  6. Run `CliRunner.invoke(main, ["post", "--adapter", "github", "--config",
     str(tmp_path / "config.yml")])`
  7. Verify exit code 0
  8. Verify at least one asset upload request was made (the presigned URL POST)
  9. Verify the uploaded data was a real SVG file (check the request body contains
     `<svg` or the content-type is `image/svg+xml`)
  10. Verify comment creation was called with HTML containing `<img>` tags

- **kicad-preview.AC7.2:** `test_multi_project_pipeline` — Same setup but with both
  projects:
  1. Copy all fixture files to `tmp_path`
  2. Use the full `event.json` with both `power-stage/main.kicad_sch` and
     `control/board.kicad_pcb`
  3. Set up env vars and respx mocks as above
  4. Run the CLI
  5. Verify exit code 0
  6. Verify TWO separate comment creation requests were made (one per issue)
  7. Verify the comment for PWR-42 references schematic renders (SVG from the
     `.kicad_sch` file)
  8. Verify the comment for CTRL-7 references PCB renders (SVG from the
     `.kicad_pcb` file)
  9. Verify each comment's HTML only contains `<img>` tags for its own issue's renders

Helper fixtures:
```python
@pytest.fixture
def github_env(tmp_path):
    """Set up GitHub Actions environment for integration tests."""
    # Copy fixture files from FIXTURES_DIR to tmp_path
    shutil.copytree(FIXTURES_DIR / "power-stage", tmp_path / "power-stage")
    shutil.copytree(FIXTURES_DIR / "control", tmp_path / "control")
    shutil.copy2(FIXTURES_DIR / "config.yml", tmp_path / "config.yml")
    shutil.copy2(FIXTURES_DIR / "event.json", tmp_path / "event.json")

    env = {
        "GITHUB_SHA": "abc1234567890def",
        "GITHUB_REF_NAME": "main",
        "GITHUB_EVENT_PATH": str(tmp_path / "event.json"),
        "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_REPOSITORY": "org/hw-repo",
        "PLANE_API_KEY": "plane_api_test_key",
    }
    with unittest.mock.patch.dict(os.environ, env, clear=False):
        yield tmp_path
```

Note: The `event.json` fixture references relative paths (`power-stage/main.kicad_sch`,
`control/board.kicad_pcb`). The CLI must resolve these relative to the working directory.
The test should either `monkeypatch.chdir(tmp_path)` or the CLI should accept a
`--workdir` option. Use `monkeypatch.chdir(tmp_path)` for simplicity.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_integration.py -v
```

Expected: All integration tests pass (requires `kicad-cli` on PATH). Tests are skipped
with a clear message if `kicad-cli` is not available.

**Commit:** `test: add end-to-end integration tests with real kicad-cli rendering`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Full test suite verification

**Files:** None (verification only)

**Step 1: Run complete test suite**

```bash
cd tools/plane-hw-preview
pytest tests/ -v --tb=short
```

Expected: All tests pass across all test files:
- `test_client.py` (Phase 1)
- `test_preview.py` (Phase 1)
- `test_config.py` (Phase 2)
- `test_resolver.py` (Phase 2)
- `test_renderer.py` (Phase 3)
- `test_github_adapter.py` (Phase 4)
- `test_cli.py` (Phase 4)
- `test_integration.py` (Phase 5)

**Step 2: Run with coverage**

```bash
cd tools/plane-hw-preview
pytest tests/ --cov=plane_preview --cov-report=term-missing
```

Expected: Coverage report shows all core modules covered. No need for a strict
threshold — this is a new package.

No commit needed (verification only).
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_4 -->
### Task 4: README documentation

**Files:**
- Create: `tools/plane-hw-preview/README.md`

**Step 1: Write README**

The README should cover:

1. **Overview** — one paragraph explaining what `plane-hw-preview` does
2. **Installation** — `pip install -e .` for development, future PyPI for production
3. **Quick start** — step-by-step:
   - Run `plane-preview init` to create config
   - Edit `.plane-preview.yml` with Plane workspace settings
   - Set `PLANE_API_KEY` environment variable
   - Add GitHub Actions workflow
4. **Configuration reference** — document each section of `.plane-preview.yml`:
   - `plane` (base_url, workspace)
   - `commit_patterns` (prefix, project)
   - `path_mappings` (pattern, project, default_issue)
   - `renderers` (match, command, config, formats)
5. **Rendering** — explain the auto-detect behaviour:
   - Default: `kicad-cli` (built into KiCad, no config needed)
   - Fallback: `kibot` (if kicad-cli unavailable, requires config)
   - Custom: configure any renderer via the `renderers` section
   - Note that KiBot has a GitHub Action for CI environments
6. **GitHub Actions workflow example** — complete workflow YAML (see Task 5)
7. **Issue linking** — explain the two resolution strategies
8. **Nix development** — note that `nix develop` provides `kicad-cli` automatically
9. **Error handling** — summary of how errors are handled

Keep it practical and concise. Use code blocks for examples.

**Verification:**

```bash
cat tools/plane-hw-preview/README.md | head -5
```

Expected: README exists with title and overview.

**Commit:** `docs: add README with quickstart and configuration reference`
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Example GitHub Actions workflow

**Files:**
- Create: `tools/plane-hw-preview/examples/github-actions-workflow.yml`

**Step 1: Create example workflow**

```yaml
name: Hardware preview

on:
  push:
    paths:
      - "**.kicad_sch"
      - "**.kicad_pcb"

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install KiCad
        run: |
          sudo add-apt-repository --yes ppa:kicad/kicad-8.0-releases
          sudo apt-get update
          sudo apt-get install --no-install-recommends -y kicad

      - name: Install plane-hw-preview
        run: pip install ./tools/plane-hw-preview

      - name: Post previews to Plane
        env:
          PLANE_API_KEY: ${{ secrets.PLANE_API_KEY }}
        run: plane-preview post --adapter github
```

Note: This workflow uses `kicad-cli` (included with KiCad) as the default renderer.
For KiBot-based rendering (with schematic diff support), replace the KiCad install
step with the KiBot GitHub Action:

```yaml
      # Alternative: KiBot-based rendering
      - uses: INTI-CMNB/KiBot@v2
        with:
          config: .kibot.yaml
```

**Step 2: Verify file exists**

```bash
cat tools/plane-hw-preview/examples/github-actions-workflow.yml
```

**Commit:** `docs: add example GitHub Actions workflow`
<!-- END_TASK_5 -->
