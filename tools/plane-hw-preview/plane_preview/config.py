"""Configuration loading and validation for plane-hw-preview."""

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class CommitPattern:
    """A pattern for matching commit messages to Plane projects."""

    prefix: str
    project: str


@dataclass(frozen=True)
class PathMapping:
    """A mapping from file path patterns to Plane projects and default issues."""

    pattern: str
    project: str
    default_issue: str


@dataclass(frozen=True)
class RendererConfig:
    """Configuration for rendering a specific file type."""

    match: str
    command: str
    config: str
    formats: tuple[str, ...]


@dataclass(frozen=True)
class Config:
    """Complete plane-hw-preview configuration."""

    base_url: str
    workspace: str
    commit_patterns: tuple[CommitPattern, ...]
    path_mappings: tuple[PathMapping, ...]
    renderers: tuple[RendererConfig, ...] | None


class ConfigLoader:
    """Loads and validates plane-preview.yml configuration files."""

    @classmethod
    def load(cls, path: Path) -> Config:
        """Load configuration from a YAML file.

        Args:
            path: Path to the .plane-preview.yml file

        Returns:
            Config: Validated configuration object

        Raises:
            ValueError: If required fields are missing or invalid
            yaml.YAMLError: If YAML parsing fails
        """
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if data is None:
            data = {}

        # Validate and extract plane section
        plane_config = data.get("plane", {})
        if not isinstance(plane_config, dict):
            raise ValueError("'plane' section must be a dictionary")

        base_url = plane_config.get("base_url")
        workspace = plane_config.get("workspace")

        if not base_url:
            raise ValueError("'plane.base_url' is required")
        if not workspace:
            raise ValueError("'plane.workspace' is required")

        # Parse commit_patterns
        commit_patterns_data = data.get("commit_patterns", [])
        if not isinstance(commit_patterns_data, list):
            raise ValueError("'commit_patterns' must be a list")

        commit_patterns = []
        for pattern in commit_patterns_data:
            if not isinstance(pattern, dict):
                raise ValueError("Each commit_pattern must be a dictionary")
            prefix = pattern.get("prefix")
            project = pattern.get("project")
            if not prefix:
                raise ValueError("Each commit_pattern must have a 'prefix'")
            if not project:
                raise ValueError("Each commit_pattern must have a 'project'")
            commit_patterns.append(CommitPattern(prefix=prefix, project=project))

        # Parse path_mappings
        path_mappings_data = data.get("path_mappings", [])
        if not isinstance(path_mappings_data, list):
            raise ValueError("'path_mappings' must be a list")

        path_mappings = []
        for mapping in path_mappings_data:
            if not isinstance(mapping, dict):
                raise ValueError("Each path_mapping must be a dictionary")
            pattern = mapping.get("pattern")
            project = mapping.get("project")
            default_issue = mapping.get("default_issue")
            if not pattern:
                raise ValueError("Each path_mapping must have a 'pattern'")
            if not project:
                raise ValueError("Each path_mapping must have a 'project'")
            if not default_issue:
                raise ValueError("Each path_mapping must have a 'default_issue'")
            path_mappings.append(PathMapping(pattern=pattern, project=project, default_issue=default_issue))

        # Parse renderers (optional)
        renderers = None
        renderers_data = data.get("renderers")
        if renderers_data is not None:
            if not isinstance(renderers_data, list):
                raise ValueError("'renderers' must be a list")

            renderer_list = []
            for renderer in renderers_data:
                if not isinstance(renderer, dict):
                    raise ValueError("Each renderer must be a dictionary")
                match = renderer.get("match")
                command = renderer.get("command")
                config = renderer.get("config")
                formats = renderer.get("formats", [])

                if not match:
                    raise ValueError("Each renderer must have a 'match'")
                if not command:
                    raise ValueError("Each renderer must have a 'command'")
                if not config:
                    raise ValueError("Each renderer must have a 'config'")
                if not isinstance(formats, list):
                    raise ValueError("'formats' must be a list")

                renderer_list.append(
                    RendererConfig(match=match, command=command, config=config, formats=tuple(formats))
                )

            renderers = tuple(renderer_list)

        return Config(
            base_url=base_url,
            workspace=workspace,
            commit_patterns=tuple(commit_patterns),
            path_mappings=tuple(path_mappings),
            renderers=renderers,
        )
