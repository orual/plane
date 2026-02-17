"""Tests for issue resolver."""

import pytest

from plane_preview.config import CommitPattern, Config, PathMapping
from plane_preview.resolver import IssueResolver


@pytest.mark.unit
class TestIssueResolver:
    """Test suite for IssueResolver."""

    # Commit message parsing tests (AC2.*)

    def test_commit_prefix_matches_project(self):
        """AC2.1: Commit message containing PWR-42 is matched to the project with prefix PWR."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(
                PathMapping(pattern="hardware/power-stage/**", project="power-stage", default_issue="PWR-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power-stage/main.kicad_sch"],
            commit_message="fix PWR-42",
        )

        assert len(targets) == 1
        assert targets[0].project_id == "power-stage"
        assert targets[0].issue_id == "PWR-42"

    def test_multiple_identifiers_resolved(self):
        """AC2.2: Multiple identifiers in one commit message are each resolved independently."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(
                CommitPattern(prefix="PWR", project="power-stage"),
                CommitPattern(prefix="CTRL", project="control-board"),
            ),
            path_mappings=(
                PathMapping(pattern="hardware/power/**", project="power-stage", default_issue="PWR-1"),
                PathMapping(pattern="hardware/ctrl/**", project="control-board", default_issue="CTRL-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=[
                "hardware/power/main.kicad_sch",
                "hardware/ctrl/board.kicad_pcb",
            ],
            commit_message="update PWR-42 and CTRL-7",
        )

        assert len(targets) == 2
        target_dict = {t.project_id: t.issue_id for t in targets}
        assert target_dict["power-stage"] == "PWR-42"
        assert target_dict["control-board"] == "CTRL-7"

    def test_case_insensitive_match(self):
        """AC2.3: Identifiers are matched case-insensitively (pwr-42 matches prefix PWR)."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(PathMapping(pattern="hardware/power/**", project="power-stage", default_issue="PWR-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power/main.kicad_sch"],
            commit_message="fix pwr-42",
        )

        assert len(targets) == 1
        assert targets[0].issue_id == "PWR-42"

    def test_brackets_extracted(self):
        """AC2.4: Identifiers in brackets ([PWR-42]) are extracted correctly."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(PathMapping(pattern="hardware/power/**", project="power-stage", default_issue="PWR-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power/main.kicad_sch"],
            commit_message="[PWR-42] fix power stage",
        )

        assert len(targets) == 1
        assert targets[0].issue_id == "PWR-42"

    def test_no_identifiers_no_matches(self):
        """AC2.5: Commit message with no recognisable identifiers produces no matches (no error)."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["docs/readme.md"],
            commit_message="general cleanup",
        )

        assert len(targets) == 0

    # Path mapping tests (AC3.*)

    def test_path_mapping_resolves_to_default_issue(self):
        """AC3.1: A changed file matching path_mappings is linked to the project and default_issue."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(
                PathMapping(pattern="hardware/power-stage/**", project="power-stage", default_issue="PWR-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power-stage/main.kicad_sch"],
            commit_message="update schematics",
        )

        assert len(targets) == 1
        assert targets[0].project_id == "power-stage"
        assert targets[0].issue_id == "PWR-1"

    def test_commit_ref_takes_priority_over_path_mapping(self):
        """AC3.2: Commit message identifiers take priority over path_mapping default_issue."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(
                PathMapping(pattern="hardware/power-stage/**", project="power-stage", default_issue="PWR-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power-stage/main.kicad_sch"],
            commit_message="fix PWR-42",
        )

        assert len(targets) == 1
        assert targets[0].issue_id == "PWR-42"

    def test_unmatched_file_skipped(self):
        """AC3.3: Changed files matching no commit pattern and no path mapping are silently skipped."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(
                PathMapping(pattern="hardware/power-stage/**", project="power-stage", default_issue="PWR-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["docs/readme.md"],
            commit_message="general update",
        )

        assert len(targets) == 0

    def test_most_specific_path_wins(self):
        """AC3.4: Overlapping path patterns use the most specific match."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(
                PathMapping(pattern="hardware/**", project="hardware-general", default_issue="HW-1"),
                PathMapping(pattern="hardware/power-stage/**", project="power-stage", default_issue="PWR-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power-stage/main.kicad_sch"],
            commit_message="update",
        )

        assert len(targets) == 1
        assert targets[0].project_id == "power-stage"
        assert targets[0].issue_id == "PWR-1"

    # Additional edge cases

    def test_multiple_files_same_project(self):
        """Multiple files for the same project/issue are grouped in a single target."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(PathMapping(pattern="hardware/power/**", project="power-stage", default_issue="PWR-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=[
                "hardware/power/main.kicad_sch",
                "hardware/power/aux.kicad_sch",
            ],
            commit_message="update schematics",
        )

        assert len(targets) == 1
        assert len(targets[0].render_files) == 2

    def test_empty_config_returns_empty_targets(self):
        """With no patterns or mappings, no files are resolved."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/power/main.kicad_sch"],
            commit_message="fix PWR-42",
        )

        assert len(targets) == 0

    def test_render_file_has_placeholder_render_path(self):
        """RenderFile.render_path is set to Path('.') as placeholder."""
        from pathlib import Path

        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(PathMapping(pattern="hardware/**", project="power-stage", default_issue="PWR-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/main.kicad_sch"],
            commit_message="",
        )

        assert len(targets) == 1
        assert targets[0].render_files[0].render_path == Path(".")

    def test_commit_pattern_not_found_is_skipped(self):
        """Identifiers without matching prefix patterns are silently skipped."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(CommitPattern(prefix="PWR", project="power-stage"),),
            path_mappings=(PathMapping(pattern="hardware/**", project="power-stage", default_issue="PWR-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["hardware/main.kicad_sch"],
            commit_message="fix CTRL-42 and PWR-7",
        )

        # Only PWR-7 should be matched (CTRL is unknown)
        assert len(targets) == 1
        assert targets[0].issue_id == "PWR-7"

    def test_glob_pattern_matching(self):
        """fnmatch patterns work correctly for file matching."""
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(PathMapping(pattern="src/*/*.py", project="python-code", default_issue="CODE-1"),),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=[
                "src/lib/utils.py",
                "src/utils/helper.py",
                "tests/test.py",  # Should not match (no src/)
            ],
            commit_message="",
        )

        assert len(targets) == 1
        assert len(targets[0].render_files) == 2

    def test_doublestar_matches_root_level_files(self):
        """Verify ** glob patterns match files at the repository root.

        A pattern like **/*.kicad_sch must match both nested files
        (e.g., hardware/main.kicad_sch) and root-level files (e.g., Board.kicad_sch).
        """
        config = Config(
            base_url="https://example.com",
            workspace="test",
            commit_patterns=(),
            path_mappings=(
                PathMapping(pattern="**/*.kicad_sch", project="hw", default_issue="HW-1"),
            ),
            renderers=None,
        )
        resolver = IssueResolver(config)

        targets = resolver.resolve(
            changed_files=["Board.kicad_sch", "hardware/sub/Sheet.kicad_sch"],
            commit_message="",
        )

        assert len(targets) == 1
        assert len(targets[0].render_files) == 2
