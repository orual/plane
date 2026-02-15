# KiCad Preview Pipeline Implementation Plan — Phase 2

**Goal:** Parse `.plane-preview.yml` config and resolve changed files to Plane issue
targets.

**Architecture:** Two modules — `ConfigLoader` for YAML parsing with defaults, and
`IssueResolver` for mapping changed files + commit messages to Plane issues via regex
and path patterns. Pure Python logic with no external API calls.

**Tech Stack:** Python 3.10+, PyYAML, fnmatch (stdlib), re (stdlib)

**Scope:** 5 phases from original design (phases 1-5)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

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

---

<!-- START_TASK_1 -->
### Task 1: Template config file

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/templates/plane-preview.yml`

**Step 1: Create template config**

The template config should include all supported sections with inline comments
explaining each field. This file is copied to the user's repo root by `plane-preview init`.

```yaml
# plane-hw-preview configuration
# Copy this file to your repository root as .plane-preview.yml

plane:
  # Your Plane instance URL
  base_url: https://plane.example.com
  # Workspace slug (from your Plane URL)
  workspace: my-workspace

# Map commit message prefixes to Plane projects.
# When a commit message contains "PWR-42", it matches the project
# configured with prefix "PWR" and links to issue 42 in that project.
commit_patterns:
  - prefix: "PWR"
    project: "power-stage"
  # - prefix: "CTRL"
  #   project: "control-board"

# Map file paths to Plane projects and default issues.
# Used as fallback when commit messages don't contain issue identifiers.
# More specific patterns take priority over broader ones.
path_mappings:
  - pattern: "hardware/power-stage/**"
    project: "power-stage"
    default_issue: "PWR-1"
  # - pattern: "hardware/control/**"
  #   project: "control-board"
  #   default_issue: "CTRL-1"

# Configure render commands per file type.
# If omitted and KiBot is on PATH, KiCad files are rendered with KiBot defaults.
# renderers:
#   - match: "**/*.kicad_sch"
#     command: "kibot -c {config} -d {output_dir} -b {file}"
#     config: "hardware/kibot.yaml"
#     formats: ["png", "svg"]
#   - match: "**/*.kicad_pcb"
#     command: "kibot -c {config} -d {output_dir} -b {file}"
#     config: "hardware/kibot.yaml"
#     formats: ["png", "svg"]
```

**Step 2: Verify file exists**

```bash
cat tools/plane-hw-preview/plane_preview/templates/plane-preview.yml
```

Expected: Template content prints correctly.

**Commit:** `feat: add plane-preview.yml template config`
<!-- END_TASK_1 -->

<!-- START_SUBCOMPONENT_A (tasks 2-3) -->
<!-- START_TASK_2 -->
### Task 2: ConfigLoader implementation and tests

**Verifies:** None (infrastructure — tested via config tests below)

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/config.py`
- Create: `tools/plane-hw-preview/tests/test_config.py`

**Implementation:**

`ConfigLoader` class with a single class method:

**Class method** `load(path: Path) -> Config`:
- Read YAML from `path` using `yaml.safe_load()`
- Validate required fields: `plane.base_url`, `plane.workspace`
- Validate `commit_patterns` entries have `prefix` and `project`
- Validate `path_mappings` entries have `pattern`, `project`, and `default_issue`
- If `renderers` section is missing, leave it as `None` (Phase 3 handles defaults)
- Return a `Config` dataclass

Define `Config` as a frozen dataclass:
```python
@dataclass(frozen=True)
class CommitPattern:
    prefix: str
    project: str

@dataclass(frozen=True)
class PathMapping:
    pattern: str
    project: str
    default_issue: str

@dataclass(frozen=True)
class RendererConfig:
    match: str
    command: str
    config: str
    formats: tuple[str, ...]

@dataclass(frozen=True)
class Config:
    base_url: str
    workspace: str
    commit_patterns: tuple[CommitPattern, ...]
    path_mappings: tuple[PathMapping, ...]
    renderers: tuple[RendererConfig, ...] | None
```

On missing required fields, raise `ValueError` with a message describing what's missing.
On YAML parse errors, let `yaml.YAMLError` propagate.

Handle empty optional sections gracefully: `commit_patterns` defaults to `()`,
`path_mappings` defaults to `()`.

**Testing:**

`tests/test_config.py` — class `TestConfigLoader` with `@pytest.mark.unit`:
- `test_load_valid_config` — Load the template config, verify all fields parsed correctly.
- `test_missing_base_url_raises` — YAML with no `plane.base_url` raises `ValueError`.
- `test_missing_workspace_raises` — YAML with no `plane.workspace` raises `ValueError`.
- `test_empty_commit_patterns_defaults_to_empty_tuple` — Config with no `commit_patterns`
  section produces empty tuple.
- `test_missing_renderers_is_none` — Config with no `renderers` section sets
  `config.renderers` to `None`.

