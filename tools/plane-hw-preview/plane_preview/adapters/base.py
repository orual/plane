"""Base classes and types for git-host adapters."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AdapterResult:
    """Result of adapter analysis for a commit."""

    commit_sha: str
    commit_message: str
    commit_url: str
    branch: str
    changed_files: tuple[str, ...]
