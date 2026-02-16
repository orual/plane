# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.contract
@pytest.mark.django_db
class TestGrammarCorrectionEndpoint:
    """Test /rephrase-grammar/ endpoint for grammar correction."""

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_grammar_correction_with_valid_text(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """POST with valid text returns 200 with corrected response."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "claude-sonnet-4-5-20250929", "anthropic", "")

        # Mock litellm.completion to return corrected text
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "This is the corrected text."
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        # POST to the grammar endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/rephrase-grammar/",
            data={
                "task": "rephrase_grammar",
                "text_input": "This are the text what need correcting.",
            },
            format="json",
        )

        # Verify the response
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "This is the corrected text."

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_grammar_correction_with_empty_text_input(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """POST with empty text_input returns 400 with validation error."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "claude-sonnet-4-5-20250929", "anthropic", "")

        # POST with empty text_input
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/rephrase-grammar/",
            data={
                "task": "rephrase_grammar",
                "text_input": "",
            },
            format="json",
        )

        # Verify the response returns 400 error
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert data["error"] == "Text input is required"
        # Completion should not be called with invalid input
        mock_completion.assert_not_called()

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_grammar_correction_with_whitespace_only_input(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """POST with whitespace-only text_input returns 400."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "claude-sonnet-4-5-20250929", "anthropic", "")

        # POST with whitespace-only input
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/rephrase-grammar/",
            data={
                "task": "rephrase_grammar",
                "text_input": "   \t  ",
            },
            format="json",
        )

        # Verify the response returns 400 error
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert data["error"] == "Text input is required"
        mock_completion.assert_not_called()

    @patch("plane.app.views.external.base.get_llm_config")
    @patch("plane.app.views.external.base.litellm.completion")
    def test_grammar_correction_without_reasoning_content(
        self, mock_completion, mock_get_llm_config, session_client, workspace
    ):
        """Response does not include reasoning_content field."""
        # Mock get_llm_config to return valid values
        mock_get_llm_config.return_value = ("test-api-key", "gpt-4.1", "openai", "")

        # Mock litellm.completion to return response without reasoning_content
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Corrected text"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        # POST to the grammar endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/rephrase-grammar/",
            data={
                "task": "rephrase_grammar",
                "text_input": "Some text to correct",
            },
            format="json",
        )

        # Verify response structure
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["response"] == "Corrected text"
        # Grammar endpoint should not include reasoning_content
        assert "reasoning_content" not in data

    @patch("plane.app.views.external.base.get_llm_config")
    def test_grammar_correction_without_llm_config(
        self, mock_get_llm_config, session_client, workspace
    ):
        """POST without valid LLM config returns 400."""
        # Mock get_llm_config to return None values (missing config)
        mock_get_llm_config.return_value = (None, None, None, None)

        # POST to the grammar endpoint
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/rephrase-grammar/",
            data={
                "task": "rephrase_grammar",
                "text_input": "Some text to correct",
            },
            format="json",
        )

        # Verify the response returns 400 error
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert "required" in data["error"].lower()
