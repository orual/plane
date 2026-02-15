"""Plane API client for uploading assets and creating comments."""

import logging
from pathlib import Path

import httpx
from tenacity import (
    RetryError,
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from plane_preview.types import AssetUploadResult, MAX_FILE_SIZE, PlaneAPIError

logger = logging.getLogger(__name__)


class PlaneClient:
    """Client for interacting with the Plane API."""

    def __init__(self, base_url: str, api_key: str, workspace: str):
        """Initialize PlaneClient.

        Args:
            base_url: Base URL of the Plane API (e.g., https://api.example.com)
            api_key: API key for authentication
            workspace: Workspace slug

        Raises:
            PlaneAPIError: If api_key is empty or None
        """
        if not api_key:
            raise PlaneAPIError("PLANE_API_KEY is required")

        self.workspace = workspace
        self.base_url = base_url
        self._client = httpx.Client(
            base_url=base_url,
            headers={"X-Api-Key": api_key},
            timeout=30.0,
        )

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

    def close(self):
        """Close the httpx client."""
        self._client.close()

    def _get_api_retry(self):
        """Get retry configuration for API calls (3 attempts, exponential backoff)."""
        return Retrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception_type((httpx.TransportError, _HTTPError)),
            reraise=True,
        )

    def _get_s3_retry(self):
        """Get retry configuration for S3 calls (2 attempts, exponential backoff)."""
        return Retrying(
            stop=stop_after_attempt(2),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception_type((httpx.TransportError, _HTTPError)),
            reraise=True,
        )

    def upload_asset(self, file_path: Path, mime_type: str) -> AssetUploadResult | None:
        """Upload an asset to Plane and S3.

        Performs three steps:
        1. GET presigned S3 URL from Plane API
        2. POST file to presigned S3 URL
        3. PATCH Plane API to confirm upload

        Args:
            file_path: Path to the file to upload
            mime_type: MIME type of the file

        Returns:
            AssetUploadResult on success, None if file exceeds MAX_FILE_SIZE

        Raises:
            PlaneAPIError: If API calls fail after retries
        """
        # Check file size
        file_size = file_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            logger.warning(
                f"File {file_path.name} ({file_size} bytes) exceeds {MAX_FILE_SIZE} bytes limit, skipping"
            )
            return None

        # Step 1: Get presigned URL
        asset_id, upload_data, asset_url = self._get_presigned_url(
            file_path, file_size, mime_type
        )

        # Step 2: Upload to S3
        self._upload_to_s3(file_path, upload_data)

        # Step 3: Confirm upload
        self._confirm_upload(asset_id)

        return AssetUploadResult(asset_id=asset_id, asset_url=asset_url)

    def _get_presigned_url(self, file_path: Path, file_size: int, mime_type: str) -> tuple[str, dict, str]:
        """Get presigned S3 URL from Plane API.

        Args:
            file_path: Path to the file
            file_size: File size in bytes
            mime_type: MIME type

        Returns:
            Tuple of (asset_id, upload_data, asset_url)

        Raises:
            PlaneAPIError: If request fails after retries
        """
        url = f"/api/v1/workspaces/{self.workspace}/assets/"
        body = {
            "name": file_path.name,
            "type": mime_type,
            "size": file_size,
        }

        try:
            for attempt in self._get_api_retry():
                with attempt:
                    response = self._client.post(url, json=body)
                    if response.status_code >= 500:
                        raise _HTTPError(f"HTTP {response.status_code}")
                    if response.status_code != 200:
                        raise PlaneAPIError(f"Failed to get presigned URL: {response.status_code}")
                    data = response.json()
                    return data["asset_id"], data["upload_data"], data["asset_url"]
        except _HTTPError:
            raise PlaneAPIError("Failed to get presigned URL after retries")
        except PlaneAPIError:
            raise

    def _upload_to_s3(self, file_path: Path, upload_data: dict) -> None:
        """Upload file to presigned S3 URL.

        Args:
            file_path: Path to the file
            upload_data: Upload data with url and fields

        Raises:
            PlaneAPIError: If upload fails after retries
        """
        s3_url = upload_data["url"]
        fields = upload_data["fields"]

        # Create a separate client for S3 (no auth headers, different base URL)
        with httpx.Client(timeout=30.0) as s3_client:
            try:
                for attempt in self._get_s3_retry():
                    with attempt:
                        with open(file_path, "rb") as f:
                            files = {
                                **{k: (None, v) for k, v in fields.items()},
                                "file": (file_path.name, f, "application/octet-stream"),
                            }
                            response = s3_client.post(s3_url, files=files)
                            if response.status_code >= 500:
                                raise _HTTPError(f"HTTP {response.status_code}")
                            if response.status_code not in (200, 204):
                                raise PlaneAPIError(
                                    f"Failed to upload to S3: {response.status_code}"
                                )
            except _HTTPError:
                raise PlaneAPIError("Failed to upload to S3 after retries")
            except PlaneAPIError:
                raise

    def _confirm_upload(self, asset_id: str) -> None:
        """Confirm upload completion with Plane API.

        Args:
            asset_id: ID of the uploaded asset

        Raises:
            PlaneAPIError: If confirmation fails after retries
        """
        url = f"/api/v1/workspaces/{self.workspace}/assets/{asset_id}/"
        body = {"is_uploaded": True}

        try:
            for attempt in self._get_api_retry():
                with attempt:
                    response = self._client.patch(url, json=body)
                    if response.status_code >= 500:
                        raise _HTTPError(f"HTTP {response.status_code}")
                    if response.status_code != 204:
                        raise PlaneAPIError(f"Failed to confirm upload: {response.status_code}")
                    return
        except _HTTPError:
            raise PlaneAPIError("Failed to confirm upload after retries")
        except PlaneAPIError:
            raise

    def create_comment(
        self,
        project_id: str,
        issue_id: str,
        comment_html: str,
        external_source: str,
        external_id: str,
    ) -> str | None:
        """Create a comment on an issue.

        Args:
            project_id: Project ID
            issue_id: Issue ID
            comment_html: HTML content of the comment
            external_source: External source identifier
            external_id: External ID for deduplication

        Returns:
            Comment ID on success, None if 409 (duplicate) or 404 (invalid issue)

        Raises:
            PlaneAPIError: If API call fails after retries
        """
        url = f"/api/v1/workspaces/{self.workspace}/projects/{project_id}/work-items/{issue_id}/comments/"
        body = {
            "comment_html": comment_html,
            "external_source": external_source,
            "external_id": external_id,
        }

        try:
            for attempt in self._get_api_retry():
                with attempt:
                    response = self._client.post(url, json=body)
                    if response.status_code >= 500:
                        raise _HTTPError(f"HTTP {response.status_code}")
                    if response.status_code == 409:
                        logger.info(f"Comment already exists for {external_id}")
                        return None
                    if response.status_code == 404:
                        logger.warning(f"Issue {issue_id} not found")
                        return None
                    if response.status_code != 201:
                        raise PlaneAPIError(
                            f"Failed to create comment: {response.status_code}"
                        )
                    data = response.json()
                    return data.get("id")
        except _HTTPError:
            raise PlaneAPIError("Failed to create comment after retries")
        except PlaneAPIError:
            raise

    def post_preview(
        self,
        targets: list,
        commit_sha: str,
        commit_url: str,
        branch: str,
    ) -> None:
        """Post preview to Plane issues.

        Args:
            targets: List of PreviewTarget instances
            commit_sha: Commit SHA
            commit_url: URL to the commit
            branch: Branch name
        """
        short_sha = commit_sha[:7]

        for target in targets:
            # Upload all render files for this target
            uploads = []
            for render_file in target.render_files:
                upload_result = self.upload_asset(
                    render_file.render_path,
                    render_file.mime_type,
                )
                if upload_result is not None:
                    uploads.append((render_file, upload_result))

            # Skip if no uploads succeeded
            if not uploads:
                logger.warning(
                    f"Skipping preview for {target.issue_id}: all renders failed or were oversized"
                )
                continue

            # Build HTML comment
            html_parts = [
                f"<h3>Hardware preview — commit <a href=\"{commit_url}\">{short_sha}</a></h3>",
                f"<p>Branch: <code>{branch}</code></p>",
            ]

            for render_file, upload_result in uploads:
                html_parts.append(f"<h4>{render_file.source_path}</h4>")
                html_parts.append(
                    f'<p><img src="{upload_result.asset_url}" alt="{render_file.render_path.name} render" /></p>'
                )

            comment_html = "\n".join(html_parts)

            # Create comment
            comment_id = self.create_comment(
                project_id=target.project_id,
                issue_id=target.issue_id,
                comment_html=comment_html,
                external_source="plane-hw-preview",
                external_id=f"{commit_sha}:{target.issue_id}",
            )

            if comment_id is not None:
                logger.info(f"Created comment {comment_id} on {target.issue_id}")
            else:
                logger.info(f"Skipped comment for {target.issue_id} (duplicate or invalid)")


class _HTTPError(Exception):
    """Internal exception for HTTP errors to trigger retry."""

    pass
