# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
from typing import Tuple

from plane.license.utils.instance_value import get_configuration_value
from plane.utils.exception_logger import log_exception


PROVIDER_MODELS = {
    "anthropic": {
        "prefix": "anthropic/",
        "default": "claude-sonnet-4-5-20250929",
        "models": [
            "claude-opus-4-6",
            "claude-sonnet-4-5-20250929",
            "claude-haiku-4-5-20251001",
        ],
    },
    "openai": {
        "prefix": "openai/",
        "default": "gpt-4.1",
        "models": [
            "gpt-5.2",
            "gpt-5.2-pro",
            "gpt-4.1",
            "o4-mini",
        ],
    },
    "gemini": {
        "prefix": "gemini/",
        "default": "gemini-2.5-flash",
        "models": [
            "gemini-3-pro",
            "gemini-3-flash",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
        ],
    },
}

DEFAULT_PROVIDER = "anthropic"


def get_llm_config() -> Tuple[str | None, str | None, str | None, str | None]:
    """Helper to get LLM configuration values.

    Returns (api_key, model, provider, base_url).
    """
    api_key, provider_key, model, base_url = get_configuration_value(
        [
            {
                "key": "LLM_API_KEY",
                "default": os.environ.get("LLM_API_KEY", None),
            },
            {
                "key": "LLM_PROVIDER",
                "default": os.environ.get("LLM_PROVIDER", "openai"),
            },
            {
                "key": "LLM_MODEL",
                "default": os.environ.get("LLM_MODEL", None),
            },
            {
                "key": "LLM_BASE_URL",
                "default": os.environ.get("LLM_BASE_URL", ""),
            },
        ]
    )

    if not provider_key:
        log_exception(ValueError("No LLM provider configured"))
        return None, None, None, None

    provider_config = PROVIDER_MODELS.get(provider_key.lower())
    if not provider_config:
        log_exception(ValueError(f"Unsupported provider: {provider_key}"))
        return None, None, None, None

    if not api_key:
        log_exception(ValueError(f"Missing API key for provider: {provider_key}"))
        return None, None, None, None

    if not model:
        model = provider_config["default"]

    return api_key, model, provider_key, base_url or ""