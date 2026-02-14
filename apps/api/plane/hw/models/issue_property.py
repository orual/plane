# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from plane.db.models import BaseModel


class IssuePropertyDefinition(BaseModel):
    """Define a custom property that can be attached to issues of specific types."""

    PROPERTY_TYPE_CHOICES = [
        ("text", "Text"),
        ("number", "Number"),
        ("select", "Select"),
        ("multi_select", "Multi-Select"),
        ("url", "URL"),
        ("date", "Date"),
        ("boolean", "Boolean"),
    ]

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_%(class)s",
    )
    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="property_definitions",
    )
    name = models.CharField(max_length=255)
    property_type = models.CharField(max_length=50, choices=PROPERTY_TYPE_CHOICES)
    options = models.JSONField(default=list)  # for select/multi_select types
    is_required = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "hw_issue_property_definitions"
        constraints = [
            models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True),
                fields=("workspace", "name", "issue_type"),
                name="unique_property_definition_per_workspace_name_type",
            ),
        ]


class IssuePropertyValue(BaseModel):
    """Store property values for issues."""

    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="property_values",
    )
    property_definition = models.ForeignKey(
        IssuePropertyDefinition,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value = models.JSONField(default=dict)
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="issue_property_values",
    )

    class Meta:
        db_table = "hw_issue_property_values"
        constraints = [
            models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True),
                fields=("issue", "property_definition"),
                name="unique_property_value_per_issue_definition",
            ),
        ]
