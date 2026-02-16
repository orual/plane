"""Tests for configuration loading and validation."""

import pytest

from plane_preview.config import ConfigLoader


@pytest.mark.unit
class TestConfigLoader:
    """Test suite for ConfigLoader."""

    def test_load_valid_config(self, tmp_path):
        """Test loading a valid configuration file."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
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
"""
        )

        config = ConfigLoader.load(config_file)

        assert config.base_url == "https://plane.example.com"
        assert config.workspace == "my-workspace"
        assert len(config.commit_patterns) == 2
        assert config.commit_patterns[0].prefix == "PWR"
        assert config.commit_patterns[0].project == "power-stage"
        assert config.commit_patterns[1].prefix == "CTRL"
        assert config.commit_patterns[1].project == "control-board"
        assert len(config.path_mappings) == 2
        assert config.path_mappings[0].pattern == "hardware/power-stage/**"
        assert config.path_mappings[0].project == "power-stage"
        assert config.path_mappings[0].default_issue == "PWR-1"
        assert len(config.renderers) == 1
        assert config.renderers[0].match == "**/*.kicad_sch"
        assert config.renderers[0].formats == ("png", "svg")

    def test_missing_base_url_raises(self, tmp_path):
        """Test that missing base_url raises ValueError."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
plane:
  workspace: my-workspace
"""
        )

        with pytest.raises(ValueError, match="plane.base_url"):
            ConfigLoader.load(config_file)

    def test_missing_workspace_raises(self, tmp_path):
        """Test that missing workspace raises ValueError."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
plane:
  base_url: https://plane.example.com
"""
        )

        with pytest.raises(ValueError, match="plane.workspace"):
            ConfigLoader.load(config_file)

    def test_empty_commit_patterns_defaults_to_empty_tuple(self, tmp_path):
        """Test that missing commit_patterns section produces empty tuple."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
plane:
  base_url: https://plane.example.com
  workspace: my-workspace
"""
        )

        config = ConfigLoader.load(config_file)

        assert config.commit_patterns == ()
        assert isinstance(config.commit_patterns, tuple)

    def test_missing_renderers_is_none(self, tmp_path):
        """Test that missing renderers section sets renderers to None."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
plane:
  base_url: https://plane.example.com
  workspace: my-workspace
"""
        )

        config = ConfigLoader.load(config_file)

        assert config.renderers is None

    def test_renderer_with_empty_config_string(self, tmp_path):
        """Test that empty string config is accepted for renderers that don't need a config file."""
        config_file = tmp_path / "config.yml"
        config_file.write_text(
            """
plane:
  base_url: https://plane.example.com
  workspace: my-workspace

renderers:
  - match: "**/*.kicad_sch"
    command: "kicad-cli sch export svg -o {output_dir} {file}"
    config: ""
    formats: ["svg"]
"""
        )

        config = ConfigLoader.load(config_file)

        assert config.renderers is not None
        assert len(config.renderers) == 1
        assert config.renderers[0].config == ""
