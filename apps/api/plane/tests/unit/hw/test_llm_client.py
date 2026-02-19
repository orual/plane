# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Unit tests for AgentLLMClient.

Tests:
- AC3.4: Multi-turn context preservation with thinking blocks
- System message caching with cache_control
- LLMResponse structure
- Retry logic on transient errors
"""

from unittest.mock import MagicMock, patch

import pytest

from plane.hw.agent_tools.llm_client import AgentLLMClient, LLMResponse


@pytest.mark.unit
class TestLLMClientBasicInitialization:
    """Test basic initialization and configuration."""

    def test_client_initialization_with_valid_provider(self):
        """AgentLLMClient initializes with valid provider."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        assert client.api_key == "test-key"
        assert client.provider == "anthropic"
        assert client.model == "claude-3-5-sonnet-20241022"
        assert client.litellm_model.startswith("anthropic/")

    def test_client_initialization_with_base_url(self):
        """AgentLLMClient initializes with custom base URL."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
            base_url="https://custom.anthropic.com",
        )

        assert client.base_url == "https://custom.anthropic.com"

    def test_client_initialization_with_unsupported_provider(self):
        """AgentLLMClient raises error for unsupported provider."""
        with pytest.raises(ValueError, match="Unsupported provider"):
            AgentLLMClient(
                api_key="test-key",
                provider="unsupported_provider",
                model="some-model",
            )

    def test_provider_normalization(self):
        """Provider name is normalized to lowercase."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="ANTHROPIC",
            model="claude-3-5-sonnet-20241022",
        )

        assert client.provider == "anthropic"


@pytest.mark.unit
class TestSystemMessageBuilding:
    """Test system message construction with cache control."""

    def test_build_system_message_with_cache_control(self):
        """_build_system_message returns content blocks with cache_control."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        system_text = "You are a helpful assistant."
        message = client._build_system_message(system_text)

        # Verify structure
        assert message["role"] == "system"
        assert isinstance(message["content"], list)
        assert len(message["content"]) == 1

        # Verify content block
        content_block = message["content"][0]
        assert content_block["type"] == "text"
        assert content_block["text"] == system_text
        assert "cache_control" in content_block
        assert content_block["cache_control"]["type"] == "ephemeral"

    def test_build_system_message_with_multiline_text(self):
        """_build_system_message handles multiline system prompts."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        system_text = """You are a helpful assistant.
You have access to the following tools:
- tool_a
- tool_b"""

        message = client._build_system_message(system_text)

        assert message["content"][0]["text"] == system_text


@pytest.mark.unit
class TestHistoryMessageBuilding:
    """Test message history building with thinking blocks (AC3.4)."""

    def test_build_user_message(self):
        """_build_history_message builds user messages."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        message = client._build_history_message("user", "What is Plane?")

        assert message["role"] == "user"
        assert message["content"] == "What is Plane?"
        assert "thinking_blocks" not in message

    def test_build_assistant_message_without_thinking_blocks(self):
        """_build_history_message builds assistant messages without thinking."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        message = client._build_history_message("assistant", "Plane is a project management tool.")

        assert message["role"] == "assistant"
        assert message["content"] == "Plane is a project management tool."
        assert "thinking_blocks" not in message

    def test_build_assistant_message_with_thinking_blocks(self):
        """AC3.4: _build_history_message includes thinking_blocks for assistant messages."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        thinking_blocks = [
            {"type": "thinking", "content": "Let me think about this..."},
            {"type": "thinking", "content": "I need to analyze the problem..."},
        ]

        message = client._build_history_message(
            "assistant",
            "Based on my analysis...",
            thinking_blocks=thinking_blocks,
        )

        assert message["role"] == "assistant"
        assert message["content"] == "Based on my analysis..."
        assert message["thinking_blocks"] == thinking_blocks

    def test_thinking_blocks_not_included_for_user_messages(self):
        """Thinking blocks are not included for user messages."""
        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        thinking_blocks = [{"type": "thinking", "content": "..."}]
        message = client._build_history_message(
            "user",
            "Hello",
            thinking_blocks=thinking_blocks,
        )

        # Thinking blocks should not be included for user messages
        assert "thinking_blocks" not in message


