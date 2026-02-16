# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python import
import os
from typing import Tuple

# Third party import
import litellm
from litellm import AuthenticationError, RateLimitError, APIError
import requests

from rest_framework import status
from rest_framework.response import Response

# Module import
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectLiteSerializer, WorkspaceLiteSerializer
from plane.db.models import Project, Workspace
from plane.license.utils.instance_value import get_configuration_value
from plane.utils.exception_logger import log_exception

from ..base import BaseAPIView


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
        "prefix": "",
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

    if model not in provider_config["models"]:
        log_exception(
            ValueError(
                f"Model {model} not supported by {provider_key}. "
                f"Supported models: {', '.join(provider_config['models'])}"
            )
        )
        return None, None, None, None

    return api_key, model, provider_key, base_url or ""


def get_llm_response(
    task: str,
    prompt: str,
    api_key: str,
    model: str,
    provider: str,
    base_url: str = "",
) -> Tuple[str | None, str | None, str | None]:
    """Get LLM completion response via LiteLLM.

    Returns (text, error, reasoning_content) tuple.
    """
    final_text = task + "\n" + prompt
    provider_config = PROVIDER_MODELS.get(provider.lower())
    if not provider_config:
        return None, f"Unsupported provider: {provider}", None

    if model not in provider_config["models"]:
        return None, f"Unknown model '{model}' for provider '{provider}'", None

    litellm_model = provider_config["prefix"] + model

    kwargs = {
        "model": litellm_model,
        "messages": [{"role": "user", "content": final_text}],
        "api_key": api_key,
    }

    if base_url:
        kwargs["api_base"] = base_url

    try:
        response = litellm.completion(**kwargs)
        text = response.choices[0].message.content
        reasoning = getattr(response.choices[0].message, "reasoning_content", None)
        return text, None, reasoning
    except AuthenticationError:
        return None, f"Invalid API key for {provider}", None
    except RateLimitError:
        return None, f"Rate limit exceeded for {provider}", None
    except APIError as e:
        return None, f"Error from {provider}: {e.message}", None
    except Exception as e:
        log_exception(e)
        return None, f"Error occurred while generating response from {provider}", None


class GPTIntegrationEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        api_key, model, provider, base_url = get_llm_config()

        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error, reasoning_content = get_llm_response(
            task, request.data.get("prompt", ""), api_key, model, provider, base_url
        )
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        workspace = Workspace.objects.get(slug=slug)
        project = Project.objects.get(pk=project_id)

        response_data = {
            "response": text,
            "response_html": text.replace("\n", "<br/>"),
            "project_detail": ProjectLiteSerializer(project).data,
            "workspace_detail": WorkspaceLiteSerializer(workspace).data,
        }
        if reasoning_content:
            response_data["reasoning_content"] = reasoning_content

        return Response(response_data, status=status.HTTP_200_OK)


class WorkspaceGPTIntegrationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        api_key, model, provider, base_url = get_llm_config()

        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error, reasoning_content = get_llm_response(
            task, request.data.get("prompt", ""), api_key, model, provider, base_url
        )
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response_data = {
            "response": text,
            "response_html": text.replace("\n", "<br/>"),
        }
        if reasoning_content:
            response_data["reasoning_content"] = reasoning_content

        return Response(response_data, status=status.HTTP_200_OK)


class GrammarCorrectionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        api_key, model, provider, base_url = get_llm_config()

        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        text_input = request.data.get("text_input", "").strip()
        if not text_input:
            return Response(
                {"error": "Text input is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = "Correct the grammar and improve the clarity of the following text. "
        task += "Return only the corrected text, no explanations."

        text, error, reasoning_content = get_llm_response(
            task, text_input, api_key, model, provider, base_url
        )
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response_data = {
            "response": text,
        }

        return Response(response_data, status=status.HTTP_200_OK)


class UnsplashEndpoint(BaseAPIView):
    def get(self, request):
        (UNSPLASH_ACCESS_KEY,) = get_configuration_value(
            [
                {
                    "key": "UNSPLASH_ACCESS_KEY",
                    "default": os.environ.get("UNSPLASH_ACCESS_KEY"),
                }
            ]
        )
        # Check unsplash access key
        if not UNSPLASH_ACCESS_KEY:
            return Response([], status=status.HTTP_200_OK)

        # Query parameters
        query = request.GET.get("query", False)
        page = request.GET.get("page", 1)
        per_page = request.GET.get("per_page", 20)

        url = (
            f"https://api.unsplash.com/search/photos/?client_id={UNSPLASH_ACCESS_KEY}&query={query}&page=${page}&per_page={per_page}"
            if query
            else f"https://api.unsplash.com/photos/?client_id={UNSPLASH_ACCESS_KEY}&page={page}&per_page={per_page}"
        )

        headers = {"Content-Type": "application/json"}

        resp = requests.get(url=url, headers=headers)
        return Response(resp.json(), status=resp.status_code)
