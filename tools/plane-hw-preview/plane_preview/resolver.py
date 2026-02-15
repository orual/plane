"""Issue resolver for mapping changed files to Plane issue targets."""

import fnmatch
import logging
import re
from pathlib import Path

from plane_preview.config import Config
from plane_preview.types import PreviewTarget, RenderFile

logger = logging.getLogger(__name__)


class IssueResolver:
    """Resolves changed files to Plane issue targets based on commit messages and path mappings."""

    def __init__(self, config: Config) -> None:
        """Initialize the resolver with configuration.

        Args:
            config: The plane-preview configuration
        """
        self.config = config

        # Build regex pattern for commit message parsing
        if config.commit_patterns:
            prefixes = "|".join(re.escape(pattern.prefix) for pattern in config.commit_patterns)
            pattern_str = rf"\[?({prefixes})-(\d+)\]?"
            self.commit_regex = re.compile(pattern_str, re.IGNORECASE)
        else:
            self.commit_regex = None

    def resolve(self, changed_files: list[str], commit_message: str) -> list[PreviewTarget]:
        """Resolve changed files to issue targets.

        This works in three stages:
        1. Parse commit message for issue references
        2. Assign each file to a target issue (by project)
        3. Group into PreviewTargets

        Args:
            changed_files: List of changed file paths
            commit_message: The commit message to parse

        Returns:
            List of PreviewTarget objects for posting to Plane
        """
        # Stage 1: Parse commit message for issue references
        commit_references = self._parse_commit_message(commit_message)

        # Stage 2 & 3: Assign files and group into targets
        targets_dict: dict[tuple[str, str], list[RenderFile]] = {}

        for file_path in changed_files:
            # Find matching path mapping (most specific)
            matching_mapping = self._find_most_specific_mapping(file_path)

            if matching_mapping is None:
                # File doesn't match any path mapping, skip it
                continue

            project = matching_mapping.project

            # Determine issue: commit reference takes priority
            if project in commit_references:
                issue_id = commit_references[project]
            else:
                issue_id = matching_mapping.default_issue

            # Create RenderFile with placeholder render_path
            render_file = RenderFile(source_path=file_path, render_path=Path("."), mime_type="")

            # Add to targets
            key = (project, issue_id)
            if key not in targets_dict:
                targets_dict[key] = []
            targets_dict[key].append(render_file)

        # Convert to PreviewTarget list
        targets = [
            PreviewTarget(project_id=project, issue_id=issue_id, render_files=tuple(files))
            for (project, issue_id), files in targets_dict.items()
        ]

        return targets

    def _parse_commit_message(self, commit_message: str) -> dict[str, str]:
        """Parse commit message for issue references.

        Returns a dict mapping project names to issue identifiers (e.g., "PWR-42").

        Args:
            commit_message: The commit message to parse

        Returns:
            Dict of {project: issue_identifier}
        """
        result = {}

        if self.commit_regex is None or not commit_message:
            return result

        # Find all matches in the commit message
        matches = self.commit_regex.findall(commit_message)

        for prefix, number in matches:
            # Uppercase the prefix for lookup
            prefix_upper = prefix.upper()

            # Find the project for this prefix
            project = None
            for pattern in self.config.commit_patterns:
                if pattern.prefix.upper() == prefix_upper:
                    project = pattern.project
                    break

            if project is None:
                # Prefix doesn't match any configured project, skip it
                continue

            # Build issue identifier (use original-case prefix from pattern)
            for pattern in self.config.commit_patterns:
                if pattern.prefix.upper() == prefix_upper:
                    issue_identifier = f"{pattern.prefix}-{number}"
                    result[project] = issue_identifier
                    break

        return result

    def _find_most_specific_mapping(self, file_path: str):
        """Find the most specific path mapping for a file.

        If multiple mappings match, returns the one with the most path segments
        (e.g., "hardware/power-stage/**" is more specific than "hardware/**").

        Args:
            file_path: The file path to match

        Returns:
            The matching PathMapping, or None if no match
        """
        matches = []

        for mapping in self.config.path_mappings:
            if fnmatch.fnmatch(file_path, mapping.pattern):
                # Count path segments before ** or at end of pattern
                pattern_parts = mapping.pattern.rstrip("/").split("/")
                # Remove trailing ** if present
                if pattern_parts and pattern_parts[-1] == "**":
                    pattern_parts = pattern_parts[:-1]
                specificity = len(pattern_parts)
                matches.append((specificity, mapping))

        if not matches:
            return None

        # Sort by specificity descending and return the most specific
        matches.sort(key=lambda x: x[0], reverse=True)
        return matches[0][1]
