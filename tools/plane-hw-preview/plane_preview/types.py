"""Shared types used across the plane_preview package."""

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