@pytest.mark.unit
class TestLLMClientCall:
    """Test LLM API calls and response handling."""

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_call_returns_llm_response(self, mock_completion):
        """call() returns LLMResponse with all fields."""
        # Mock response
        mock_choice = MagicMock()
        mock_choice.message.content = "This is the response."
        mock_choice.message.reasoning_content = "I analyzed the problem..."
        mock_choice.message.thinking_blocks = [{"type": "thinking", "content": "..."}]
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
            'cache_read_tokens': 10,
            'cache_creation_tokens': 5,
        }

        mock_completion.return_value = mock_response

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        response = client.call(
            system_prompt="You are helpful.",
            messages=[{"role": "user", "content": "Hello"}],
        )

        assert isinstance(response, LLMResponse)
        assert response.content == "This is the response."
        assert response.reasoning_content == "I analyzed the problem..."
        assert response.thinking_blocks == [{"type": "thinking", "content": "..."}]
        assert response.finish_reason == "stop"
        assert response.usage["prompt_tokens"] == 100
        assert response.usage["completion_tokens"] == 50

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_call_with_thinking_budget(self, mock_completion):
        """call() includes thinking configuration when budget is set."""
        mock_choice = MagicMock()
        mock_choice.message.content = "Response"
        mock_choice.message.reasoning_content = None
        mock_choice.message.thinking_blocks = None
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }

        mock_completion.return_value = mock_response

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        response = client.call(
            system_prompt="You are helpful.",
            messages=[{"role": "user", "content": "Hello"}],
            thinking_budget=5000,
        )

        # Verify call was made with thinking parameter
        call_kwargs = mock_completion.call_args.kwargs
        assert "thinking" in call_kwargs
        assert call_kwargs["thinking"]["type"] == "enabled"
        assert call_kwargs["thinking"]["budget_tokens"] == 5000

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_call_with_base_url(self, mock_completion):
        """call() passes base_url to litellm."""
        mock_choice = MagicMock()
        mock_choice.message.content = "Response"
        mock_choice.message.reasoning_content = None
        mock_choice.message.thinking_blocks = None
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }

        mock_completion.return_value = mock_response

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
            base_url="https://custom.anthropic.com",
        )

        response = client.call(
            system_prompt="You are helpful.",
            messages=[{"role": "user", "content": "Hello"}],
        )

        # Verify api_base was passed
        call_kwargs = mock_completion.call_args.kwargs
        assert call_kwargs["api_base"] == "https://custom.anthropic.com"


@pytest.mark.unit
class TestRetryLogic:
    """Test retry logic for transient errors."""

    @patch("plane.hw.agent_tools.llm_client.time.sleep")
    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_retry_on_rate_limit_error(self, mock_completion, mock_sleep):
        """call() retries on RateLimitError."""
        from litellm import RateLimitError

        # First call fails with RateLimitError, second succeeds
        mock_choice = MagicMock()
        mock_choice.message.content = "Success after retry"
        mock_choice.message.reasoning_content = None
        mock_choice.message.thinking_blocks = None
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }

        mock_completion.side_effect = [
            RateLimitError("Rate limited", "anthropic", "claude-3-5-sonnet"),
            mock_response,
        ]

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        response = client.call(
            system_prompt="You are helpful.",
            messages=[{"role": "user", "content": "Hello"}],
        )

        assert response.content == "Success after retry"
        assert mock_completion.call_count == 2
        # Verify sleep was called with exponential backoff
        mock_sleep.assert_called_once_with(1)  # 2^0 = 1

    @patch("plane.hw.agent_tools.llm_client.time.sleep")
    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_retry_with_exponential_backoff(self, mock_completion, mock_sleep):
        """Retry uses exponential backoff (2^attempt seconds)."""
        from litellm import RateLimitError

        mock_choice = MagicMock()
        mock_choice.message.content = "Success after retries"
        mock_choice.message.reasoning_content = None
        mock_choice.message.thinking_blocks = None
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }

        mock_completion.side_effect = [
            RateLimitError("Rate limited", "anthropic", "claude-3-5-sonnet"),
            RateLimitError("Rate limited again", "anthropic", "claude-3-5-sonnet"),
            mock_response,
        ]

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        response = client.call(
            system_prompt="You are helpful.",
            messages=[{"role": "user", "content": "Hello"}],
        )

        assert response.content == "Success after retries"
        assert mock_completion.call_count == 3
        # Verify sleep calls with exponential backoff: 2^0=1, 2^1=2
        sleep_calls = mock_sleep.call_args_list
        assert len(sleep_calls) == 2
        assert sleep_calls[0][0][0] == 1  # 2^0
        assert sleep_calls[1][0][0] == 2  # 2^1

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_max_retries_exceeded_raises_error(self, mock_completion):
        """Exceeding max retries raises an exception."""
        from litellm import RateLimitError

        mock_completion.side_effect = RateLimitError("Rate limited", "anthropic", "claude-3-5-sonnet")

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        with pytest.raises(Exception, match="Rate limit exceeded after"):
            client.call(
                system_prompt="You are helpful.",
                messages=[{"role": "user", "content": "Hello"}],
            )

        # Verify it tried 4 times (0-3 attempts)
        assert mock_completion.call_count == 4

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_authentication_error_not_retried(self, mock_completion):
        """AuthenticationError is not retried."""
        from litellm import AuthenticationError

        mock_completion.side_effect = AuthenticationError("Invalid API key", "anthropic", "claude-3-5-sonnet")

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        with pytest.raises(Exception, match="LLM API error"):
            client.call(
                system_prompt="You are helpful.",
                messages=[{"role": "user", "content": "Hello"}],
            )

        # Verify it only tried once (no retries)
        assert mock_completion.call_count == 1


