"""Tests for preview posting functionality."""

import json
import logging

import pytest
import respx
from httpx import Response

from plane_preview.client import PlaneClient
from plane_preview.types import PreviewTarget


@pytest.mark.unit
class TestPreviewPosting:
    """Test suite for preview posting functionality."""

    @pytest.fixture
    def client(self):
        """Create a PlaneClient instance for testing."""
        return PlaneClient(
            base_url="https://api.example.com",
            api_key="test-api-key",
            workspace="test-ws",
        )

    @respx.mock
    def test_multiple_renders_grouped_in_single_comment(
        self, client, render_file_factory
    ):
        """Test AC1.2: Multiple renders for same issue are in one comment."""
        # Create a preview target with two render files
        render1 = render_file_factory(
            source_path="schematic.kicad_sch",
            filename="schematic.svg",
            content=b"<svg>sch</svg>",
        )
        render2 = render_file_factory(
            source_path="board.kicad_pcb",
            filename="board.svg",
            content=b"<svg>pcb</svg>",
        )
        target = PreviewTarget(
            project_id="proj-uuid",
            issue_id="issue-uuid",
            render_files=(render1, render2),
        )

        # For presigned URLs
        def presigned_response(request):
            body = json.loads(request.content)
            if body["name"] == "schematic.svg":
                return Response(
                    200,
                    json={
                        "upload_data": {
                            "url": "https://s3.example.com/upload",
                            "fields": {"key": "key1"},
                        },
                        "asset_id": "asset-uuid-1",
                        "asset_url": "https://s3.example.com/asset1.svg",
                    },
                )
            else:
                return Response(
                    200,
                    json={
                        "upload_data": {
                            "url": "https://s3.example.com/upload",
                            "fields": {"key": "key2"},
                        },
                        "asset_id": "asset-uuid-2",
                        "asset_url": "https://s3.example.com/asset2.svg",
                    },
                )

        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").side_effect = (
            presigned_response
        )

        # Mock S3 uploads
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Mock confirm uploads
        respx.patch(
            "https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid-1/"
        ).mock(return_value=Response(204))
        respx.patch(
            "https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid-2/"
        ).mock(return_value=Response(204))

        # Capture comment creation request
        comment_requests = []

        def capture_comment(request):
            comment_requests.append(json.loads(request.content))
            return Response(201, json={"id": "comment-uuid"})

        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-uuid/comments/"
        ).side_effect = capture_comment

        # Post preview
        client.post_preview(
            targets=[target],
            commit_sha="abc123def456",
            commit_url="https://github.com/owner/repo/commit/abc123def456",
            branch="main",
        )

        # Verify only ONE comment was created
        assert len(comment_requests) == 1
        comment_html = comment_requests[0]["comment_html"]

        # Verify it contains TWO img tags
        assert comment_html.count("<img") == 2
        assert "asset1.svg" in comment_html
        assert "asset2.svg" in comment_html
        # Verify header format
        assert "abc123d" in comment_html  # short sha
        assert "main" in comment_html

    @respx.mock
    def test_multiple_issues_get_separate_comments(
        self, client, render_file_factory
    ):
        """Test AC1.3: Different issues get separate comments."""
        # Create two targets with different issue IDs and different renders
        render1 = render_file_factory(
            source_path="schematic.kicad_sch",
            filename="schematic1.svg",
            content=b"<svg>sch1</svg>",
        )
        render2 = render_file_factory(
            source_path="board.kicad_pcb",
            filename="board2.svg",
            content=b"<svg>pcb2</svg>",
        )
        target1 = PreviewTarget(
            project_id="proj-uuid",
            issue_id="issue-1",
            render_files=(render1,),
        )
        target2 = PreviewTarget(
            project_id="proj-uuid",
            issue_id="issue-2",
            render_files=(render2,),
        )

        # Mock presigned URLs
        def presigned_varied(request):
            body = json.loads(request.content)
            if body["name"] == "schematic1.svg":
                return Response(
                    200,
                    json={
                        "upload_data": {
                            "url": "https://s3.example.com/upload",
                            "fields": {"key": "key1"},
                        },
                        "asset_id": "asset-1",
                        "asset_url": "https://s3.example.com/asset1.svg",
                    },
                )
            else:
                return Response(
                    200,
                    json={
                        "upload_data": {
                            "url": "https://s3.example.com/upload",
                            "fields": {"key": "key2"},
                        },
                        "asset_id": "asset-2",
                        "asset_url": "https://s3.example.com/asset2.svg",
                    },
                )

        respx.post("https://api.example.com/api/v1/workspaces/test-ws/assets/").side_effect = (
            presigned_varied
        )

        # Mock S3 uploads
        respx.post("https://s3.example.com/upload").mock(return_value=Response(204))

        # Mock confirm uploads
        respx.patch(
            "https://api.example.com/api/v1/workspaces/test-ws/assets/asset-1/"
        ).mock(return_value=Response(204))
        respx.patch(
            "https://api.example.com/api/v1/workspaces/test-ws/assets/asset-2/"
        ).mock(return_value=Response(204))

        # Capture comment creation requests
        comment_requests = []

        def capture_comment(request):
            comment_requests.append(json.loads(request.content))
            return Response(201, json={"id": "comment-uuid"})

        # Mock both comment endpoints
        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-1/comments/"
        ).side_effect = capture_comment
        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/issue-2/comments/"
        ).side_effect = capture_comment

        # Post preview
        client.post_preview(
            targets=[target1, target2],
            commit_sha="abc123def456",
            commit_url="https://github.com/owner/repo/commit/abc123def456",
            branch="main",
        )

        # Verify TWO comments were created
        assert len(comment_requests) == 2

        # Verify first comment contains asset1
        assert "asset1.svg" in comment_requests[0]["comment_html"]
        assert "asset2.svg" not in comment_requests[0]["comment_html"]

        # Verify second comment contains asset2
        assert "asset2.svg" in comment_requests[1]["comment_html"]
        assert "asset1.svg" not in comment_requests[1]["comment_html"]

    @respx.mock
    def test_invalid_issue_id_skipped(self, client, render_file_factory, caplog):
        """Test AC1.5: Invalid issue ID is logged as warning and skipped."""
        # Create a target with a render
        render = render_file_factory(
            source_path="board.kicad_pcb",
            filename="board.svg",
            content=b"<svg></svg>",
        )
        target = PreviewTarget(
            project_id="proj-uuid",
            issue_id="invalid-issue",
            render_files=(render,),
        )

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
        respx.patch(
            "https://api.example.com/api/v1/workspaces/test-ws/assets/asset-uuid/"
        ).mock(return_value=Response(204))

        # Mock comment endpoint to return 404
        respx.post(
            "https://api.example.com/api/v1/workspaces/test-ws/projects/proj-uuid/work-items/invalid-issue/comments/"
        ).mock(return_value=Response(404))

        # Call post_preview - should not raise
        with caplog.at_level(logging.WARNING):
            client.post_preview(
                targets=[target],
                commit_sha="abc123def456",
                commit_url="https://github.com/owner/repo/commit/abc123def456",
                branch="main",
            )

        # Verify warning was logged
        assert "not found" in caplog.text.lower() or "invalid" in caplog.text.lower()
