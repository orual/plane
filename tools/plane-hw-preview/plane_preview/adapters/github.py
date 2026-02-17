"""GitHub Actions adapter for extracting commit metadata."""

import json
import os

from plane_preview.adapters.base import AdapterResult
from plane_preview.types import PlaneAPIError


class GitHubAdapter:
    """Extract commit metadata from GitHub Actions environment."""

    @classmethod
    def extract(cls) -> AdapterResult:
        """Extract commit info from GitHub Actions environment variables and event payload.

        Returns:
            AdapterResult with commit SHA, message, branch, URL, and changed files.

        Raises:
            PlaneAPIError: If required environment variables are missing.
        """
        # Check required env vars
        commit_sha = os.getenv("GITHUB_SHA")
        event_path = os.getenv("GITHUB_EVENT_PATH")

        if not commit_sha or not event_path:
            raise PlaneAPIError(
                "GitHub Actions environment not detected. Required environment variables "
                "(GITHUB_SHA, GITHUB_EVENT_PATH) are missing. Are you running inside GitHub Actions?"
            )

        # Extract from environment
        branch = os.getenv("GITHUB_REF_NAME", "")
        server_url = os.getenv("GITHUB_SERVER_URL", "https://github.com")
        repository = os.getenv("GITHUB_REPOSITORY", "")

        # Construct commit URL
        commit_url = f"{server_url}/{repository}/commit/{commit_sha}"

        # Read event payload
        with open(event_path, encoding="utf-8") as f:
            event = json.load(f)

        # Extract commit message from head_commit or fall back to first commit
        commit_message = ""
        if "head_commit" in event and event["head_commit"]:
            commit_message = event["head_commit"].get("message", "")
        elif "commits" in event and event["commits"]:
            commit_message = event["commits"][0].get("message", "")

        # Collect changed files from all commits (added + modified, deduplicated)
        changed_files_set = set()
        if "commits" in event:
            for commit in event["commits"]:
                added = commit.get("added", [])
                modified = commit.get("modified", [])
                changed_files_set.update(added)
                changed_files_set.update(modified)

        changed_files = tuple(sorted(changed_files_set))

        return AdapterResult(
            commit_sha=commit_sha,
            commit_message=commit_message,
            commit_url=commit_url,
            branch=branch,
            changed_files=changed_files,
        )
