# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers
from plane.app.serializers import BaseSerializer
from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue


class PropertyDefinitionSerializer(BaseSerializer):
    """Serializer for property definitions with type-aware validation."""

    class Meta:
        model = IssuePropertyDefinition
        fields = [
            "id",
            "workspace_id",
            "issue_type_id",
            "name",
            "property_type",
            "options",
            "is_required",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "created_at", "updated_at"]

    def validate(self, data):
        """Validate property type constraints."""
        property_type = data.get("property_type")
        options = data.get("options", [])

        # For select/multi_select types, options must be a non-empty list
        if property_type in ["select", "multi_select"]:
            if not options or not isinstance(options, list):
                raise serializers.ValidationError(f"Property type '{property_type}' requires a non-empty options list.")
        elif property_type and property_type not in ["text", "number", "url", "date", "boolean"]:
            raise serializers.ValidationError(f"Invalid property type: {property_type}")

        # For non-select types, options should be empty
        if property_type and property_type not in ["select", "multi_select"] and options:
            raise serializers.ValidationError(f"Property type '{property_type}' does not support options.")

        return data


class IssuePropertyValueSerializer(BaseSerializer):
    """Serializer for property values with type validation."""

    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue_id",
            "property_definition_id",
            "value",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "created_at", "updated_at"]

    def validate(self, data):
        """Validate value against property definition type."""
        property_definition = data.get("property_definition")
        value = data.get("value", {})

        if not property_definition:
            raise serializers.ValidationError("property_definition is required.")

        property_type = property_definition.property_type
        actual_value = value.get("value")

        # Type-specific validation
        if property_type == "text":
            if actual_value is not None and not isinstance(actual_value, str):
                raise serializers.ValidationError("Text property value must be a string.")
        elif property_type == "number":
            if actual_value is not None and not isinstance(actual_value, (int, float)):
                raise serializers.ValidationError("Number property value must be numeric.")
        elif property_type == "url":
            if actual_value is not None and not isinstance(actual_value, str):
                raise serializers.ValidationError("URL property value must be a string.")
        elif property_type == "date":
            if actual_value is not None and not isinstance(actual_value, str):
                raise serializers.ValidationError("Date property value must be an ISO 8601 date string.")
        elif property_type == "boolean":
            if actual_value is not None and not isinstance(actual_value, bool):
                raise serializers.ValidationError("Boolean property value must be true or false.")
        elif property_type == "select":
            if actual_value is not None:
                if not isinstance(actual_value, str):
                    raise serializers.ValidationError("Select property value must be a string.")
                if actual_value not in property_definition.options:
                    raise serializers.ValidationError(f"'{actual_value}' is not a valid option for this property.")
        elif property_type == "multi_select":
            if actual_value is not None:
                if not isinstance(actual_value, list):
                    raise serializers.ValidationError("Multi-select property value must be a list.")
                for val in actual_value:
                    if val not in property_definition.options:
                        raise serializers.ValidationError(f"'{val}' is not a valid option for this property.")

        return data


class IssuePropertyValueDetailSerializer(BaseSerializer):
    """Read-only serializer that nests property definition data."""

    property_definition_detail = PropertyDefinitionSerializer(source="property_definition", read_only=True)

    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue_id",
            "property_definition_id",
            "property_definition_detail",
            "value",
            "workspace_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "created_at", "updated_at"]
