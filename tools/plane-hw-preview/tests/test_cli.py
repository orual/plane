"""Tests for CLI commands."""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

from plane_preview.cli import main
from plane_preview.types import PlaneAPIError, PreviewTarget, RenderFile


class TestInitCommand:
    """Test suite for the 'init' command."""

    def test_init_creates_config(self):
        """Verify init creates .plane-preview.yml with valid YAML content.

        Tests: kicad-preview.AC6.2
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            result = runner.invoke(main, ["init"])

            assert result.exit_code == 0
            assert "Created `.plane-preview.yml`" in result.output
            assert Path(".plane-preview.yml").exists()

            # Verify content is valid YAML
            content = Path(".plane-preview.yml").read_text()
            assert "plane:" in content
            assert "base_url:" in content
            assert "workspace:" in content

    def test_init_refuses_overwrite(self):
        """Verify init refuses to overwrite existing config without --force.

        Tests error handling when config exists.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create existing config
            Path(".plane-preview.yml").write_text("existing content")

            # Try to init without --force
            result = runner.invoke(main, ["init"])

            assert result.exit_code == 1
            assert ".plane-preview.yml already exists" in result.output
            assert "Use --force to overwrite" in result.output

            # Verify content unchanged
            assert Path(".plane-preview.yml").read_text() == "existing content"

    def test_init_force_overwrites(self):
        """Verify init --force overwrites existing file.

        Tests --force flag behavior.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create existing config with different content
            Path(".plane-preview.yml").write_text("old content")

            # Run init with --force
            result = runner.invoke(main, ["init", "--force"])

            assert result.exit_code == 0
            assert "Created `.plane-preview.yml`" in result.output

            # Verify file was overwritten
            content = Path(".plane-preview.yml").read_text()
            assert "old content" not in content
            assert "plane:" in content


class TestPostCommand:
    """Test suite for the 'post' command."""

    def test_post_requires_adapter(self):
        """Verify post command fails without --adapter option.

        Tests adapter requirement validation.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create minimal config
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns: []
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            result = runner.invoke(main, ["post"])

            # Should fail with usage error about missing --adapter
            assert result.exit_code != 0
            assert "Missing option '--adapter'" in result.output or "Error" in result.output

    def test_post_missing_config_file(self):
        """Verify post fails gracefully when config file doesn't exist.

        Tests missing config file error handling.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            result = runner.invoke(main, ["post", "--adapter", "github", "--config", "nonexistent.yml"])

            assert result.exit_code != 0
            assert "does not exist" in result.output or "No such file" in result.output

    def test_post_missing_api_key(self):
        """Verify post fails with clear error when PLANE_API_KEY is missing.

        Tests: kicad-preview.AC6.3 (missing environment check)
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create minimal config
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns: []
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            # Clear PLANE_API_KEY from environment
            env = os.environ.copy()
            env.pop("PLANE_API_KEY", None)

            result = runner.invoke(main, ["post", "--adapter", "github"], env=env, catch_exceptions=False)

            assert result.exit_code == 1
            assert "PLANE_API_KEY" in result.output
            assert "not set" in result.output

    def test_post_with_github_adapter_no_env(self):
        """Verify post with GitHub adapter fails when not in GitHub Actions.

        Tests GitHub Actions environment detection.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create minimal config
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns: []
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            # Minimal env without GitHub vars
            env = {
                "PLANE_API_KEY": "test-key",
            }

            result = runner.invoke(main, ["post", "--adapter", "github"], env=env, catch_exceptions=False)

            assert result.exit_code == 1
            assert "GitHub Actions environment not detected" in result.output

    def test_post_no_targets_resolved(self):
        """Verify post exits cleanly when no targets are resolved.

        Tests early exit when resolver returns empty list.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create config and event file
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns:
  - prefix: "TEST"
    project: "test-proj"
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            # Create event payload with no matching files
            event_payload = {
                "head_commit": {
                    "id": "abc123",
                    "message": "test commit",
                },
                "commits": [
                    {
                        "added": ["unrelated/file.txt"],
                        "modified": [],
                        "removed": [],
                    }
                ],
            }
            event_file = Path("event.json")
            event_file.write_text(json.dumps(event_payload))

            env = {
                "PLANE_API_KEY": "test-key",
                "GITHUB_SHA": "abc123",
                "GITHUB_REF_NAME": "main",
                "GITHUB_REPOSITORY": "test/repo",
                "GITHUB_EVENT_PATH": str(event_file),
            }

            result = runner.invoke(main, ["post", "--adapter", "github"], env=env, catch_exceptions=False)

            assert result.exit_code == 0
            assert "No Plane issues matched" in result.output

    @patch("plane_preview.cli.Renderer")
    @patch("plane_preview.cli.IssueResolver")
    @patch("plane_preview.cli.GitHubAdapter")
    @patch("plane_preview.cli.PlaneClient")
    def test_post_successful_pipeline(self, mock_client_cls, mock_adapter_cls, mock_resolver_cls, mock_renderer_cls):
        """Verify post command wires the full pipeline correctly.

        Tests the complete post command flow with mocked components.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create config
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns:
  - prefix: "TEST"
    project: "test-proj"
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            # Create event payload
            event_payload = {
                "head_commit": {"id": "abc123", "message": "feat: test [TEST-1]"},
                "commits": [{"added": ["board.kicad_pcb"], "modified": [], "removed": []}],
            }
            event_file = Path("event.json")
            event_file.write_text(json.dumps(event_payload))

            # Mock adapter result
            mock_adapter = MagicMock()
            mock_adapter.extract.return_value = MagicMock(
                commit_sha="abc123",
                commit_message="feat: test [TEST-1]",
                commit_url="https://github.com/test/repo/commit/abc123",
                branch="main",
                changed_files=["board.kicad_pcb"],
            )
            mock_adapter_cls.return_value = mock_adapter

            # Mock resolver result
            render_file = RenderFile(
                source_path="board.kicad_pcb",
                render_path=Path("output/board.svg"),
                mime_type="image/svg+xml",
            )
            target = PreviewTarget(
                project_id="proj-123",
                issue_id="issue-456",
                render_files=(render_file,),
            )
            mock_resolver = MagicMock()
            mock_resolver.resolve.return_value = [target]
            mock_resolver_cls.return_value = mock_resolver

            # Mock renderer result
            mock_renderer = MagicMock()
            mock_renderer.render.return_value = [render_file]
            mock_renderer_cls.return_value = mock_renderer

            # Mock client
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client

            env = {
                "PLANE_API_KEY": "test-key",
                "GITHUB_SHA": "abc123",
                "GITHUB_REF_NAME": "main",
                "GITHUB_REPOSITORY": "test/repo",
                "GITHUB_EVENT_PATH": str(event_file),
            }

            result = runner.invoke(main, ["post", "--adapter", "github"], env=env, catch_exceptions=False)

            assert result.exit_code == 0
            assert "Posted previews to 1 issue(s)" in result.output

            # Verify pipeline was called correctly
            mock_adapter_cls.extract.assert_called_once()
            mock_resolver.resolve.assert_called_once()
            mock_renderer.render.assert_called_once()
            mock_client.post_preview.assert_called_once()

    @patch("plane_preview.cli.GitHubAdapter")
    def test_post_handles_plane_api_error(self, mock_adapter_cls):
        """Verify post command handles PlaneAPIError gracefully.

        Tests error handling for API errors.
        """
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Create config
            config_content = """
plane:
  base_url: https://example.com
  workspace: test
commit_patterns: []
path_mappings: []
"""
            Path(".plane-preview.yml").write_text(config_content)

            # Create event payload
            event_payload = {
                "head_commit": {"id": "abc123", "message": "test"},
                "commits": [{"added": [], "modified": [], "removed": []}],
            }
            event_file = Path("event.json")
            event_file.write_text(json.dumps(event_payload))

            # Mock adapter to raise PlaneAPIError
            mock_adapter_cls.extract.side_effect = PlaneAPIError("API connection failed")

            env = {
                "PLANE_API_KEY": "test-key",
                "GITHUB_SHA": "abc123",
                "GITHUB_REF_NAME": "main",
                "GITHUB_REPOSITORY": "test/repo",
                "GITHUB_EVENT_PATH": str(event_file),
            }

            result = runner.invoke(main, ["post", "--adapter", "github"], env=env, catch_exceptions=False)

            assert result.exit_code == 1
            assert "API connection failed" in result.output
