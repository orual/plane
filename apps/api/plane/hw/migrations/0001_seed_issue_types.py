# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations


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


def seed_issue_types(apps, schema_editor):
    """Create default issue types for all existing workspaces."""
    IssueType = apps.get_model("db", "IssueType")
    Workspace = apps.get_model("db", "Workspace")

    for workspace in Workspace.objects.all():
        for type_data in DEFAULT_ISSUE_TYPES:
            IssueType.objects.get_or_create(
                workspace=workspace,
                name=type_data["name"],
                defaults=type_data,
            )


def reverse_seed(apps, schema_editor):
    """Remove seeded issue types (only those matching default names and descriptions)."""
    IssueType = apps.get_model("db", "IssueType")
    from django.db.models import Q

    conditions = Q()
    for t in DEFAULT_ISSUE_TYPES:
        conditions |= Q(name=t["name"], description=t["description"])
    IssueType.objects.filter(conditions).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "__first__"),
    ]

    # The hw app has no tables of its own yet, so we need a fake initial migration.
    # We use this seed migration as our first migration.
    initial = True

    operations = [
        migrations.RunPython(seed_issue_types, reverse_seed),
    ]
