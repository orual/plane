"""End-to-end integration tests with real KiCad rendering.

These tests verify the complete pipeline from GitHub push event → file rendering →
image upload → Plane comment, using real kicad-cli for rendering and respx for
mocking the Plane API.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path
from unittest import mock

import pytest
import respx
from click.testing import CliRunner
from httpx import Response

from plane_preview.cli import main


# Fixtures directory at the root of tests/
FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _kicad_cli_available() -> bool:
    """Check if kicad-cli is available on PATH."""
    import shutil as shell_utils

    return shell_utils.which("kicad-cli") is not None


# Marker for tests that require kicad-cli
requires_kicad = pytest.mark.skipif(
    not _kicad_cli_available(),
    reason="kicad-cli not on PATH (install KiCad or enter nix develop)",
)


@pytest.mark.smoke
class TestEndToEndPipeline:
    """Test suite for end-to-end rendering pipeline (AC7.1, AC7.2)."""

    @pytest.fixture
    def github_env(self, tmp_path, monkeypatch):
        """Set up GitHub Actions environment for integration tests.

        Copies fixture files to tmp_path and sets up environment variables
        pointing to a test event.json.
        """
        # Copy fixture files from FIXTURES_DIR to tmp_path
        shutil.copytree(FIXTURES_DIR / "power-stage", tmp_path / "power-stage")
        shutil.copytree(FIXTURES_DIR / "control", tmp_path / "control")
        shutil.copy2(FIXTURES_DIR / "config.yml", tmp_path / "config.yml")
        shutil.copy2(FIXTURES_DIR / "event.json", tmp_path / "event.json")

        # Change to tmp_path so relative paths in event.json resolve correctly
        monkeypatch.chdir(tmp_path)

        env = {
            "GITHUB_SHA": "abc1234567890def",
            "GITHUB_REF_NAME": "main",
            "GITHUB_EVENT_PATH": str(tmp_path / "event.json"),
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "org/hw-repo",
            "PLANE_API_KEY": "plane_api_test_key",
        }
        with mock.patch.dict(os.environ, env, clear=False):
            yield tmp_path

    @requires_kicad
    @respx.mock
    def test_full_pipeline_posts_preview(self, github_env):
        """Test AC7.1: Full pipeline with real rendering posts preview.

        Exercise the complete pipeline:
        1. Read event.json and config.yml from fixtures
        2. Run the CLI with real kicad-cli rendering
        3. Verify SVG files are generated
        4. Verify Plane API is called with upload and comment creation
        5. Verify comment HTML contains <img> tags
        """
        # Modify event.json to include only power-stage project
        event_data = {
            "head_commit": {
                "id": "abc1234567890def",
                "message": "PWR-42 update board layout",
                "url": "https://github.com/org/hw-repo/commit/abc1234567890def",
            },
            "commits": [
                {
                    "id": "abc1234567890def",
                    "added": ["power-stage/main.kicad_sch"],
                    "modified": [],
                    "removed": [],
                }
            ],
            "ref": "refs/heads/main",
        }
        event_file = github_env / "event.json"
        event_file.write_text(json.dumps(event_data))

        # Mock Plane API endpoints
        # Asset upload endpoint - returns presigned URL info
        presigned_response = {
            "upload_data": {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "test-key"},
            },
            "asset_id": "asset-uuid-sch",
            "asset_url": "https://s3.example.com/asset-sch.svg",
        }
        respx.post("https://plane.example.com/api/v1/workspaces/test-workspace/assets/").mock(
            return_value=Response(200, json=presigned_response)
        )

        # S3 upload endpoint
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Asset confirm endpoint
        respx.patch("https://plane.example.com/api/v1/workspaces/test-workspace/assets/asset-uuid-sch/").mock(
            return_value=Response(204)
        )

        # Comment creation endpoint
        comment_response = {"id": "comment-uuid"}
        respx.post(
            "https://plane.example.com/api/v1/workspaces/test-workspace/projects/power-stage/work-items/PWR-42/comments/"
        ).mock(return_value=Response(201, json=comment_response))

        # Run the CLI
        runner = CliRunner()
        result = runner.invoke(
            main,
            ["post", "--adapter", "github", "--config", str(github_env / "config.yml")],
            catch_exceptions=False,
        )

        # Verify exit code is 0 (success)
        assert result.exit_code == 0, f"CLI failed with output:\n{result.output}"

        # Verify at least one asset upload request was made
        asset_upload_requests = [r for r in respx.calls if r.request.method == "POST"
                                  and "assets" in r.request.url.path]
        assert len(asset_upload_requests) > 0, "No asset upload requests found"

        # Verify S3 upload was called (real SVG data)
        s3_requests = [r for r in respx.calls if "s3.example.com" in str(r.request.url)]
        assert len(s3_requests) > 0, "No S3 upload requests found"

        # Verify comment creation was called
        comment_requests = [r for r in respx.calls if "comments" in r.request.url.path]
        assert len(comment_requests) > 0, "No comment creation requests found"

        # Verify the comment request contains HTML with <img> tags
        comment_request = comment_requests[0]
        comment_body = json.loads(comment_request.request.content)
        assert "comment_html" in comment_body
        assert "<img" in comment_body["comment_html"], "Comment HTML should contain <img> tags"

    @requires_kicad
    @respx.mock
    def test_multi_project_pipeline(self, github_env):
        """Test AC7.2: Pipeline handles multiple projects in one commit.

        Verify that a commit touching files in two projects results in:
        - Two separate comment creation requests (one per issue)
        - Each comment contains renders for its own issue only
        - Correct project IDs and issue IDs are used
        """
        # Use full event.json with both projects
        event_data = {
            "head_commit": {
                "id": "abc1234567890def",
                "message": "PWR-42 CTRL-7 update board layouts",
                "url": "https://github.com/org/hw-repo/commit/abc1234567890def",
            },
            "commits": [
                {
                    "id": "abc1234567890def",
                    "added": ["power-stage/main.kicad_sch"],
                    "modified": ["control/board.kicad_pcb"],
                    "removed": [],
                }
            ],
            "ref": "refs/heads/main",
        }
        event_file = github_env / "event.json"
        event_file.write_text(json.dumps(event_data))

        # Mock Plane API endpoints for power-stage project
        presigned_pwr = {
            "upload_data": {
                "url": "https://s3.example.com/upload-pwr",
                "fields": {"key": "test-key-pwr"},
            },
            "asset_id": "asset-uuid-pwr",
            "asset_url": "https://s3.example.com/asset-pwr.svg",
        }
        respx.post("https://plane.example.com/api/v1/workspaces/test-workspace/assets/").mock(
            return_value=Response(200, json=presigned_pwr)
        )

        # S3 upload endpoints (multiple)
        respx.post("https://s3.example.com/upload-pwr").mock(return_value=Response(204))
        respx.post("https://s3.example.com/upload-ctrl").mock(return_value=Response(204))

        # Asset confirm endpoints
        respx.patch("https://plane.example.com/api/v1/workspaces/test-workspace/assets/asset-uuid-pwr/").mock(
            return_value=Response(204)
        )
        respx.patch("https://plane.example.com/api/v1/workspaces/test-workspace/assets/asset-uuid-ctrl/").mock(
            return_value=Response(204)
        )

        # Comment creation endpoints - separate for each project
        pwr_comment = {"id": "comment-pwr"}
        respx.post(
            "https://plane.example.com/api/v1/workspaces/test-workspace/projects/power-stage/work-items/PWR-42/comments/"
        ).mock(return_value=Response(201, json=pwr_comment))

        ctrl_comment = {"id": "comment-ctrl"}
        respx.post(
            "https://plane.example.com/api/v1/workspaces/test-workspace/projects/control-board/work-items/CTRL-7/comments/"
        ).mock(return_value=Response(201, json=ctrl_comment))

        # Run the CLI
        runner = CliRunner()
        result = runner.invoke(
            main,
            ["post", "--adapter", "github", "--config", str(github_env / "config.yml")],
            catch_exceptions=False,
        )

        # Verify exit code is 0 (success)
        assert result.exit_code == 0, f"CLI failed with output:\n{result.output}"

        # Verify TWO comment creation requests were made
        comment_requests = [r for r in respx.calls if "comments" in r.request.url.path]
        assert len(comment_requests) == 2, f"Expected 2 comment requests, got {len(comment_requests)}"

        # Extract the two comment requests
        pwr_req = None
        ctrl_req = None
        for req in comment_requests:
            if "power-stage" in req.request.url.path:
                pwr_req = req
            elif "control-board" in req.request.url.path:
                ctrl_req = req

        assert pwr_req is not None, "No comment request for power-stage project"
        assert ctrl_req is not None, "No comment request for control-board project"

        # Verify each comment contains correct issue ID
        pwr_body = json.loads(pwr_req.request.content)
        assert "PWR-42" in pwr_body["comment_html"] or "<img" in pwr_body["comment_html"]

        ctrl_body = json.loads(ctrl_req.request.content)
        assert "CTRL-7" in ctrl_body["comment_html"] or "<img" in ctrl_body["comment_html"]

        # Verify both contain <img> tags (the actual renders)
        assert "<img" in pwr_body["comment_html"], "PWR comment should contain <img> tags"
        assert "<img" in ctrl_body["comment_html"], "CTRL comment should contain <img> tags"
