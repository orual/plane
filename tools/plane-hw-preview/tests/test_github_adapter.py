"""Tests for GitHub Actions adapter."""

import json
import os
from unittest.mock import patch

import pytest

from plane_preview.adapters.github import GitHubAdapter
from plane_preview.types import PlaneAPIError


@pytest.mark.unit
class TestGitHubAdapter:
    """Test suite for GitHubAdapter."""

    def test_extracts_commit_info(self, tmp_path):
        """Verify adapter extracts commit SHA, message, branch, URL, and changed files.

        Tests: kicad-preview.AC6.1
        """
        # Create event payload
        event_payload = {
            "head_commit": {
                "id": "abc123def456",
                "message": "feat: add new feature",
            },
            "commits": [
                {
                    "added": ["src/new_file.py", "docs/readme.md"],
                    "modified": ["src/existing.py"],
                    "removed": ["src/old.py"],
                }
            ],
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        env_vars = {
            "GITHUB_SHA": "abc123def456",
            "GITHUB_REF_NAME": "main",
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "test-owner/test-repo",
            "GITHUB_EVENT_PATH": str(event_file),
        }

        with patch.dict(os.environ, env_vars, clear=False):
            result = GitHubAdapter.extract()

        assert result.commit_sha == "abc123def456"
        assert result.branch == "main"
        assert result.commit_message == "feat: add new feature"
        assert result.commit_url == "https://github.com/test-owner/test-repo/commit/abc123def456"
        assert set(result.changed_files) == {"src/new_file.py", "docs/readme.md", "src/existing.py"}

    def test_missing_env_vars_raises(self, tmp_path):
        """Verify adapter raises PlaneAPIError when required env vars are missing.

        Tests: kicad-preview.AC6.3
        """
        # Create a minimal event payload file (won't be used)
        event_file = tmp_path / "event.json"
        event_file.write_text("{}")

        # Clear GITHUB_SHA and GITHUB_EVENT_PATH
        env_vars = {
            "GITHUB_REF_NAME": "main",
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "test-owner/test-repo",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            with pytest.raises(PlaneAPIError) as exc_info:
                GitHubAdapter.extract()

        assert "GitHub Actions environment not detected" in str(exc_info.value)
        assert "GITHUB_SHA" in str(exc_info.value)
        assert "GITHUB_EVENT_PATH" in str(exc_info.value)

    def test_deduplicates_changed_files(self, tmp_path):
        """Verify changed_files are deduplicated across commits.

        Tests deduplication logic.
        """
        # Create event payload with same file in multiple commits
        event_payload = {
            "head_commit": {
                "id": "abc123def456",
                "message": "feat: multiple changes",
            },
            "commits": [
                {
                    "added": ["src/file1.py"],
                    "modified": ["src/shared.py"],
                    "removed": [],
                },
                {
                    "added": ["src/file2.py"],
                    "modified": ["src/shared.py"],  # Same file in both commits
                    "removed": [],
                },
            ],
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        env_vars = {
            "GITHUB_SHA": "abc123def456",
            "GITHUB_REF_NAME": "main",
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "test-owner/test-repo",
            "GITHUB_EVENT_PATH": str(event_file),
        }

        with patch.dict(os.environ, env_vars, clear=False):
            result = GitHubAdapter.extract()

        # Verify shared.py appears only once
        assert result.changed_files.count("src/shared.py") == 1
        assert set(result.changed_files) == {"src/file1.py", "src/file2.py", "src/shared.py"}

    def test_fallback_to_first_commit_when_head_commit_missing(self, tmp_path):
        """Verify adapter falls back to first commit when head_commit is absent.

        Tests non-push events that lack head_commit.
        """
        # Create event payload without head_commit
        event_payload = {
            "commits": [
                {
                    "id": "fallback123",
                    "message": "fallback message",
                    "added": ["src/file.py"],
                    "modified": [],
                    "removed": [],
                }
            ],
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        env_vars = {
            "GITHUB_SHA": "fallback123",
            "GITHUB_REF_NAME": "develop",
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "test-owner/test-repo",
            "GITHUB_EVENT_PATH": str(event_file),
        }

        with patch.dict(os.environ, env_vars, clear=False):
            result = GitHubAdapter.extract()

        assert result.commit_message == "fallback message"
        assert result.changed_files == ("src/file.py",)

    def test_default_server_url(self, tmp_path):
        """Verify adapter uses default GitHub server URL when env var is missing."""
        event_payload = {
            "head_commit": {
                "id": "abc123",
                "message": "test",
            },
            "commits": [{"added": [], "modified": [], "removed": []}],
        }
        event_file = tmp_path / "event.json"
        event_file.write_text(json.dumps(event_payload))

        env_vars = {
            "GITHUB_SHA": "abc123",
            "GITHUB_REF_NAME": "main",
            "GITHUB_REPOSITORY": "test-owner/test-repo",
            "GITHUB_EVENT_PATH": str(event_file),
        }

        with patch.dict(os.environ, env_vars, clear=True):
            result = GitHubAdapter.extract()

        assert result.commit_url == "https://github.com/test-owner/test-repo/commit/abc123"
