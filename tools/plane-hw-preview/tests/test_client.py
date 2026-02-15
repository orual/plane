"""Tests for PlaneClient."""

import json
import logging

import pytest
import respx
from httpx import Response

from plane_preview.client import PlaneClient
from plane_preview.types import MAX_FILE_SIZE, PlaneAPIError


@pytest.mark.unit
class TestPlaneClient:
    """Test suite for PlaneClient."""

    @pytest.fixture
    def client(self):
        """Create a PlaneClient instance for testing."""
        c = PlaneClient(
            base_url="https://api.example.com",
            api_key="test-api-key",
            workspace="test-ws",
        )
        yield c
        c.close()

    @pytest.fixture
    def mock_respx(self):
        """Provide a respx mock context manager."""
        with respx.mock:
            yield respx

    def test_missing_api_key_raises(self):
        """Test that missing API key raises PlaneAPIError immediately."""
        with pytest.raises(PlaneAPIError, match="PLANE_API_KEY is required"):
            PlaneClient(
                base_url="https://api.example.com",
                api_key="",
                workspace="test-ws",
            )

    def test_none_api_key_raises(self):
        """Test that None API key raises PlaneAPIError immediately."""
        with pytest.raises(PlaneAPIError, match="PLANE_API_KEY is required"):
            PlaneClient(
                base_url="https://api.example.com",
                api_key=None,
                workspace="test-ws",
            )

    def test_upload_and_create_comment(self, client, tmp_path, mock_respx):
        """Test AC1.1: Complete upload and comment creation flow."""
        # Create a test file
        render_file = tmp_path / "board.svg"
        render_file.write_bytes(b"<svg></svg>")

        # Mock presigned URL endpoint
        presigned_response = {
            "upload_data": {
                "url": "https://s3.example.com/upload",
                "fields": {
                    "key": "test-key",
                    "acl": "public-read",
                },
            },
            "asset_id": "asset-uuid",
            "asset_url": "https://s3.example.com/asset.png",
        }
        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").mock(
            return_value=Response(200, json=presigned_response)
        )

        # Mock S3 upload
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Mock confirm upload endpoint
        respx.patch("https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid/").mock(
            return_value=Response(204)
        )

        # Mock comment creation endpoint
        comment_response = {"id": "comment-uuid"}
        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-uuid/comments/"
        ).mock(return_value=Response(201, json=comment_response))

        # Test upload_asset
        result = client.upload_asset(render_file, "image/svg+xml")
        assert result is not None
        assert result.asset_id == "asset-uuid"
        assert result.asset_url == "https://s3.example.com/asset.png"

        # Test create_comment
        comment_id = client.create_comment(
            project_id="proj-uuid",
            issue_id="issue-uuid",
            comment_html='<img src="https://s3.example.com/asset.png" />',
            external_source="plane-hw-preview",
            external_id="abc123:issue-uuid",
        )
        assert comment_id == "comment-uuid"

    def test_duplicate_comment_handled(self, client, mock_respx):
        """Test AC1.6: 409 duplicate comment is handled gracefully."""
        duplicate_response = {
            "error": "Work item comment with the same external id and external source already exists",
            "id": "comment-uuid",
        }
        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-uuid/comments/"
        ).mock(return_value=Response(409, json=duplicate_response))

        result = client.create_comment(
            project_id="proj-uuid",
            issue_id="issue-uuid",
            comment_html="<img />",
            external_source="plane-hw-preview",
            external_id="abc123:issue-uuid",
        )
        assert result is None

    def test_api_retry_on_transient_failure(self, client, tmp_path, mock_respx):
        """Test AC5.1: Transient API failures are retried."""
        # Create a test file
        render_file = tmp_path / "board.svg"
        render_file.write_bytes(b"<svg></svg>")

        # Mock presigned URL endpoint - success on first try
        presigned_response = {
            "upload_data": {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "test-key"},
            },
            "asset_id": "asset-uuid",
            "asset_url": "https://s3.example.com/asset.png",
        }
        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").mock(
            return_value=Response(200, json=presigned_response)
        )

        # Mock S3 upload
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Mock confirm - fails twice then succeeds
        confirm_route = respx.patch("https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid/")
        confirm_route.side_effect = [
            Response(500),
            Response(500),
            Response(204),
        ]

        # Should eventually succeed after retries
        result = client.upload_asset(render_file, "image/svg+xml")
        assert result is not None
        assert result.asset_id == "asset-uuid"

    def test_s3_upload_retry(self, client, tmp_path, mock_respx):
        """Test AC5.2: S3 upload failures are retried."""
        # Create a test file
        render_file = tmp_path / "board.svg"
        render_file.write_bytes(b"<svg></svg>")

        # Mock presigned URL endpoint
        presigned_response = {
            "upload_data": {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "test-key"},
            },
            "asset_id": "asset-uuid",
            "asset_url": "https://s3.example.com/asset.png",
        }
        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").mock(
            return_value=Response(200, json=presigned_response)
        )

        # Mock S3 upload - fails once then succeeds
        s3_route = respx.post("https://s3.example.com/upload")
        s3_route.side_effect = [
            Response(500),
            Response(204),
        ]

        # Mock confirm
        respx.patch("https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid/").mock(
            return_value=Response(204)
        )

        # Should eventually succeed
        result = client.upload_asset(render_file, "image/svg+xml")
        assert result is not None
        assert result.asset_id == "asset-uuid"

    def test_api_unreachable_raises_after_retries(self, client, tmp_path, mock_respx):
        """Test AC5.3: API unreachable after retries raises PlaneAPIError."""
        # Create a test file
        render_file = tmp_path / "board.svg"
        render_file.write_bytes(b"<svg></svg>")

        # Mock presigned URL endpoint - always fails
        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").mock(return_value=Response(500))

        # Should raise PlaneAPIError after exhausting retries
        with pytest.raises(PlaneAPIError):
            client.upload_asset(render_file, "image/svg+xml")

    def test_oversized_file_skipped(self, client, tmp_path, mock_respx, caplog):
        """Test AC5.4: Files larger than 5 MB are skipped with warning."""
        # Create a file larger than MAX_FILE_SIZE
        large_file = tmp_path / "large.svg"
        # Write slightly over 5 MB
        large_file.write_bytes(b"x" * (MAX_FILE_SIZE + 1))

        # Capture logs
        with caplog.at_level(logging.WARNING):
            result = client.upload_asset(large_file, "image/svg+xml")

        assert result is None
        assert "exceeds" in caplog.text.lower() or "size" in caplog.text.lower()

    def test_full_upload_and_comment_flow(self, client, tmp_path, mock_respx):
        """Test AC1.1 (full): Complete upload and comment with correct HTML."""
        # Create test files
        render_file = tmp_path / "board.svg"
        render_file.write_bytes(b"<svg></svg>")

        # Mock presigned URL
        presigned_response = {
            "upload_data": {
                "url": "https://s3.example.com/upload",
                "fields": {"key": "test-key"},
            },
            "asset_id": "asset-uuid",
            "asset_url": "https://s3.example.com/asset.svg",
        }
        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").mock(
            return_value=Response(200, json=presigned_response)
        )

        # Mock S3 upload
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Mock confirm
        respx.patch("https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid/").mock(
            return_value=Response(204)
        )

        # Mock comment creation - capture the request to verify HTML
        comment_requests = []

        def capture_comment_request(request):
            comment_requests.append(json.loads(request.content))
            return Response(201, json={"id": "comment-uuid"})

        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-uuid/comments/"
        ).side_effect = capture_comment_request

        # Upload and create comment
        upload_result = client.upload_asset(render_file, "image/svg+xml")
        assert upload_result is not None

        comment_id = client.create_comment(
            project_id="proj-uuid",
            issue_id="issue-uuid",
            comment_html=f'<img src="{upload_result.asset_url}" alt="board.svg render" />',
            external_source="plane-hw-preview",
            external_id="abc123:issue-uuid",
        )
        assert comment_id == "comment-uuid"

        # Verify comment HTML contains img tag
        assert len(comment_requests) == 1
        comment_body = comment_requests[0]
        assert "img" in comment_body["comment_html"]
        assert "s3.example.com/asset.svg" in comment_body["comment_html"]
