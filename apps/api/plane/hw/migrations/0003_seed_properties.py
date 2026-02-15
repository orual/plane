# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations


DEFAULT_PROPERTIES = {
    None: [  # Universal properties (issue_type=None, applies to all types)
        {
            "name": "Branch",
            "property_type": "text",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "PR Link",
            "property_type": "url",
            "options": [],
            "is_required": False,
            "sort_order": 20,
        },
        {
            "name": "Revision",
            "property_type": "text",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Electrical": [
        {
            "name": "Schematic Link",
            "property_type": "url",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "Part Number",
            "property_type": "text",
            "options": [],
            "is_required": False,
            "sort_order": 20,
        },
        {
            "name": "Component Count",
            "property_type": "number",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Mechanical": [
        {
            "name": "CAD File Link",
            "property_type": "url",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "Material",
            "property_type": "select",
            "options": [
                "Aluminum",
                "Steel",
                "Plastic",
                "Composite",
                "Other",
            ],
            "is_required": False,
            "sort_order": 20,
        },
        {
            "name": "Weight",
            "property_type": "number",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Design": [
        {
            "name": "Document Link",
            "property_type": "url",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
    ],
    "Hardware": [
        {
            "name": "Datasheet Link",
            "property_type": "url",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
    ],
}


def seed_properties(apps, schema_editor):
    """Create default properties for all existing workspaces and issue types."""
    IssuePropertyDefinition = apps.get_model("hw", "IssuePropertyDefinition")
    IssueType = apps.get_model("db", "IssueType")
    Workspace = apps.get_model("db", "Workspace")

    for workspace in Workspace.objects.all():
        # Create universal properties (issue_type=None)
        for prop_data in DEFAULT_PROPERTIES.get(None, []):
            IssuePropertyDefinition.objects.get_or_create(
                workspace=workspace,
                issue_type=None,
                name=prop_data["name"],
                defaults={
                    "property_type": prop_data["property_type"],
                    "options": prop_data.get("options", []),
                    "is_required": prop_data.get("is_required", False),
                    "sort_order": prop_data.get("sort_order", 65535),
                },
            )

        # Create type-specific properties
        for issue_type_name, properties in DEFAULT_PROPERTIES.items():
            if issue_type_name is None:
                continue

            issue_type = IssueType.objects.filter(
                workspace=workspace, name=issue_type_name
            ).first()
            if not issue_type:
                continue

            for prop_data in properties:
                IssuePropertyDefinition.objects.get_or_create(
                    workspace=workspace,
                    issue_type=issue_type,
                    name=prop_data["name"],
                    defaults={
                        "property_type": prop_data["property_type"],
                        "options": prop_data.get("options", []),
                        "is_required": prop_data.get("is_required", False),
                        "sort_order": prop_data.get("sort_order", 65535),
                    },
                )


def reverse_seed(apps, schema_editor):
    """Remove seeded properties (only those with default names and no creator)."""
    IssuePropertyDefinition = apps.get_model("hw", "IssuePropertyDefinition")

    default_names = set()
    for props in DEFAULT_PROPERTIES.values():
        for prop_data in props:
            default_names.add(prop_data["name"])

    # Only delete seeded records (created_by is null) to preserve user-created records
    IssuePropertyDefinition.objects.filter(name__in=default_names, created_by__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("hw", "0002_initial"),
        ("db", "__latest__"),
    ]

    operations = [
        migrations.RunPython(seed_properties, reverse_seed),
    ]
