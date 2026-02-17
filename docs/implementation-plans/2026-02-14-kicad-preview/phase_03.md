# KiCad Preview Pipeline Implementation Plan — Phase 3

**Goal:** Execute configurable render commands and collect output files.

**Architecture:** A `Renderer` class that matches changed files against renderer
configs (from Phase 2's `RendererConfig`), interpolates command templates, executes
via subprocess, and collects output files by format. When no explicit renderer config
exists, auto-detects available renderers: first `kicad-cli` (built into KiCad, no
config file needed), then `kibot` (requires a generated config file). Both are runtime
dependencies only — not Python imports.

**Tech Stack:** Python 3.10+, subprocess (stdlib), shutil (stdlib), tempfile (stdlib),
fnmatch (stdlib), glob (stdlib), shlex (stdlib)

**Scope:** 5 phases from original design (phases 1-5)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### kicad-preview.AC4: Renderer executes configurable commands

- **kicad-preview.AC4.1 Success:** Configured render command is executed with correct
  `{file}`, `{output_dir}`, and `{config}` interpolation
- **kicad-preview.AC4.2 Success:** Output files matching configured `formats` are
  collected from the output directory after rendering
- **kicad-preview.AC4.3 Success:** When no `renderers` section is configured and
  `kicad-cli` or KiBot is on PATH, `.kicad_sch` and `.kicad_pcb` files are rendered
  with auto-detected defaults (`kicad-cli` preferred over KiBot)
- **kicad-preview.AC4.4 Failure:** Render command returning non-zero exit code is logged
  and skipped; other files continue rendering
- **kicad-preview.AC4.5 Failure:** When no `renderers` section is configured and neither
  `kicad-cli` nor KiBot is on PATH, a clear error message is shown for KiCad files

**Design evolution note:** The original design specified KiBot as the sole auto-detect
renderer. This was updated to prefer `kicad-cli` (built into KiCad, available via Nix,
no config file needed) with KiBot as fallback. KiBot remains fully supported through
the configurable `renderers` section and offers advanced features like schematic diffs.

---

## External Dependency Investigation Findings

**kicad-cli (primary auto-detect):**
- Built into KiCad 9.x, available as `kicad-cli` on PATH when KiCad is installed
- Schematic export: `kicad-cli sch export svg -o <output_dir> <file>`
- PCB export: `kicad-cli pcb export svg -o <output_file> --layers F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts --page-size-mode 2 <file>`
- No config file needed — command-line flags control output
- Schematic export creates one SVG per sheet in the output directory
- PCB export creates a single SVG file at the specified output path
- Available in nixpkgs as `kicad` package

**KiBot (fallback auto-detect):**
- KiBot CLI syntax: `kibot -c <config.yaml> -d <output_dir> -b <board_file>`
- KiBot **requires** a config file — no default rendering mode exists
- For auto-detect rendering, a minimal `.kibot.yaml` is generated at runtime
- KiBot output types: `svg_sch_print` (schematic → SVG),
  `pcb_print` with `format: SVG` (PCB → SVG)
- Not in nixpkgs — installed via pip, requires KiCad on the system
- Has its own GitHub Action for CI environments
- KiBot is NOT a Python dependency of plane-hw-preview — it's a runtime tool

---

<!-- START_TASK_1 -->
### Task 1: Default KiBot config templates

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/templates/kibot-sch-preview.yaml`
- Create: `tools/plane-hw-preview/plane_preview/templates/kibot-pcb-preview.yaml`

**Step 1: Create minimal KiBot config files**

These configs are used when KiBot is auto-detected as the fallback renderer (when
`kicad-cli` is not available but `kibot` is on PATH).

`kibot-sch-preview.yaml` — renders schematic to SVG:
```yaml
kibot:
  version: 1

outputs:
  - name: schematic_svg
    type: svg_sch_print
    dir: .
    options:
      output: "%f-schematic.svg"
```

`kibot-pcb-preview.yaml` — renders PCB layout to SVG:
```yaml
kibot:
  version: 1

outputs:
  - name: pcb_svg
    type: pcb_print
    dir: .
    options:
      format: SVG
      output: "%f-pcb.svg"
```

`%f` is KiBot's substitution for the base filename without extension.

**Step 2: Verify files exist**

```bash
ls tools/plane-hw-preview/plane_preview/templates/kibot-*.yaml
```

**Commit:** `feat: add default KiBot config templates for fallback rendering`
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-3) -->
<!-- START_TASK_2 -->
### Task 2: Renderer implementation

**Verifies:** kicad-preview.AC4.1, kicad-preview.AC4.2, kicad-preview.AC4.3,
kicad-preview.AC4.4, kicad-preview.AC4.5

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/renderer.py`

**Implementation:**

`Renderer` class. Use `logging.getLogger(__name__)` at module level.

**Constructor** `__init__(self, config: Config)`:
- Store config
- If `config.renderers` is `None`, build default renderers using auto-detection
  with the following priority:

  **Priority 1 — kicad-cli** (check via `shutil.which("kicad-cli")`):
  - If found: create two default `RendererConfig` entries:
    - `match="**/*.kicad_sch"`,
      `command="kicad-cli sch export svg -o {output_dir} {file}"`,
      `config=""`, `formats=("svg",)`
    - `match="**/*.kicad_pcb"`,
      `command="kicad-cli pcb export svg -o {output_dir}/{file_stem}-pcb.svg --layers F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts --page-size-mode 2 {file}"`,
      `config=""`, `formats=("svg",)`
    Note: `{file_stem}` is a new interpolation variable — the filename without
    extension, used to name the PCB output file. kicad-cli's PCB export requires
    an explicit output file path, not a directory.

  **Priority 2 — KiBot** (check via `shutil.which("kibot")`):
  - If found: create two default `RendererConfig` entries:
    - `match="**/*.kicad_sch"`, `command="kibot -c {config} -d {output_dir} -b {file}"`,
      `config=<absolute path to kibot-sch-preview.yaml template>`, `formats=("svg",)`
    - `match="**/*.kicad_pcb"`, `command="kibot -c {config} -d {output_dir} -b {file}"`,
      `config=<absolute path to kibot-pcb-preview.yaml template>`, `formats=("svg",)`
    Get template paths via `Path(__file__).parent / "templates"`.

  **Neither found:** store `_renderer_missing = True` (used for error messaging)

**Method** `render(self, changed_files: list[str]) -> list[RenderFile]`:
- For each changed file:
  - Find matching renderer config using `fnmatch.fnmatch(file, config.match)`
  - If no renderer matches:
    - If file is `.kicad_sch` or `.kicad_pcb` and `_renderer_missing` is True:
      log error "No KiCad renderer found. Install KiCad (for kicad-cli) or KiBot,
      or configure a custom renderer in .plane-preview.yml"
    - Skip the file
  - Create a temporary output directory via `tempfile.mkdtemp()`
  - Interpolate the command template: replace `{file}` with the absolute path to the
    changed file, `{output_dir}` with the temp directory, `{config}` with the
    renderer's config path, `{file_stem}` with `Path(file).stem`
  - Split the interpolated command string via `shlex.split()`, then execute via
    `subprocess.run(cmd_args, capture_output=True, timeout=120)` (no `shell=True` —
    avoids command injection risk from user-controlled file paths)
  - If return code is non-zero: log the error (stderr), skip this file, continue
    with others
  - If return code is zero: collect output files from the temp directory matching
    the configured `formats` (e.g., `*.svg`, `*.png`). Use `glob.glob()` to find them,
    searching recursively with `**/*.{fmt}` pattern.
  - For each collected output file, create a `RenderFile` with:
    - `source_path`: the relative path of the original changed file
    - `render_path`: the absolute `Path` to the output file in the temp dir
    - `mime_type`: determined from extension (`svg` → `image/svg+xml`,
      `png` → `image/png`)
- Return all collected `RenderFile`s

**MIME type mapping** (define as module-level dict):
```python
MIME_TYPES = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
}
```

**Verification:**

```bash
cd tools/plane-hw-preview
python -c "from plane_preview.renderer import Renderer; print('OK')"
```

Expected: Imports without error.

**Commit:** `feat: implement Renderer with command interpolation and kicad-cli/KiBot auto-detect`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Renderer tests

**Verifies:** kicad-preview.AC4.1, kicad-preview.AC4.2, kicad-preview.AC4.3,
kicad-preview.AC4.4, kicad-preview.AC4.5

**Files:**
- Create: `tools/plane-hw-preview/tests/test_renderer.py`

**Testing:**

Class `TestRenderer` with `@pytest.mark.unit`:

- **kicad-preview.AC4.1:** `test_command_interpolation` — Configure a renderer with
  `command="echo {file} {output_dir} {config}"`. Call `render()` with a dummy file.
  Use `unittest.mock.patch("subprocess.run")` to capture the command args. Verify
  the command was passed as a list (via `shlex.split()`), and that `{file}`,
  `{output_dir}`, and `{config}` are replaced with actual values (no literal braces
  remain in any argument).

- **kicad-preview.AC4.2:** `test_output_files_collected_by_format` — Configure a
  renderer with `formats=["svg", "png"]`. Mock `subprocess.run` to return success
  (returncode=0). Create dummy `.svg` and `.png` files in the output directory
  (use `tmp_path` fixture). Verify `render()` returns `RenderFile`s for both files
  with correct `mime_type` values.

- **kicad-preview.AC4.3:** `test_kicad_cli_auto_detect_when_on_path` — Mock
  `shutil.which("kicad-cli")` to return `/usr/bin/kicad-cli`. Create `Renderer` with
  `config.renderers=None`. Verify that the renderer has default configs for
  `.kicad_sch` and `.kicad_pcb` files. Call `render()` with a `.kicad_sch` file
  (mocking subprocess). Verify the `kicad-cli sch export svg` command is called.

- **kicad-preview.AC4.3:** `test_kibot_fallback_when_kicad_cli_missing` — Mock
  `shutil.which("kicad-cli")` to return `None` and `shutil.which("kibot")` to return
  `/usr/bin/kibot`. Create `Renderer` with `config.renderers=None`. Verify the
  renderer falls back to KiBot configs with the bundled template config paths.

- **kicad-preview.AC4.4:** `test_failed_render_skipped` — Mock `subprocess.run` to
  return non-zero exit code with stderr output. Verify `render()` returns empty list
  for that file. Verify a log message is emitted. If other files are in the list,
  verify they continue to render.

- **kicad-preview.AC4.5:** `test_no_renderer_available_shows_error` — Mock
  `shutil.which("kicad-cli")` to return `None` and `shutil.which("kibot")` to return
  `None`. Create `Renderer` with `config.renderers=None`. Call `render()` with a
  `.kicad_sch` file. Verify an error is logged mentioning "No KiCad renderer found"
  and the file is skipped.

Use `unittest.mock.patch` for `subprocess.run` and `shutil.which`. Use `tmp_path`
for creating dummy output files. Use `caplog` fixture for log assertions.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_renderer.py -v
```

Expected: All tests pass.

**Commit:** `test: add Renderer tests for command execution and auto-detect`
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->
