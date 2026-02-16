# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from plane.app.views.external.base import get_llm_config
from plane.license.models import InstanceConfiguration


@pytest.mark.contract
@pytest.mark.django_db
class TestLLMAdminSettingsPersistence:
    """Test that admin-configured LLM settings persist and are used by get_llm_config()."""

    def test_llm_config_reads_from_database_when_configured(self, workspace):
        """Verify that get_llm_config() returns values stored in InstanceConfiguration."""
        # Create InstanceConfiguration entries for LLM settings
        InstanceConfiguration.objects.create(
            key="LLM_PROVIDER",
            value="anthropic",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_MODEL",
            value="claude-opus-4-6",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_API_KEY",
            value="sk-test-key-12345",
            category="AI",
            is_encrypted=True,
        )
        InstanceConfiguration.objects.create(
            key="LLM_BASE_URL",
            value="",
            category="AI",
            is_encrypted=False,
        )

        # Call get_llm_config and verify it returns stored values
        api_key, model, provider, base_url = get_llm_config()

        assert provider == "anthropic"
        assert model == "claude-opus-4-6"
        assert api_key == "sk-test-key-12345"
        assert base_url == ""

    def test_llm_config_uses_updated_values(self, workspace):
        """Verify that get_llm_config() returns updated values after InstanceConfiguration changes."""
        # Create initial InstanceConfiguration entries
        provider_config = InstanceConfiguration.objects.create(
            key="LLM_PROVIDER",
            value="openai",
            category="AI",
            is_encrypted=False,
        )
        model_config = InstanceConfiguration.objects.create(
            key="LLM_MODEL",
            value="gpt-4.1",
            category="AI",
            is_encrypted=False,
        )
        api_key_config = InstanceConfiguration.objects.create(
            key="LLM_API_KEY",
            value="sk-openai-key",
            category="AI",
            is_encrypted=True,
        )
        base_url_config = InstanceConfiguration.objects.create(
            key="LLM_BASE_URL",
            value="",
            category="AI",
            is_encrypted=False,
        )

        # Verify initial values
        api_key, model, provider, base_url = get_llm_config()
        assert provider == "openai"
        assert model == "gpt-4.1"
        assert api_key == "sk-openai-key"

        # Update the configurations
        provider_config.value = "gemini"
        provider_config.save()
        model_config.value = "gemini-2.5-pro"
        model_config.save()
        api_key_config.value = "gemini-api-key-xyz"
        api_key_config.save()
        base_url_config.value = "https://generativelanguage.googleapis.com"
        base_url_config.save()

        # Verify updated values are returned
        api_key, model, provider, base_url = get_llm_config()
        assert provider == "gemini"
        assert model == "gemini-2.5-pro"
        assert api_key == "gemini-api-key-xyz"
        assert base_url == "https://generativelanguage.googleapis.com"

    def test_llm_config_with_custom_base_url(self, workspace):
        """Verify that custom base URLs (e.g., for self-hosted) are properly stored and retrieved."""
        # Create configurations with custom base URL for self-hosted OpenAI-compatible service
        InstanceConfiguration.objects.create(
            key="LLM_PROVIDER",
            value="openai",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_MODEL",
            value="gpt-4.1",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_API_KEY",
            value="sk-self-hosted-key",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_BASE_URL",
            value="http://localhost:8000",
            category="AI",
            is_encrypted=False,
        )

        # Call get_llm_config and verify custom base URL is returned
        api_key, model, provider, base_url = get_llm_config()

        assert provider == "openai"
        assert model == "gpt-4.1"
        assert base_url == "http://localhost:8000"

    def test_llm_config_with_empty_optional_fields(self, workspace):
        """Verify that optional fields (base_url) can be empty strings."""
        # Create configurations with minimal required fields
        InstanceConfiguration.objects.create(
            key="LLM_PROVIDER",
            value="anthropic",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_MODEL",
            value="claude-sonnet-4-5-20250929",
            category="AI",
            is_encrypted=False,
        )
        InstanceConfiguration.objects.create(
            key="LLM_API_KEY",
            value="sk-ant-key",
            category="AI",
            is_encrypted=True,
        )
        # Base URL intentionally not set - should use empty default
        InstanceConfiguration.objects.create(
            key="LLM_BASE_URL",
            value="",
            category="AI",
            is_encrypted=False,
        )

        # Call get_llm_config and verify it handles empty base_url
        api_key, model, provider, base_url = get_llm_config()

        assert provider == "anthropic"
        assert model == "claude-sonnet-4-5-20250929"
        assert base_url == ""
