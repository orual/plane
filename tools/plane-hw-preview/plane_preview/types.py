"""Shared types used across the plane_preview package."""

import fnmatch
from dataclasses import dataclass
from pathlib import Path

MAX_FILE_SIZE: int = 5_242_880  # 5 MB, matching Plane's default FILE_SIZE_LIMIT


@dataclass(frozen=True)
class AssetUploadResult:
    """Result of a successful asset upload to S3."""

    asset_id: str
    asset_url: str


@dataclass(frozen=True)
class RenderFile:
    """A rendered output file from KiCad rendering."""

    source_path: str  # relative path of the KiCad source file
    render_path: Path  # absolute path to rendered image
    mime_type: str


@dataclass(frozen=True)
class PreviewTarget:
    """A target issue and its associated render files."""

    project_id: str
    issue_id: str
    render_files: tuple[RenderFile, ...]


class PlaneAPIError(Exception):
    """Raised when the Plane API returns an error."""

    pass


def glob_match(file_path: str, pattern: str) -> bool:
    """Match a file path against a glob pattern, handling ** for root-level files.

    Python's fnmatch treats ** as a literal two-character wildcard within a single
    path segment, so **/*.ext fails to match root-level files like Board.ext.
    This function works around that by also trying the pattern's tail when it
    starts with **/.
    """
    if fnmatch.fnmatch(file_path, pattern):
        return True
    if pattern.startswith("**/"):
        return fnmatch.fnmatch(file_path, pattern[3:])
    return False
