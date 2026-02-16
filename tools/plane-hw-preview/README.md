# plane-hw-preview

**plane-hw-preview** is a tool that automatically renders KiCad hardware design files (schematics and PCBs) and posts them as previews to Plane issues. It integrates with GitHub Actions to trigger on commits touching KiCad files, render the designs, upload the images to Plane, and comment on linked issues with the rendered previews.

## Installation

### Development

Clone the repository and install the package in development mode:

```bash
pip install -e ./tools/plane-hw-preview
```

### Production

Once published to PyPI, install directly:

```bash
pip install plane-hw-preview
```

## Quick start

### Step 1: Initialize configuration

Run the initialization command to create a `.plane-preview.yml` config file in your repository:

```bash
plane-preview init
```

This creates a template with placeholders for your Plane workspace.

### Step 2: Edit configuration

Open `.plane-preview.yml` and configure your Plane workspace:

```yaml
plane:
  base_url: https://your-plane-instance.com
  workspace: your-workspace-slug
```

### Step 3: Set API key

Set the `PLANE_API_KEY` environment variable with your Plane API token:

```bash
export PLANE_API_KEY=your_api_key_here
```

For GitHub Actions, add it as a repository secret and reference it in your workflow (see the example workflow below).

### Step 4: Add GitHub Actions workflow

Create `.github/workflows/hardware-preview.yml` in your repository:

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

That's it! On your next push with KiCad file changes, the tool will render the files and post previews to linked Plane issues.

## Configuration reference

The `.plane-preview.yml` file has five main sections:

### `plane` section

Plane workspace settings:

```yaml
plane:
  base_url: https://your-plane-instance.com  # Base URL of your Plane instance
  workspace: my-workspace                     # Workspace slug
```

- **`base_url`** (required): The URL of your Plane instance.
- **`workspace`** (required): The slug of your workspace in Plane.

### `commit_patterns` section

Link commit messages to Plane projects by matching prefixes. When a commit message contains a prefix (e.g., "PWR-42"), the tool associates the commit with that project:

```yaml
commit_patterns:
  - prefix: "PWR"
    project: "power-stage"
  - prefix: "CTRL"
    project: "control-board"
```

- **`prefix`**: A string to match in commit messages (case-insensitive).
- **`project`**: The Plane project slug to associate with commits containing this prefix.

The prefix can appear anywhere in the commit message. When multiple prefixes match, each linked project gets its own comment.

### `path_mappings` section

Link file paths to Plane projects and default issues. When a file path matches a pattern, the tool associates the file with that project and issue:

```yaml
path_mappings:
  - pattern: "power-stage/**"
    project: "power-stage"
    default_issue: "PWR-1"
  - pattern: "control/**"
    project: "control-board"
    default_issue: "CTRL-1"
```

- **`pattern`**: A glob pattern (e.g., `power-stage/**`, `**/*.kicad_sch`) to match file paths.
- **`project`**: The Plane project slug to associate with matching files.
- **`default_issue`**: The default issue ID (e.g., "PWR-1") to post to if the commit message doesn't contain a project-specific prefix.

Patterns are matched in order. The most specific (longest) matching pattern wins.

### `renderers` section (optional)

Customize how files are rendered. If omitted, the tool auto-detects available renderers (see the Rendering section below).

```yaml
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

- **`match`**: A glob pattern to select files to render with this command.
- **`command`**: The command to execute. Supports template variables:
  - `{file}`: Full path to the source file
  - `{file_stem}`: Filename without extension
  - `{output_dir}`: Temporary output directory for rendered files
- **`config`**: Path to a configuration file for the renderer (e.g., `.kibot.yaml` for KiBot). Leave empty if the renderer doesn't need one.
- **`formats`**: List of output formats (e.g., `["svg"]`, `["png", "svg"]`).

## Rendering

The tool supports multiple renderers for KiCad files:

### Auto-detect (default)

If you don't specify a `renderers` section, the tool automatically detects available renderers:

1. **kicad-cli** (priority 1): Built into KiCad 9.0+. No configuration file needed. Works out of the box.
2. **KiBot** (priority 2): A standalone tool that requires a `.kibot.yaml` configuration file. Supports advanced features like schematic diffs.

If `kicad-cli` is on the PATH, it is used. Otherwise, the tool falls back to KiBot.

### Custom renderers

To use a custom rendering tool or set custom options, add a `renderers` section to your config:

```yaml
renderers:
  - match: "**/*.kicad_sch"
    command: "my-custom-renderer {file} -o {output_dir}"
    config: ".my-renderer.yaml"
    formats: ["svg"]
```

### KiBot with GitHub Actions

If you prefer KiBot's advanced features (such as schematic diffs), replace the KiCad install step in your workflow with the KiBot GitHub Action:

```yaml
      - uses: INTI-CMNB/KiBot@v2
        with:
          config: .kibot.yaml
```

Then configure KiBot in your `.kibot.yaml` file and add a corresponding renderer in `.plane-preview.yml`.

## Issue linking

The tool uses two strategies to determine which Plane issues to post previews to:

### Strategy 1: Commit message patterns

If the commit message contains a recognized prefix (e.g., "PWR-42"), the tool extracts the issue ID and posts to that issue:

```
Commit: "PWR-42 Update power stage layout"
Result: Posts preview to PWR-42
```

### Strategy 2: Path mappings

If the commit message doesn't contain a recognized prefix, the tool matches the changed file paths against `path_mappings` and uses the default issue:

```
File: "power-stage/main.kicad_sch"
Commit: "Minor tweaks"  (no PWR prefix)
Result: Posts preview to PWR-1 (the default_issue for "power-stage/**")
```

If both strategies match, the tool posts separate comments to each issue.

## Nix development

If you're using Nix, the flake provides a development shell with `kicad-cli` and all Python dependencies:

```bash
nix develop
plane-preview --help
```

This ensures you have a consistent rendering environment with the exact KiCad version specified in `flake.nix`.

## Error handling

The tool provides clear error messages for common issues:

- **`PLANE_API_KEY` not set**: The command exits with a helpful error message.
- **Config file not found**: The YAML loader reports the missing file path and line number.
- **Config validation errors**: Missing or invalid fields are reported with the field name.
- **Rendering failures**: Failed commands are logged with exit codes and stderr output.
- **API errors**: Network errors and HTTP responses are logged with status codes and response bodies.

All errors are logged and the command exits with a non-zero exit code. In GitHub Actions, this stops the workflow and alerts you to fix the issue.

## Commands

### `plane-preview init`

Create a template `.plane-preview.yml` in the current directory:

```bash
plane-preview init [--force]
```

- `--force`: Overwrite an existing config file.

### `plane-preview post`

Execute the hardware preview pipeline:

```bash
plane-preview post --adapter ADAPTER [--config PATH]
```

- `--adapter` (required): The Git hosting platform. Currently supports `github`.
- `--config` (default: `.plane-preview.yml`): Path to the configuration file.

The command reads the Git event (e.g., push event), identifies changed KiCad files, renders them, and posts previews to linked Plane issues.
