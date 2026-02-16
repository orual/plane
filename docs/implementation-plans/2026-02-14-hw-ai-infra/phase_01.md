# HW AI Infrastructure Implementation Plan — Phase 1

**Goal:** Replace the broken multi-provider LLM dispatch with LiteLLM.

**Architecture:** The current `get_llm_response()` routes all providers through OpenAI's client, which fails for Anthropic and Gemini. LiteLLM provides a unified `completion()` API that routes to each provider's native SDK via model name prefixes (`anthropic/`, `gemini/`, bare for OpenAI). We replace the `LLMProvider` class hierarchy with a single config dict and swap the dispatch function.

**Tech Stack:** Python, Django, LiteLLM 1.81.11, pytest

**Scope:** 8 phases from original design (phase 1 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC1: LLM backend dispatches correctly to each provider
- **hw-ai-infra.AC1.1 Success:** Anthropic models return valid completions via LiteLLM with `anthropic/` prefix routing
- **hw-ai-infra.AC1.2 Success:** OpenAI models return valid completions via LiteLLM with bare model names
- **hw-ai-infra.AC1.3 Success:** Gemini models return valid completions via LiteLLM with `gemini/` prefix routing
- **hw-ai-infra.AC1.4 Success:** Ollama endpoint works when `LLM_BASE_URL` is set, routing through OpenAI-compatible API
- **hw-ai-infra.AC1.5 Success:** Anthropic extended thinking models return `reasoning_content` in the response
- **hw-ai-infra.AC1.6 Failure:** Invalid API key returns a clear error message, not a raw stack trace
- **hw-ai-infra.AC1.7 Failure:** Unreachable provider returns a user-friendly error after retries
- **hw-ai-infra.AC1.8 Edge:** Unknown model name returns an error identifying the invalid model

### hw-ai-infra.AC2: Model lists are current
- **hw-ai-infra.AC2.1 Success:** Anthropic model list includes claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001
- **hw-ai-infra.AC2.2 Success:** OpenAI model list includes gpt-5.2, gpt-5.2-pro, gpt-4.1, o4-mini
- **hw-ai-infra.AC2.3 Success:** Gemini model list includes gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash
- **hw-ai-infra.AC2.4 Success:** Anthropic is the default/primary provider

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Add LiteLLM dependency

**Files:**
- Modify: `apps/api/requirements/base.txt`

**Step 1: Add litellm to requirements**

Add `litellm==1.81.11` to `apps/api/requirements/base.txt`. Keep the existing `openai` dependency as LiteLLM depends on it.

**Step 2: Verify installation**

Run: `cd apps/api && pip install -r requirements/base.txt`
Expected: Installs without errors

**Step 3: Commit**

```bash
git add apps/api/requirements/base.txt
git commit -m "chore: add litellm dependency for multi-provider LLM dispatch"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add LLM_BASE_URL config variable

**Files:**
- Modify: `apps/api/plane/utils/instance_config_variables/core.py:198-224`

**Step 1: Add LLM_BASE_URL to the config variables**

After the existing `LLM_MODEL` variable definition (around line 215), add a new entry following the exact pattern of the existing `LLM_PROVIDER` and `LLM_MODEL` entries:

```python
{
    "key": "LLM_BASE_URL",
    "value": os.environ.get("LLM_BASE_URL", ""),
    "category": "AI",
    "is_encrypted": False,
},
```

Note: This is the instance config variable *definition* — it uses `"value"` (not `"default"`) and `"category": "AI"` to match the existing `LLM_API_KEY`, `LLM_PROVIDER`, and `LLM_MODEL` entries in the same list.

**Step 2: Verify operationally**

Run: `cd apps/api && python -c "from plane.utils.instance_config_variables.core import *; print('OK')"`
Expected: Imports without errors

**Step 3: Commit**

```bash
git add apps/api/plane/utils/instance_config_variables/core.py
git commit -m "feat: add LLM_BASE_URL config variable for Ollama/self-hosted endpoints"
```
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-4) -->

<!-- START_TASK_3 -->
### Task 3: Replace LLMProvider classes and get_llm_response() with LiteLLM

**Verifies:** hw-ai-infra.AC1.1, hw-ai-infra.AC1.2, hw-ai-infra.AC1.3, hw-ai-infra.AC1.4, hw-ai-infra.AC1.5, hw-ai-infra.AC1.6, hw-ai-infra.AC1.7, hw-ai-infra.AC1.8, hw-ai-infra.AC2.1, hw-ai-infra.AC2.2, hw-ai-infra.AC2.3, hw-ai-infra.AC2.4

**Files:**
- Modify: `apps/api/plane/app/views/external/base.py:26-145`
- Test: `apps/api/plane/tests/unit/hw/test_llm_backend.py` (unit)

**Implementation:**

Replace the `LLMProvider` base class (line 26), its three subclasses (`OpenAIProvider` lines 42-45, `AnthropicProvider` lines 48-60, `GeminiProvider` lines 63-66), the `SUPPORTED_PROVIDERS` dict (lines 69-73), and `get_llm_response()` (lines 123-145) with the following. Preserve the existing `from typing import List, Dict, Tuple` import at line 7:

1. A single `PROVIDER_MODELS` dict mapping provider names to their model lists and LiteLLM prefixes:

```python
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
```

2. Updated `get_llm_config()` that reads `LLM_BASE_URL` from instance config in addition to existing vars, validates the model against `PROVIDER_MODELS` instead of `SUPPORTED_PROVIDERS`, and returns a 4-tuple `(api_key, model, provider, base_url)`:

```python
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
```

Note: The `get_configuration_value()` runtime read uses `"default"` as the fallback key (distinct from the instance config *definition* dict in `core.py` which uses `"value"`). This is the existing pattern — see `apps/api/plane/license/utils/instance_value.py`.

3. New `get_llm_response()` using LiteLLM:

```python
import litellm
from litellm import AuthenticationError, RateLimitError, APIError

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
```

**Testing:**

Tests must verify each AC listed above. Mock `litellm.completion` — do not make real API calls.

- hw-ai-infra.AC1.1: Anthropic model name gets `anthropic/` prefix passed to `litellm.completion()`
- hw-ai-infra.AC1.2: OpenAI model name passes through with no prefix
- hw-ai-infra.AC1.3: Gemini model name gets `gemini/` prefix
- hw-ai-infra.AC1.4: When `base_url` is set, it's passed as `api_base` kwarg to `litellm.completion()`
- hw-ai-infra.AC1.5: When mock response has `reasoning_content` attribute, the third return value is populated
- hw-ai-infra.AC1.6: When `litellm.completion` raises `AuthenticationError`, returns clear error string (not traceback)
- hw-ai-infra.AC1.7: When `litellm.completion` raises `APIError`, returns user-friendly error string
- hw-ai-infra.AC1.8: Model not in `PROVIDER_MODELS[provider]["models"]` returns error identifying the invalid model
- hw-ai-infra.AC2.1: `PROVIDER_MODELS["anthropic"]["models"]` contains the three specified Anthropic models
- hw-ai-infra.AC2.2: `PROVIDER_MODELS["openai"]["models"]` contains the four specified OpenAI models
- hw-ai-infra.AC2.3: `PROVIDER_MODELS["gemini"]["models"]` contains the four specified Gemini models
- hw-ai-infra.AC2.4: `DEFAULT_PROVIDER` equals `"anthropic"`

Follow existing project test patterns:
- `@pytest.mark.unit` and `@pytest.mark.django_db` markers
- Class-based test organization: `class TestProviderModels`, `class TestGetLlmResponse`
- Use `unittest.mock.patch` to mock `litellm.completion`
- Test file location: `apps/api/plane/tests/unit/hw/test_llm_backend.py`

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `feat: replace LLM backend with LiteLLM for multi-provider dispatch`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Update endpoint views to use new get_llm_response signature

**Verifies:** hw-ai-infra.AC1.5

**Files:**
- Modify: `apps/api/plane/app/views/external/base.py:148-212` (GPTIntegrationEndpoint and WorkspaceGPTIntegrationEndpoint)
- Test: `apps/api/plane/tests/contract/hw/test_llm_endpoint.py` (contract)

**Implementation:**

Both `GPTIntegrationEndpoint.post()` and `WorkspaceGPTIntegrationEndpoint.post()` currently call `get_llm_config()` expecting 3 return values and `get_llm_response()` expecting 2 return values.

Update both to:

1. Unpack 4 values from `get_llm_config()`: `api_key, model, provider, base_url`
2. Pass `base_url` to `get_llm_response()`
3. Unpack 3 values from `get_llm_response()`: `text, error, reasoning_content`
4. Include `reasoning_content` in the JSON response when it's not `None`:

```python
response_data = {"response": text}
if reasoning_content:
    response_data["reasoning_content"] = reasoning_content
return Response(response_data, status=status.HTTP_200_OK)
```

**Testing:**

Contract tests for the endpoint behaviour:
- hw-ai-infra.AC1.5: POST to the endpoint returns JSON with `reasoning_content` field when the LLM provides it, and omits it when not present

Follow existing project contract test patterns:
- `@pytest.mark.contract` and `@pytest.mark.django_db` markers
- Use `session_client` fixture for authenticated requests
- Mock `litellm.completion` at the module level in `plane.app.views.external.base`
- Test file location: `apps/api/plane/tests/contract/hw/test_llm_endpoint.py`

**Verification:**

Run: `cd apps/api && python run_tests.py -u -c`
Expected: All tests pass

**Commit:** `feat: pass reasoning content through LLM endpoint response`

<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_B -->