Use `tmp_path` fixture for writing YAML test files.

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_config.py -v
```

Expected: All ConfigLoader tests pass.

**Commit:** `feat: implement ConfigLoader for YAML parsing`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: IssueResolver implementation and tests

**Verifies:** kicad-preview.AC2.1, kicad-preview.AC2.2, kicad-preview.AC2.3,
kicad-preview.AC2.4, kicad-preview.AC2.5, kicad-preview.AC3.1, kicad-preview.AC3.2,
kicad-preview.AC3.3, kicad-preview.AC3.4

**Files:**
- Create: `tools/plane-hw-preview/plane_preview/resolver.py`
- Create: `tools/plane-hw-preview/tests/test_resolver.py`

**Implementation:**

`IssueResolver` class. Use `logging.getLogger(__name__)` at module level.

**Constructor** `__init__(self, config: Config)`:
- Store config
- Build a compiled regex pattern for commit message parsing from `config.commit_patterns`.
  Pattern should match `PREFIX-NUMBER` case-insensitively, with optional surrounding
  brackets: `r'\[?({prefixes_alternation})-(\d+)\]?'` using `re.IGNORECASE`.
  The alternation is built from all configured prefixes joined with `|`.

**Method** `resolve(self, changed_files: list[str], commit_message: str) -> list[PreviewTarget]`:

The resolver determines which files should be posted to which Plane issues. It works
in three stages:

**Stage 1 — Parse commit message for issue references:**
- Extract all issue references from `commit_message` via regex.
  Each match produces `(prefix, sequence_number)`. Map prefix to project via
  `config.commit_patterns`. Build a dict: `{project: issue_identifier}` where
  `issue_identifier` is `"{PREFIX}-{number}"` (e.g., `"PWR-42"`).
- Commit message parsing details:
  - The regex must handle: `PWR-42`, `pwr-42`, `[PWR-42]`, `PWR-42 CTRL-7`
  - Use `re.findall()` to get all matches from the full commit message
  - Map each match's prefix (uppercased) to the configured project
  - If a prefix doesn't match any configured project, skip it silently

**Stage 2 — Assign each file to a target issue:**
- For each changed file:
  1. Determine the file's project by matching against `config.path_mappings` using
     `fnmatch.fnmatch(file, mapping.pattern)`. If multiple mappings match, use the most
     specific one (see specificity rules below).
  2. If the file's project was found in the commit-message references (Stage 1), assign
     the file to the commit-referenced issue for that project.
  3. If the file's project was NOT found in commit-message references, fall back to the
     path mapping's `default_issue`.
  4. If the file matches no path mapping at all, skip it silently.

This means commit-message references provide the **issue number** within a project, while
path mappings determine **which project** a file belongs to. A commit message like
`"PWR-42 CTRL-7"` does NOT send all files to all issues — it only overrides the issue
number for files that already belong to each respective project by path.

**Stage 3 — Group into PreviewTargets:**
- Group results into `PreviewTarget` list. Each unique `(project_id, issue_id)` gets one
  `PreviewTarget` containing all `RenderFile`s for that target.
- At this stage, `RenderFile.render_path` is not yet set (rendering happens in Phase 3).
  The resolver populates `source_path` only. Create `RenderFile` with
  `render_path=Path(".")` as a placeholder.

**Path matching specificity (AC3.4):** When multiple `path_mappings` match a file, use
the most specific one. Determine specificity by counting path segments in the pattern
(more segments = more specific). For example, `hardware/power-stage/**` (2 segments
before `**`) is more specific than `hardware/**` (1 segment). Sort matching patterns
by segment count descending and take the first.

**Note on fnmatch and glob patterns:** `fnmatch.fnmatch()` treats the entire path as a
flat string where `*` matches any characters including `/`. The `**` pattern is kept in
config for readability and compatibility with standard glob conventions, but `fnmatch`
treats it identically to `*`. This is acceptable for the path mapping use case because
patterns always specify a directory prefix (e.g., `hardware/power-stage/**`).

**Testing:**

`tests/test_resolver.py` — class `TestIssueResolver` with `@pytest.mark.unit`:

For commit parsing (AC2.*):
- **kicad-preview.AC2.1:** `test_commit_prefix_matches_project` — Message `"fix PWR-42"`
  resolves to project `power-stage` issue `PWR-42`.
- **kicad-preview.AC2.2:** `test_multiple_identifiers_resolved` — Message
  `"update PWR-42 and CTRL-7"` with files in both projects produces two targets,
  each containing only the files belonging to that project.
- **kicad-preview.AC2.3:** `test_case_insensitive_match` — Message `"fix pwr-42"` matches
  prefix `PWR`.
- **kicad-preview.AC2.4:** `test_brackets_extracted` — Message `"[PWR-42] fix"` matches.
- **kicad-preview.AC2.5:** `test_no_identifiers_no_matches` — Message `"general cleanup"`
  with no path mapping match produces empty list.

For path mapping (AC3.*):
- **kicad-preview.AC3.1:** `test_path_mapping_resolves_to_default_issue` — Changed file
  `hardware/power-stage/main.kicad_sch` with no commit identifiers resolves to
  `default_issue: PWR-1`.
- **kicad-preview.AC3.2:** `test_commit_ref_takes_priority_over_path_mapping` — Changed
  file matching a path mapping, but commit message contains `PWR-42`: resolved issue
  is `PWR-42`, not the `default_issue`.
- **kicad-preview.AC3.3:** `test_unmatched_file_skipped` — Changed file
  `docs/readme.md` matching no pattern and no commit ref produces no targets.
- **kicad-preview.AC3.4:** `test_most_specific_path_wins` — Configure two mappings:
  `hardware/**` → project A default issue 1, `hardware/power-stage/**` → project B
  default issue 2. Changed file `hardware/power-stage/main.kicad_sch` resolves to
  project B (more specific).

Create `Config` objects directly in tests (no YAML files needed).

**Verification:**

```bash
cd tools/plane-hw-preview
pytest tests/test_config.py tests/test_resolver.py -v
```

Expected: All tests pass.

**Commit:** `feat: implement IssueResolver with commit parsing and path mapping`
<!-- END_TASK_3 -->
<!-- END_SUBCOMPONENT_A -->
