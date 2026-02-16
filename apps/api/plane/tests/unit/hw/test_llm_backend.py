# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from unittest.mock import patch, MagicMock

from plane.app.views.external.base import (
    PROVIDER_MODELS,
    DEFAULT_PROVIDER,
    get_llm_response,
)


@pytest.mark.unit
class TestProviderModels:
    """Test the PROVIDER_MODELS configuration."""

    def test_anthropic_models_present(self):
        """PROVIDER_MODELS['anthropic']['models'] contains the specified Anthropic models."""
        models = PROVIDER_MODELS["anthropic"]["models"]
        assert "claude-opus-4-6" in models
        assert "claude-sonnet-4-5-20250929" in models
        assert "claude-haiku-4-5-20251001" in models

    def test_openai_models_present(self):
        """PROVIDER_MODELS['openai']['models'] contains the specified OpenAI models."""
        models = PROVIDER_MODELS["openai"]["models"]
        assert "gpt-5.2" in models
        assert "gpt-5.2-pro" in models
        assert "gpt-4.1" in models
        assert "o4-mini" in models

    def test_gemini_models_present(self):
        """PROVIDER_MODELS['gemini']['models'] contains the specified Gemini models."""
        models = PROVIDER_MODELS["gemini"]["models"]
        assert "gemini-3-pro" in models
        assert "gemini-3-flash" in models
        assert "gemini-2.5-pro" in models
        assert "gemini-2.5-flash" in models

    def test_default_provider_is_anthropic(self):
        """DEFAULT_PROVIDER equals 'anthropic'."""
        assert DEFAULT_PROVIDER == "anthropic"

    def test_provider_config_structure(self):
        """Each provider config has the required keys: prefix, default, models."""
        for provider_name, config in PROVIDER_MODELS.items():
            assert "prefix" in config, f"{provider_name} missing 'prefix'"
            assert "default" in config, f"{provider_name} missing 'default'"
            assert "models" in config, f"{provider_name} missing 'models'"
            assert isinstance(config["models"], list), f"{provider_name} models not a list"

    def test_provider_prefixes(self):
        """Provider prefixes are correctly configured."""
        assert PROVIDER_MODELS["anthropic"]["prefix"] == "anthropic/"
        assert PROVIDER_MODELS["openai"]["prefix"] == ""
        assert PROVIDER_MODELS["gemini"]["prefix"] == "gemini/"


