# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.db.models import Workspace, IssueType


DEFAULT_ISSUE_TYPES = [
    {
        "name": "Design",
        "description": "Design-related work items",
        "logo_props": {"color": "#7C3AED"},
        "is_default": False,
        "level": 0,
    },
    {
        "name": "Electrical",
        "description": "Electrical engineering work items",
        "logo_props": {"color": "#F59E0B"},
        "is_default": False,
        "level": 0,
    },
    {
        "name": "Mechanical",
        "description": "Mechanical engineering work items",
        "logo_props": {"color": "#10B981"},
        "is_default": False,
        "level": 0,
    },
    {
        "name": "Software",
        "description": "Software development work items",
        "logo_props": {"color": "#3B82F6"},
        "is_default": True,
        "level": 0,
    },
    {
        "name": "Hardware",
        "description": "General hardware work items",
        "logo_props": {"color": "#EF4444"},
        "is_default": False,
        "level": 0,
    },
]


@receiver(post_save, sender=Workspace)
def seed_issue_types_on_workspace_create(sender, instance, created, **kwargs):
    """Create default issue types when a new workspace is created."""
    if not created:
        return

    for type_data in DEFAULT_ISSUE_TYPES:
        IssueType.objects.get_or_create(
            workspace=instance,
            name=type_data["name"],
            defaults=type_data,
        )
