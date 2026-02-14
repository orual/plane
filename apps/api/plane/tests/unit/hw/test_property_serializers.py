# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.hw.models import IssuePropertyDefinition
from plane.hw.serializers import (
    PropertyDefinitionSerializer,
    IssuePropertyValueSerializer,
)


@pytest.mark.unit
class TestPropertyDefinitionSerializer:
    """Test PropertyDefinitionSerializer validation."""

    @pytest.mark.django_db
    def test_valid_text_property(self):
        """Serializer accepts valid text property."""
        data = {
            "name": "Description",
            "property_type": "text",
            "is_required": False,
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_select_property(self):
        """Serializer accepts select property with options."""
        data = {
            "name": "Status",
            "property_type": "select",
            "options": ["Open", "Closed", "In Progress"],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_select_property_without_options_rejected(self):
        """Select property without options should be rejected."""
        data = {
            "name": "Status",
            "property_type": "select",
            "options": [],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_text_property_with_options_rejected(self):
        """Text property with options should be rejected."""
        data = {
            "name": "Notes",
            "property_type": "text",
            "options": ["A", "B"],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_valid_number_property(self):
        """Serializer accepts valid number property."""
        data = {
            "name": "Count",
            "property_type": "number",
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_boolean_property(self):
        """Serializer accepts valid boolean property."""
        data = {
            "name": "Active",
            "property_type": "boolean",
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_url_property(self):
        """Serializer accepts valid url property."""
        data = {
            "name": "Link",
            "property_type": "url",
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_date_property(self):
        """Serializer accepts valid date property."""
        data = {
            "name": "Due Date",
            "property_type": "date",
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_multi_select_property(self):
        """Serializer accepts multi_select property with options."""
        data = {
            "name": "Tags",
            "property_type": "multi_select",
            "options": ["Alpha", "Beta", "Gamma"],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_output_shape(self, workspace):
        """Serialized property definition contains all expected fields."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Priority",
            property_type="select",
            options=["High", "Low"],
        )
        serializer = PropertyDefinitionSerializer(prop_def)
        data = serializer.data

        assert "id" in data
        assert "name" in data
        assert "property_type" in data
        assert "options" in data
        assert "is_required" in data
        assert "sort_order" in data
        assert data["name"] == "Priority"


@pytest.mark.unit
class TestIssuePropertyValueSerializer:
    """Test IssuePropertyValueSerializer type validation."""

    @pytest.mark.django_db
    def test_text_value_valid(self, workspace):
        """Text value validation accepts strings."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Notes",
            property_type="text",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "sample text"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_text_value_invalid_type(self, workspace):
        """Text value rejects non-string values."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Notes",
            property_type="text",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": 123},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_number_value_valid(self, workspace):
        """Number value validation accepts integers and floats."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Count",
            property_type="number",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": 42},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_number_value_invalid_type(self, workspace):
        """Number value rejects non-numeric values."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Count",
            property_type="number",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "not a number"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_select_value_valid(self, workspace):
        """Select value validation accepts valid option."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Status",
            property_type="select",
            options=["Open", "Closed"],
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "Open"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_select_value_invalid_option(self, workspace):
        """Select value rejects invalid option."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Status",
            property_type="select",
            options=["Open", "Closed"],
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "Invalid"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_multi_select_value_valid(self, workspace):
        """Multi-select value validation accepts list of valid options."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Tags",
            property_type="multi_select",
            options=["Alpha", "Beta", "Gamma"],
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": ["Alpha", "Beta"]},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_multi_select_value_invalid_type(self, workspace):
        """Multi-select value rejects non-list values."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Tags",
            property_type="multi_select",
            options=["Alpha", "Beta"],
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "Alpha"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert not serializer.is_valid()

    @pytest.mark.django_db
    def test_boolean_value_valid(self, workspace):
        """Boolean value validation accepts true/false."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Active",
            property_type="boolean",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": True},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_boolean_value_invalid_type(self, workspace):
        """Boolean value rejects non-boolean values."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Active",
            property_type="boolean",
        )

        data = {
            "property_definition": prop_def.id,
            "value": {"value": "true"},
        }
        serializer = IssuePropertyValueSerializer(data=data)
        assert not serializer.is_valid()
