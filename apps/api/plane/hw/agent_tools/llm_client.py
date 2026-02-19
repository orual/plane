# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import time
from dataclasses import dataclass
from typing import Any, Dict, List

import litellm
from litellm import APIConnectionError, APIError, AuthenticationError, InternalServerError, RateLimitError
from plane.utils.llm_config import PROVIDER_MODELS


@dataclass
class LLMResponse:
    """LLM response dataclass for agent conversations."""

    content: str
    reasoning_content: str | None
    thinking_blocks: List[Dict] | None
    finish_reason: str
    usage: Dict[str, Any]


class AgentLLMClient:
    """Multi-turn LLM client for agent conversations with thinking blocks and caching."""

    def __init__(self, api_key: str, provider: str, model: str, base_url: str = ""):
        """Initialize LLM client with configuration.

        Args:
            api_key: API key for the LLM provider
            provider: Provider name (anthropic, openai, gemini)
            model: Model name
            base_url: Optional base URL for API calls
        """
        self.api_key = api_key
        self.provider = provider.lower()
        self.model = model
        self.base_url = base_url

        # Compute litellm model string using provider prefix
        provider_config = PROVIDER_MODELS.get(self.provider)
        if not provider_config:
            raise ValueError(f"Unsupported provider: {self.provider}")

        self.litellm_model = provider_config["prefix"] + model

    def _build_system_message(self, system_text: str) -> Dict[str, Any]:
        """Build system message with cache control for Anthropic.

        Args:
            system_text: System prompt text

        Returns:
            System message dict with content blocks
        """
        return {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"}
                }
            ]
        }

    def _build_history_message(
        self, role: str, content: str, thinking_blocks: List[Dict] | None = None
    ) -> Dict[str, Any]:
        """Build message dict with optional thinking blocks.

        Args:
            role: Message role ("user" or "assistant")
            content: Message content
            thinking_blocks: Optional thinking blocks for assistant messages

        Returns:
            Message dict
        """
        message = {"role": role, "content": content}

        # Include thinking blocks for assistant messages if present
        if role == "assistant" and thinking_blocks:
            message["thinking_blocks"] = thinking_blocks

        return message

    def call(
        self,
        system_prompt: str,
        messages: List[Dict[str, Any]],
        max_tokens: int = 4096,
        reasoning_effort: str = "medium",
        thinking_budget: int | None = None
    ) -> LLMResponse:
        """Call LLM with full message history and thinking support.

        Args:
            system_prompt: System prompt text
            messages: Full message history list
            max_tokens: Maximum tokens to generate
            reasoning_effort: Reasoning effort level
            thinking_budget: Optional thinking budget in tokens

        Returns:
            LLMResponse with all fields populated

        Raises:
            ValueError: If provider is unsupported
            Exception: On API errors after retries
        """
        # Build system message with cache control
        system_message = self._build_system_message(system_prompt)

        # Prepare call parameters
        kwargs = {
            "model": self.litellm_model,
            "messages": [system_message] + messages,
            "max_tokens": max_tokens,
            "timeout": 60,
        }

        # Add base URL if provided
        if self.base_url:
            kwargs["api_base"] = self.base_url

        # Provider-specific reasoning/thinking configuration.
        # An explicit thinking_budget always takes precedence.
        if thinking_budget is not None:
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": thinking_budget
            }
        elif self.provider == "openai":
            kwargs["reasoning_effort"] = reasoning_effort
        elif self.provider == "gemini":
            kwargs["reasoning_effort"] = reasoning_effort
        elif self.provider == "anthropic":
            budget_map = {"low": 1024, "medium": 4096, "high": 10240}
            tokens = budget_map.get(reasoning_effort, 4096)
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": tokens
            }

        # Retry with exponential backoff
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = litellm.completion(**kwargs, drop_params=True)

                # Extract response data
                choice = response.choices[0]
                content = choice.message.content or ""

                # Handle different response structures
                if hasattr(choice.message, 'reasoning_content'):
                    reasoning_content = choice.message.reasoning_content
                else:
                    reasoning_content = None

                thinking_blocks = getattr(choice.message, 'thinking_blocks', None)
                finish_reason = choice.finish_reason or "stop"

                # Extract usage information
                usage = {
                    "prompt_tokens": getattr(response, 'usage', {}).get('prompt_tokens', 0),
                    "completion_tokens": getattr(response, 'usage', {}).get('completion_tokens', 0),
                    "total_tokens": getattr(response, 'usage', {}).get('total_tokens', 0),
                    "cache_read_tokens": getattr(response, 'usage', {}).get('cache_read_tokens', 0),
                    "cache_creation_tokens": getattr(response, 'usage', {}).get('cache_creation_tokens', 0),
                }

                return LLMResponse(
                    content=content,
                    reasoning_content=reasoning_content,
                    thinking_blocks=thinking_blocks,
                    finish_reason=finish_reason,
                    usage=usage
                )

            except RateLimitError as e:
                if attempt == max_retries:
                    raise Exception(f"Rate limit exceeded after {max_retries} retries: {str(e)}")

                # Exponential backoff: 2^attempt seconds
                backoff_time = 2 ** attempt
                time.sleep(backoff_time)
                continue

            except (AuthenticationError, APIConnectionError, InternalServerError, APIError) as e:
                # These errors are not retryable
                raise Exception(f"LLM API error: {str(e)}")

            except Exception as e:
                # Other exceptions (including timeouts on non-retryable attempts)
                if attempt == max_retries:
                    raise Exception(f"Unexpected error after {max_retries} retries: {str(e)}")

                # Retry on unknown exceptions
                backoff_time = 2 ** attempt
                time.sleep(backoff_time)
                continue