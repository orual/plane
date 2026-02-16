# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.contract
@pytest.mark.django_db
class TestLlmEndpointReasoning:
    """Test LLM endpoint response including reasoning content."""

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_endpoint_returns_reasoning_content_when_present(
        self, mock_completion, mock_get_llm_config, session_client, workspace, create_user
    ):
        """POST to endpoint returns JSON with reasoning_content field when LLM provides it."""
        from plane.db.models import Project

        # Create a test project
        project = Project.objects.create(
            name="Test Project",
            identifier="TP",
            workspace=workspace,
            created_by=create_user,
        )

        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "gpt-4.1", "openai", "")

        # Mock litellm.completion to return response with reasoning_content
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "The answer is 42"
        mock_response.choices[0].message.reasoning_content = "I reasoned through this carefully"
        mock_completion.return_value = mock_response

        # POST to the endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/gpt-integration/",
            data={
                "task": "Calculate the answer",
                "prompt": "to the universe",
            },
            format="json",
        )

        # Verify the response includes reasoning_content
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "The answer is 42"
        assert "reasoning_content" in data
        assert data["reasoning_content"] == "I reasoned through this carefully"

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_endpoint_omits_reasoning_content_when_absent(
        self, mock_completion, mock_get_llm_config, session_client, workspace, create_user
    ):
        """POST to endpoint omits reasoning_content field when not provided by LLM."""
        from plane.db.models import Project

        # Create a test project
        project = Project.objects.create(
            name="Test Project",
            identifier="TP",
            workspace=workspace,
            created_by=create_user,
        )

        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "gpt-4.1", "openai", "")

        # Mock litellm.completion to return response without reasoning_content
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Simple answer"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        # POST to the endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/gpt-integration/",
            data={
                "task": "Simple task",
                "prompt": "simple prompt",
            },
            format="json",
        )

        # Verify the response does NOT include reasoning_content
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "Simple answer"
        assert "reasoning_content" not in data

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_workspace_endpoint_returns_reasoning_content(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """WorkspaceGPTIntegrationEndpoint returns reasoning_content when provided."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "claude-opus-4-6", "anthropic", "")

        # Mock litellm.completion to return response with reasoning_content
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Complex analysis"
        mock_response.choices[0].message.reasoning_content = "Detailed reasoning here"
        mock_completion.return_value = mock_response

        # POST to workspace endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/gpt-integration/",
            data={
                "task": "Analyze",
                "prompt": "this text",
            },
            format="json",
        )

        # Verify the response includes reasoning_content
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "Complex analysis"
        assert "reasoning_content" in data
        assert data["reasoning_content"] == "Detailed reasoning here"

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_workspace_endpoint_omits_reasoning_content_when_none(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """WorkspaceGPTIntegrationEndpoint omits reasoning_content when None."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "gpt-4.1", "openai", "")

        # Mock litellm.completion to return response without reasoning_content
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Simple response"
        # Use getattr behavior - should return None when attribute missing
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        # POST to workspace endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/gpt-integration/",
            data={
                "task": "Summarize",
                "prompt": "this content",
            },
            format="json",
        )

        # Verify the response does NOT include reasoning_content
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "Simple response"
        assert "reasoning_content" not in data