@pytest.mark.unit
class TestLLMResponseDataclass:
    """Test LLMResponse dataclass."""

    def test_llm_response_creation(self):
        """LLMResponse can be created with all fields."""
        response = LLMResponse(
            content="Test content",
            reasoning_content="Test reasoning",
            thinking_blocks=[{"type": "thinking"}],
            finish_reason="stop",
            usage={
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
                "cache_read_tokens": 0,
                "cache_creation_tokens": 0,
            },
        )

        assert response.content == "Test content"
        assert response.reasoning_content == "Test reasoning"
        assert response.thinking_blocks == [{"type": "thinking"}]
        assert response.finish_reason == "stop"
        assert response.usage["prompt_tokens"] == 100

    def test_llm_response_with_none_thinking(self):
        """LLMResponse handles None thinking_blocks."""
        response = LLMResponse(
            content="Test",
            reasoning_content=None,
            thinking_blocks=None,
            finish_reason="stop",
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        )

        assert response.thinking_blocks is None


@pytest.mark.unit
class TestMultiTurnContext:
    """Test multi-turn context preservation (AC3.4)."""

    @patch("plane.hw.agent_tools.llm_client.litellm.completion")
    def test_full_message_history_passed_to_api(self, mock_completion):
        """call() passes full message history to LiteLLM."""
        mock_choice = MagicMock()
        mock_choice.message.content = "Response"
        mock_choice.message.reasoning_content = None
        mock_choice.message.thinking_blocks = None
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }

        mock_completion.return_value = mock_response

        client = AgentLLMClient(
            api_key="test-key",
            provider="anthropic",
            model="claude-3-5-sonnet-20241022",
        )

        # Build multi-turn message history
        messages = [
            {"role": "user", "content": "What is Plane?"},
            {
                "role": "assistant",
                "content": "Plane is a project management tool.",
                "thinking_blocks": [{"type": "thinking", "content": "User asked about Plane..."}],
            },
            {"role": "user", "content": "How do I create an issue?"},
        ]

        response = client.call(
            system_prompt="You are helpful.",
            messages=messages,
        )

        # Verify full history was passed (system message + user/assistant messages)
        call_kwargs = mock_completion.call_args.kwargs
        passed_messages = call_kwargs["messages"]

        # Should have system message + 3 user/assistant messages
        assert len(passed_messages) == 4
        assert passed_messages[0]["role"] == "system"
        assert passed_messages[1]["role"] == "user"
        assert passed_messages[2]["role"] == "assistant"
        assert passed_messages[3]["role"] == "user"

        # Verify thinking blocks are preserved
        assert passed_messages[2].get("thinking_blocks") is not None
