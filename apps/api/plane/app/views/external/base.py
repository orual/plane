# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python import
import os
from typing import Tuple

# Third party import
import litellm
from litellm import APIConnectionError, APIError, AuthenticationError, InternalServerError, RateLimitError
import requests

from rest_framework import status
from rest_framework.response import Response

# Module import
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectLiteSerializer, WorkspaceLiteSerializer
from plane.db.models import Project, Workspace
from plane.license.utils.instance_value import get_configuration_value
from plane.utils.exception_logger import log_exception

from plane.utils.llm_config import get_llm_config, PROVIDER_MODELS
from ..base import BaseAPIView


DEFAULT_PROVIDER = "anthropic"


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
    except APIConnectionError:
        return None, f"Could not connect to {provider}. Check the base URL and network.", None
    except InternalServerError as e:
        return None, f"Error from {provider}: {e.message}", None
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
                {"error": error},
                status=status.HTTP_502_BAD_GATEWAY,
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
                {"error": error},
                status=status.HTTP_502_BAD_GATEWAY,
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
                {"error": error},
                status=status.HTTP_502_BAD_GATEWAY,
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