@pytest.mark.unit
class TestGetLlmResponse:
    """Test the get_llm_response function with mocked litellm.completion."""

    @patch("plane.app.views.external.base.litellm.completion")
    def test_anthropic_model_prefix(self, mock_completion):
        """Anthropic model name gets 'anthropic/' prefix passed to litellm.completion()."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Test response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="claude-opus-4-6",
            provider="anthropic",
        )

        assert text == "Test response"
        assert error is None
        assert reasoning is None
        # Verify the model was prefixed correctly
        call_kwargs = mock_completion.call_args[1]
        assert call_kwargs["model"] == "anthropic/claude-opus-4-6"

    @patch("plane.app.views.external.base.litellm.completion")
    def test_openai_model_no_prefix(self, mock_completion):
        """OpenAI model name passes through with no prefix."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "OpenAI response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
        )

        assert text == "OpenAI response"
        assert error is None
        # Verify the model has no prefix
        call_kwargs = mock_completion.call_args[1]
        assert call_kwargs["model"] == "gpt-4.1"

    @patch("plane.app.views.external.base.litellm.completion")
    def test_gemini_model_prefix(self, mock_completion):
        """Gemini model name gets 'gemini/' prefix."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Gemini response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gemini-2.5-flash",
            provider="gemini",
        )

        assert text == "Gemini response"
        assert error is None
        # Verify the model was prefixed correctly
        call_kwargs = mock_completion.call_args[1]
        assert call_kwargs["model"] == "gemini/gemini-2.5-flash"

    @patch("plane.app.views.external.base.litellm.completion")
    def test_base_url_passed_as_api_base(self, mock_completion):
        """When base_url is set, it is passed as api_base kwarg to litellm.completion()."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
            base_url="http://localhost:8000",
        )

        assert text == "Response"
        assert error is None
        # Verify api_base was passed
        call_kwargs = mock_completion.call_args[1]
        assert call_kwargs["api_base"] == "http://localhost:8000"

    @patch("plane.app.views.external.base.litellm.completion")
    def test_base_url_not_passed_when_empty(self, mock_completion):
        """When base_url is empty, it is not passed to litellm.completion()."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
            base_url="",
        )

        assert text == "Response"
        assert error is None
        # Verify api_base was NOT passed
        call_kwargs = mock_completion.call_args[1]
        assert "api_base" not in call_kwargs

    @patch("plane.app.views.external.base.litellm.completion")
    def test_reasoning_content_returned_when_present(self, mock_completion):
        """When mock response has reasoning_content attribute, third return value is populated."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Response with reasoning"
        mock_response.choices[0].message.reasoning_content = "This is my reasoning"
        mock_completion.return_value = mock_response

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="claude-opus-4-6",
            provider="anthropic",
        )

        assert text == "Response with reasoning"
        assert error is None
        assert reasoning == "This is my reasoning"

    @patch("plane.app.views.external.base.litellm.completion")
    def test_authentication_error_handling(self, mock_completion):
        """When litellm.completion raises AuthenticationError, returns clear error string."""
        from litellm import AuthenticationError

        mock_completion.side_effect = AuthenticationError(message="Invalid API key")

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="invalid-key",
            model="gpt-4.1",
            provider="openai",
        )

        assert text is None
        assert error == "Invalid API key for openai"
        assert reasoning is None

    @patch("plane.app.views.external.base.litellm.completion")
    def test_rate_limit_error_handling(self, mock_completion):
        """When litellm.completion raises RateLimitError, returns user-friendly error string."""
        from litellm import RateLimitError

        mock_completion.side_effect = RateLimitError(message="Rate limited")

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
        )

        assert text is None
        assert error == "Rate limit exceeded for openai"
        assert reasoning is None

    @patch("plane.app.views.external.base.litellm.completion")
    def test_api_error_handling(self, mock_completion):
        """When litellm.completion raises APIError, returns user-friendly error string."""
        from litellm import APIError

        error_msg = "API error occurred"
        mock_completion.side_effect = APIError(message=error_msg)

        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
        )

        assert text is None
        assert f"Error from openai: {error_msg}" in error
        assert reasoning is None

    def test_unsupported_provider_error(self):
        """Unsupported provider returns error identifying the invalid provider."""
        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="test-model",
            provider="invalid_provider",
        )

        assert text is None
        assert error == "Unsupported provider: invalid_provider"
        assert reasoning is None

    def test_unknown_model_error(self):
        """Model not in PROVIDER_MODELS[provider]['models'] returns error identifying invalid model."""
        text, error, reasoning = get_llm_response(
            task="Test task",
            prompt="Test prompt",
            api_key="test-key",
            model="unknown-model",
            provider="openai",
        )

        assert text is None
        assert "Unknown model 'unknown-model' for provider 'openai'" in error
        assert reasoning is None

    @patch("plane.app.views.external.base.litellm.completion")
    def test_messages_format(self, mock_completion):
        """get_llm_response passes correctly formatted messages to litellm.completion()."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        get_llm_response(
            task="Generate code",
            prompt="for a Python function",
            api_key="test-key",
            model="gpt-4.1",
            provider="openai",
        )

        # Verify messages were passed correctly
        call_kwargs = mock_completion.call_args[1]
        messages = call_kwargs["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert "Generate code" in messages[0]["content"]
        assert "for a Python function" in messages[0]["content"]

    @patch("plane.app.views.external.base.litellm.completion")
    def test_api_key_passed_to_litellm(self, mock_completion):
        """API key is passed to litellm.completion()."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "Response"
        mock_response.choices[0].message.reasoning_content = None
        mock_completion.return_value = mock_response

        get_llm_response(
            task="Test",
            prompt="Test",
            api_key="my-api-key",
            model="gpt-4.1",
            provider="openai",
        )

        # Verify api_key was passed
        call_kwargs = mock_completion.call_args[1]
        assert call_kwargs["api_key"] == "my-api-key"
