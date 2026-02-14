# Hardware Fork Implementation Plan - Phase 4

**Goal:** Property definition and value CRUD API with type-aware validation, seed data, and comprehensive tests.

**Architecture:** Two ViewSets in the `plane.hw` app: `PropertyDefinitionViewSet` (workspace-scoped CRUD for property definitions) and `IssuePropertyValueViewSet` (issue-scoped CRUD for property values). Serializers implement type-aware validation (text, number, select, multi_select, url, date, boolean). URLs are wired through `plane.hw.urls`. Tests follow the existing contract test pattern using `session_client` for the `/api/` prefix.

**Tech Stack:** Django 4.2, Django REST Framework 3.15, pytest, Factory Boy

**Scope:** Phase 4 of 6 from original design

**Codebase verified:** 2026-02-13

**Testing context:** Backend tests use pytest with `@pytest.mark.contract` marker. Tests use `session_client` fixture (force-authenticated) for `/api/` endpoints. Fixtures create workspace + member in `conftest.py`. Tests use real database with `--reuse-db --nomigrations`. Run tests from `apps/api/` via `python run_tests.py -c`. See `apps/api/plane/tests/conftest.py` for base fixtures and `apps/api/plane/tests/contract/api/test_labels.py` for contract test patterns.

**Key model facts (verified):**
- `IssueType` at `apps/api/plane/db/models/issue_type.py:14-32`: fields are `workspace` (FK), `name`, `description`, `logo_props` (JSONField), `is_epic`, `is_default`, `is_active`, `level`, `external_source`, `external_id`. Table: `issue_types`. Inherits `BaseModel` (soft delete).
- `Issue` at `apps/api/plane/db/models/issue.py`: FK to `IssueType` via `type` field, `on_delete=SET_NULL`, `null=True`, `related_name="issue_type"`. Workspace and project FKs present.
- `BaseModel` at `apps/api/plane/db/models/base.py:20-60`: provides `id` (UUID), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete), audit trail.
- `WorkspaceBaseModel(BaseModel)` at same file: adds `workspace` (FK to `Workspace`, `CASCADE`), `project` (FK to `Project`, `SET_NULL`, nullable). Pattern: `models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s")`.
- `BaseViewSet` at `apps/api/plane/app/views/base.py:48`: inherits `ModelViewSet`, default `get_queryset()` returns `self.model.objects.all()`.
- `@allow_permission(allowed_roles, level="PROJECT", creator=False, model=None)` at `apps/api/plane/app/permissions/base.py`. `ROLE.ADMIN=20`, `ROLE.MEMBER=15`, `ROLE.GUEST=5`.
- `BaseSerializer` at `apps/api/plane/app/serializers/base.py:8-10`: extends `ModelSerializer` with `id = PrimaryKeyRelatedField(read_only=True)`.
- Migration pattern from `0106_auto_20250912_0845.py`: `CreateModel` with explicit UUID id, audit fields, ForeignKey to `"db.project"` or `"db.workspace"`, `models.SET_NULL`, `models.CASCADE`. UniqueConstraint with `condition=models.Q(("deleted_at__isnull", True))`.

---

## Phase 4: Custom properties backend API

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create IssuePropertyDefinition and IssuePropertyValue models

**Files:**
- Create: `apps/api/plane/hw/models/__init__.py`
- Create: `apps/api/plane/hw/models/issue_property.py`
- Modify: `apps/api/plane/hw/__init__.py`

**Step 1: Create `apps/api/plane/hw/models/__init__.py`**

```python
from .issue_property import IssuePropertyDefinition, IssuePropertyValue

__all__ = [
    "IssuePropertyDefinition",
    "IssuePropertyValue",
]
```

**Step 2: Create `apps/api/plane/hw/models/issue_property.py`**

```python
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
```

**Step 3: Modify `apps/api/plane/hw/__init__.py`**

```python
from .models import IssuePropertyDefinition, IssuePropertyValue

__all__ = [
    "IssuePropertyDefinition",
    "IssuePropertyValue",
]
```

**Step 4: Verify imports**

```bash
cd apps/api
python -c "from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue; print('OK')"
cd ../..
```

Expected: `OK`

**Step 5: Commit**

```bash
git add apps/api/plane/hw/
git commit -m "feat(hw): add IssuePropertyDefinition and IssuePropertyValue models"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create migration 0001_initial.py

**Files:**
- Create: `apps/api/plane/hw/migrations/__init__.py`
- Create: `apps/api/plane/hw/migrations/0001_initial.py`

**Step 1: Create `apps/api/plane/hw/migrations/__init__.py`**

```python
```

(Empty file.)

**Step 2: Create `apps/api/plane/hw/migrations/0001_initial.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("db", "__first__"),
        ("hw", "0001_seed_issue_types"),
    ]

    operations = [
        migrations.CreateModel(
            name="IssuePropertyDefinition",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "name",
                    models.CharField(max_length=255),
                ),
                (
                    "property_type",
                    models.CharField(
                        choices=[
                            ("text", "Text"),
                            ("number", "Number"),
                            ("select", "Select"),
                            ("multi_select", "Multi-Select"),
                            ("url", "URL"),
                            ("date", "Date"),
                            ("boolean", "Boolean"),
                        ],
                        max_length=50,
                    ),
                ),
                (
                    "options",
                    models.JSONField(default=list),
                ),
                (
                    "is_required",
                    models.BooleanField(default=False),
                ),
                (
                    "sort_order",
                    models.FloatField(default=65535),
                ),
                (
                    "issue_type",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="property_definitions",
                        to="db.issuetype",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_issuepropertydefinition",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_%(class)s",
                        to="db.user",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="updated_%(class)s",
                        to="db.user",
                    ),
                ),
            ],
            options={
                "db_table": "hw_issue_property_definitions",
            },
        ),
        migrations.CreateModel(
            name="IssuePropertyValue",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                (
                    "value",
                    models.JSONField(default=dict),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="property_values",
                        to="db.issue",
                    ),
                ),
                (
                    "property_definition",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="hw.issuepropertydefinition",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issue_property_values",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_%(class)s",
                        to="db.user",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="updated_%(class)s",
                        to="db.user",
                    ),
                ),
            ],
            options={
                "db_table": "hw_issue_property_values",
            },
        ),
        migrations.AddConstraint(
            model_name="issuepropertydefinition",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name", "issue_type"),
                name="unique_property_definition_per_workspace_name_type",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuepropertyvalue",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue", "property_definition"),
                name="unique_property_value_per_issue_definition",
            ),
        ),
    ]
```

**Step 3: Verify migration is recognized**

```bash
cd apps/api
python manage.py migrate --dry-run
cd ../..
```

Expected: Migration shows as pending without errors.

**Step 4: Commit**

```bash
git add apps/api/plane/hw/migrations/
git commit -m "feat(hw): add initial migration for property definitions and values"
```
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_3 -->
### Task 3: Create PropertyDefinitionSerializer and IssuePropertyValueSerializer with type-aware validation

**Files:**
- Create: `apps/api/plane/hw/serializers/issue_property.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py`

**Step 1: Create `apps/api/plane/hw/serializers/__init__.py`**

```python
from .issue_property import (
    PropertyDefinitionSerializer,
    IssuePropertyValueSerializer,
    IssuePropertyValueDetailSerializer,
)
```

**Step 2: Create `apps/api/plane/hw/serializers/issue_property.py`**

```python
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
                raise serializers.ValidationError(
                    f"Property type '{property_type}' requires a non-empty options list."
                )
        elif property_type not in ["text", "number", "url", "date", "boolean"]:
            raise serializers.ValidationError(f"Invalid property type: {property_type}")

        # For non-select types, options should be empty
        if property_type not in ["select", "multi_select"] and options:
            raise serializers.ValidationError(
                f"Property type '{property_type}' does not support options."
            )

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
                raise serializers.ValidationError(
                    "Text property value must be a string."
                )
        elif property_type == "number":
            if actual_value is not None and not isinstance(actual_value, (int, float)):
                raise serializers.ValidationError(
                    "Number property value must be numeric."
                )
        elif property_type == "url":
            if actual_value is not None and not isinstance(actual_value, str):
                raise serializers.ValidationError(
                    "URL property value must be a string."
                )
        elif property_type == "date":
            if actual_value is not None and not isinstance(actual_value, str):
                raise serializers.ValidationError(
                    "Date property value must be an ISO 8601 date string."
                )
        elif property_type == "boolean":
            if actual_value is not None and not isinstance(actual_value, bool):
                raise serializers.ValidationError(
                    "Boolean property value must be true or false."
                )
        elif property_type == "select":
            if actual_value is not None:
                if not isinstance(actual_value, str):
                    raise serializers.ValidationError(
                        "Select property value must be a string."
                    )
                if actual_value not in property_definition.options:
                    raise serializers.ValidationError(
                        f"'{actual_value}' is not a valid option for this property."
                    )
        elif property_type == "multi_select":
            if actual_value is not None:
                if not isinstance(actual_value, list):
                    raise serializers.ValidationError(
                        "Multi-select property value must be a list."
                    )
                for val in actual_value:
                    if val not in property_definition.options:
                        raise serializers.ValidationError(
                            f"'{val}' is not a valid option for this property."
                        )

        return data


class IssuePropertyValueDetailSerializer(BaseSerializer):
    """Read-only serializer that nests property definition data."""

    property_definition_detail = PropertyDefinitionSerializer(
        source="property_definition", read_only=True
    )

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
```

**Step 3: Verify serializers import correctly**

```bash
cd apps/api
python -c "from plane.hw.serializers import PropertyDefinitionSerializer, IssuePropertyValueSerializer; print('OK')"
cd ../..
```

Expected: `OK`

**Step 4: Commit**

```bash
git add apps/api/plane/hw/serializers/
git commit -m "feat(hw): add PropertyDefinition and IssuePropertyValue serializers with type-aware validation"
```
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Create PropertyDefinitionViewSet and IssuePropertyValueViewSet

**Files:**
- Create: `apps/api/plane/hw/views/issue_property.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Step 1: Create `apps/api/plane/hw/views/__init__.py`**

```python
from .issue_property import PropertyDefinitionViewSet, IssuePropertyValueViewSet
```

**Step 2: Create `apps/api/plane/hw/views/issue_property.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action

# Module imports
from plane.app.views import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue
from plane.hw.serializers import (
    PropertyDefinitionSerializer,
    IssuePropertyValueSerializer,
    IssuePropertyValueDetailSerializer,
)


class PropertyDefinitionViewSet(BaseViewSet):
    """Workspace-scoped CRUD for property definitions."""

    serializer_class = PropertyDefinitionSerializer
    model = IssuePropertyDefinition

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "issue_type")
            .order_by("sort_order", "name")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()
        serializer = PropertyDefinitionSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        prop_def = self.get_queryset().get(pk=pk)
        serializer = PropertyDefinitionSerializer(prop_def)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        from plane.db.models import Workspace

        workspace = Workspace.objects.get(slug=slug)
        serializer = PropertyDefinitionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        prop_def = self.get_queryset().get(pk=pk)
        serializer = PropertyDefinitionSerializer(prop_def, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        prop_def = self.get_queryset().get(pk=pk)
        prop_def.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyValueViewSet(BaseViewSet):
    """Issue-scoped CRUD for property values."""

    serializer_class = IssuePropertyValueSerializer
    model = IssuePropertyValue

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                issue__project_id=self.kwargs.get("project_id"),
                issue_id=self.kwargs.get("issue_id"),
            )
            .select_related("property_definition", "issue", "workspace")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def list(self, request, slug, project_id, issue_id):
        queryset = self.get_queryset()
        serializer = IssuePropertyValueDetailSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def create(self, request, slug, project_id, issue_id):
        from plane.db.models import Issue, Workspace

        workspace = Workspace.objects.get(slug=slug)
        issue = Issue.objects.get(id=issue_id, project_id=project_id)

        serializer = IssuePropertyValueSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=workspace, issue=issue)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def partial_update(self, request, slug, project_id, issue_id, pk):
        prop_value = self.get_queryset().get(pk=pk)
        serializer = IssuePropertyValueSerializer(prop_value, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def destroy(self, request, slug, project_id, issue_id, pk):
        prop_value = self.get_queryset().get(pk=pk)
        prop_value.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    @action(detail=False, methods=["put"], url_path="bulk-upsert")
    def bulk_upsert(self, request, slug, project_id, issue_id):
        """Bulk upsert property values for an issue."""
        from plane.db.models import Issue, Workspace

        workspace = Workspace.objects.get(slug=slug)
        issue = Issue.objects.get(id=issue_id, project_id=project_id)

        # Expect request.data to be a list of objects with property_definition_id and value
        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of property values."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        errors = []

        for idx, item in enumerate(request.data):
            prop_def_id = item.get("property_definition_id")
            value = item.get("value")

            if not prop_def_id:
                errors.append(f"Item {idx}: property_definition_id is required.")
                continue

            try:
                prop_value, created = IssuePropertyValue.objects.update_or_create(
                    issue=issue,
                    property_definition_id=prop_def_id,
                    defaults={"value": value, "workspace": workspace},
                )
                serializer = IssuePropertyValueDetailSerializer(prop_value)
                results.append(serializer.data)
            except Exception as e:
                errors.append(f"Item {idx}: {str(e)}")

        if errors:
            return Response(
                {"results": results, "errors": errors},
                status=status.HTTP_207_MULTI_STATUS,
            )

        return Response(results, status=status.HTTP_200_OK)
```

**Step 2: Update `apps/api/plane/hw/views/__init__.py`**

```python
from .issue_property import PropertyDefinitionViewSet, IssuePropertyValueViewSet
```

**Step 3: Verify ViewSets import correctly**

```bash
cd apps/api
python -c "from plane.hw.views import PropertyDefinitionViewSet, IssuePropertyValueViewSet; print('OK')"
cd ../..
```

Expected: `OK`

**Step 4: Commit**

```bash
git add apps/api/plane/hw/views/
git commit -m "feat(hw): add PropertyDefinition and IssuePropertyValue ViewSets"
```
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Wire URL routes

**Files:**
- Create: `apps/api/plane/hw/urls/issue_property.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Step 1: Create `apps/api/plane/hw/urls/issue_property.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.hw.views import PropertyDefinitionViewSet, IssuePropertyValueViewSet

urlpatterns = [
    # Workspace-scoped property definition CRUD
    path(
        "workspaces/<str:slug>/property-definitions/",
        PropertyDefinitionViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-property-definitions",
    ),
    path(
        "workspaces/<str:slug>/property-definitions/<uuid:pk>/",
        PropertyDefinitionViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="workspace-property-definition",
    ),
    # Issue-scoped property value CRUD
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/",
        IssuePropertyValueViewSet.as_view({"get": "list", "post": "create", "put": "bulk_upsert"}),
        name="issue-property-values",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/<uuid:pk>/",
        IssuePropertyValueViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-property-value",
    ),
]
```

**Step 2: Update `apps/api/plane/hw/urls/__init__.py`**

```python
from .issue_property import urlpatterns as issue_property_urls

urlpatterns = [
    *issue_property_urls,
]
```

**Step 3: Verify Django recognizes the new routes**

```bash
cd apps/api
python manage.py check
cd ../..
```

Expected: `System check identified no issues.`

**Step 4: Commit**

```bash
git add apps/api/plane/hw/urls/
git commit -m "feat(hw): add URL routes for property definitions and values"
```
<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Create seed data migration for default properties

**Files:**
- Modify: `apps/api/plane/hw/migrations/0001_initial.py` (or create `0002_seed_properties.py`)

**Step 1: Create `apps/api/plane/hw/migrations/0002_seed_properties.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import migrations


DEFAULT_PROPERTIES = {
    None: [  # Universal properties (issue_type=None, applies to all types)
        {
            "name": "Branch",
            "property_type": "text",
            "description": "Git branch name",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "PR Link",
            "property_type": "url",
            "description": "Pull request URL",
            "options": [],
            "is_required": False,
            "sort_order": 20,
        },
        {
            "name": "Revision",
            "property_type": "text",
            "description": "Code revision or version",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Electrical": [
        {
            "name": "Schematic Link",
            "property_type": "url",
            "description": "Link to circuit schematic",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "Part Number",
            "property_type": "text",
            "description": "Electronic component part number",
            "options": [],
            "is_required": False,
            "sort_order": 20,
        },
        {
            "name": "Component Count",
            "property_type": "number",
            "description": "Number of components",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Mechanical": [
        {
            "name": "CAD File Link",
            "property_type": "url",
            "description": "Link to CAD design file",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
        {
            "name": "Material",
            "property_type": "select",
            "description": "Material type",
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
            "description": "Weight in grams",
            "options": [],
            "is_required": False,
            "sort_order": 30,
        },
    ],
    "Design": [
        {
            "name": "Document Link",
            "property_type": "url",
            "description": "Link to design document",
            "options": [],
            "is_required": False,
            "sort_order": 10,
        },
    ],
    "Hardware": [
        {
            "name": "Datasheet Link",
            "property_type": "url",
            "description": "Link to hardware datasheet",
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
    """Remove seeded properties (only those with default names)."""
    IssuePropertyDefinition = apps.get_model("hw", "IssuePropertyDefinition")

    default_names = set()
    for props in DEFAULT_PROPERTIES.values():
        for prop_data in props:
            default_names.add(prop_data["name"])

    IssuePropertyDefinition.objects.filter(name__in=default_names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("hw", "0001_initial"),
        ("db", "__latest__"),  # Ensure db migrations completed
    ]

    operations = [
        migrations.RunPython(seed_properties, reverse_seed),
    ]
```

**Step 2: Commit**

```bash
git add apps/api/plane/hw/migrations/
git commit -m "feat(hw): add seed migration for default properties"
```
<!-- END_TASK_6 -->

<!-- START_SUBCOMPONENT_B (tasks 7-9) -->

<!-- START_TASK_7 -->
### Task 7: Add test factories for PropertyDefinition and PropertyValue

**Files:**
- Modify: `apps/api/plane/tests/factories.py` (add new factories at end of file)

**Step 1: Read the current end of `apps/api/plane/tests/factories.py`**

Find the last factory class in the file and add after it.

**Step 2: Add PropertyDefinitionFactory and PropertyValueFactory**

Append these factory classes to `apps/api/plane/tests/factories.py`:

```python
class PropertyDefinitionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "hw.IssuePropertyDefinition"

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Property {n}")
    property_type = "text"
    options = factory.LazyFunction(list)
    is_required = False
    sort_order = 65535
    workspace = factory.SubFactory(WorkspaceFactory)
    issue_type = None  # Universal by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class PropertyValueFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "hw.IssuePropertyValue"

    id = factory.LazyFunction(uuid4)
    issue = factory.SubFactory(IssueFactory)
    property_definition = factory.SubFactory(PropertyDefinitionFactory)
    value = factory.LazyFunction(lambda: {"value": "test"})
    workspace = factory.LazyAttribute(lambda o: o.issue.workspace)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

**Step 3: Verify the factories import correctly**

```bash
cd apps/api
python -c "from plane.tests.factories import PropertyDefinitionFactory, PropertyValueFactory; print('OK')"
cd ../..
```

Expected: `OK`

**Step 4: Commit**

```bash
git add apps/api/plane/tests/factories.py
git commit -m "test(hw): add PropertyDefinition and PropertyValue test factories"
```
<!-- END_TASK_7 -->

<!-- START_TASK_8 -->
### Task 8: Write contract tests for property endpoints

**Files:**
- Create: `apps/api/plane/tests/contract/hw/test_properties.py` (or add to existing `test_issue_types.py`)

**Step 1: Create `apps/api/plane/tests/contract/hw/test_properties.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from uuid import uuid4

from plane.db.models import Issue, Project, ProjectMember, State, WorkspaceMember
from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue


@pytest.fixture
def project(db, workspace, create_user):
    """Create a test project with the user as an admin member."""
    proj = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
        is_issue_type_enabled=True,
    )
    ProjectMember.objects.create(
        project=proj,
        member=create_user,
        role=20,
        is_active=True,
    )
    return proj


@pytest.fixture
def issue(db, workspace, project, create_user):
    """Create a test issue."""
    state = State.objects.filter(project=project).first()
    if not state:
        state = State.objects.create(
            name="Todo",
            project=project,
            workspace=workspace,
            group="backlog",
        )
    return Issue.objects.create(
        name="Test Issue",
        project=project,
        workspace=workspace,
        state=state,
        created_by=create_user,
    )


@pytest.fixture
def member_user(db):
    """Create a member user."""
    from plane.db.models import User

    user = User.objects.create(
        email="member@plane.so",
        username="member_user",
        first_name="Member",
        last_name="User",
    )
    user.set_password("member@123")
    user.save()
    return user


@pytest.fixture
def member_client(api_client, member_user, workspace):
    """Return a session-authenticated client for a member-level workspace member."""
    WorkspaceMember.objects.create(workspace=workspace, member=member_user, role=15)
    api_client.force_authenticate(user=member_user)
    return api_client


# ============================================================
# Property Definition endpoints
# ============================================================


@pytest.mark.contract
class TestPropertyDefinitionListCreate:
    """Test workspace-scoped property definition list and create endpoints."""

    def get_url(self, workspace_slug):
        return f"/api/workspaces/{workspace_slug}/property-definitions/"

    @pytest.mark.django_db
    def test_list_property_definitions(self, session_client, workspace):
        """Test listing property definitions for a workspace."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom Field",
            property_type="text",
        )

        url = self.get_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        names = [p["name"] for p in response.data]
        assert "Custom Field" in names

    @pytest.mark.django_db
    def test_create_property_definition(self, session_client, workspace):
        """Test creating a property definition."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Status",
            "property_type": "select",
            "options": ["Open", "Closed", "In Progress"],
            "is_required": False,
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Status"
        assert response.data["property_type"] == "select"
        assert IssuePropertyDefinition.objects.filter(
            workspace=workspace, name="Status"
        ).exists()

    @pytest.mark.django_db
    def test_create_property_definition_missing_name(self, session_client, workspace):
        """Creating a property without a name should fail."""
        url = self.get_url(workspace.slug)
        data = {"property_type": "text"}
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_select_property_without_options(self, session_client, workspace):
        """Creating a select property without options should fail."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Select Field",
            "property_type": "select",
            "options": [],
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_create_text_property_with_options_ignored(self, session_client, workspace):
        """Options for text properties should be rejected."""
        url = self.get_url(workspace.slug)
        data = {
            "name": "Text Field",
            "property_type": "text",
            "options": ["A", "B"],
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.contract
class TestPropertyDefinitionDetail:
    """Test workspace-scoped property definition retrieve, update, and delete."""

    def get_url(self, workspace_slug, prop_id):
        return f"/api/workspaces/{workspace_slug}/property-definitions/{prop_id}/"

    @pytest.mark.django_db
    def test_retrieve_property_definition(self, session_client, workspace):
        """Test retrieving a single property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Priority",
            property_type="select",
            options=["High", "Medium", "Low"],
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Priority"
        assert response.data["property_type"] == "select"

    @pytest.mark.django_db
    def test_update_property_definition(self, session_client, workspace):
        """Test updating a property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Old Name",
            property_type="text",
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.patch(url, {"name": "New Name"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        prop_def.refresh_from_db()
        assert prop_def.name == "New Name"

    @pytest.mark.django_db
    def test_delete_property_definition(self, session_client, workspace):
        """Test deleting a property definition."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="To Delete",
            property_type="text",
        )

        url = self.get_url(workspace.slug, prop_def.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssuePropertyDefinition.objects.filter(id=prop_def.id).exists()


# ============================================================
# Property Value endpoints
# ============================================================


@pytest.mark.contract
class TestPropertyValueListCreate:
    """Test issue-scoped property value list and create endpoints."""

    def get_url(self, workspace_slug, project_id, issue_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/property-values/"

    @pytest.mark.django_db
    def test_list_property_values(self, session_client, workspace, project, issue):
        """Test listing property values for an issue."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom Field",
            property_type="text",
        )
        prop_value = IssuePropertyValue.objects.create(
            issue=issue,
            property_definition=prop_def,
            workspace=workspace,
            value={"value": "test"},
        )

        url = self.get_url(workspace.slug, project.id, issue.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        assert response.data[0]["property_definition_id"] == str(prop_def.id)

    @pytest.mark.django_db
    def test_create_property_value(self, session_client, workspace, project, issue):
        """Test creating a property value."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Status",
            property_type="select",
            options=["Open", "Closed"],
        )

        url = self.get_url(workspace.slug, project.id, issue.id)
        data = {
            "property_definition_id": str(prop_def.id),
            "value": {"value": "Open"},
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert IssuePropertyValue.objects.filter(
            issue=issue, property_definition=prop_def
        ).exists()

    @pytest.mark.django_db
    def test_create_property_value_invalid_type(self, session_client, workspace, project, issue):
        """Creating a value with invalid type should fail."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Count",
            property_type="number",
        )

        url = self.get_url(workspace.slug, project.id, issue.id)
        data = {
            "property_definition_id": str(prop_def.id),
            "value": {"value": "not a number"},
        }
        response = session_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_bulk_upsert_property_values(self, session_client, workspace, project, issue):
        """Test bulk upserting property values."""
        prop_def1 = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Field 1",
            property_type="text",
        )
        prop_def2 = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Field 2",
            property_type="number",
        )

        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/property-values/bulk-upsert/"
        data = [
            {"property_definition_id": str(prop_def1.id), "value": {"value": "text"}},
            {"property_definition_id": str(prop_def2.id), "value": {"value": 42}},
        ]
        response = session_client.put(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert len(response) == 2


@pytest.mark.contract
class TestPropertyValueDelete:
    """Test issue-scoped property value deletion."""

    def get_url(self, workspace_slug, project_id, issue_id, prop_value_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/{issue_id}/property-values/{prop_value_id}/"

    @pytest.mark.django_db
    def test_delete_property_value(self, session_client, workspace, project, issue):
        """Test deleting a property value."""
        prop_def = IssuePropertyDefinition.objects.create(
            workspace=workspace,
            name="Custom",
            property_type="text",
        )
        prop_value = IssuePropertyValue.objects.create(
            issue=issue,
            property_definition=prop_def,
            workspace=workspace,
            value={"value": "test"},
        )

        url = self.get_url(workspace.slug, project.id, issue.id, prop_value.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssuePropertyValue.objects.filter(id=prop_value.id).exists()
```

**Step 2: Verify tests run**

```bash
cd apps/api
python run_tests.py -c
cd ../..
```

Expected: All tests pass including the new contract tests.

**Step 3: Commit**

```bash
git add apps/api/plane/tests/contract/hw/
git commit -m "test(hw): add contract tests for property definitions and values"
```
<!-- END_TASK_8 -->

<!-- START_TASK_9 -->
### Task 9: Write unit tests for PropertyDefinition and PropertyValue serializers

**Files:**
- Create: `apps/api/plane/tests/unit/hw/test_property_serializers.py`

**Step 1: Create `apps/api/plane/tests/unit/hw/test_property_serializers.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.hw.models import IssuePropertyDefinition, IssuePropertyValue
from plane.hw.serializers import (
    PropertyDefinitionSerializer,
    IssuePropertyValueSerializer,
    IssuePropertyValueDetailSerializer,
)


@pytest.mark.unit
class TestPropertyDefinitionSerializer:
    """Test PropertyDefinitionSerializer validation."""

    @pytest.mark.django_db
    def test_valid_text_property(self, workspace):
        """Serializer accepts valid text property."""
        data = {
            "name": "Description",
            "property_type": "text",
            "is_required": False,
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_valid_select_property(self, workspace):
        """Serializer accepts select property with options."""
        data = {
            "name": "Status",
            "property_type": "select",
            "options": ["Open", "Closed", "In Progress"],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_select_property_without_options_rejected(self, workspace):
        """Select property without options should be rejected."""
        data = {
            "name": "Status",
            "property_type": "select",
            "options": [],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert not serializer.is_valid()
        assert "Property type 'select'" in str(serializer.errors)

    @pytest.mark.django_db
    def test_text_property_with_options_rejected(self, workspace):
        """Text property with options should be rejected."""
        data = {
            "name": "Notes",
            "property_type": "text",
            "options": ["A", "B"],
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert not serializer.is_valid()
        assert "does not support options" in str(serializer.errors)

    @pytest.mark.django_db
    def test_invalid_property_type(self, workspace):
        """Invalid property type should be rejected."""
        data = {
            "name": "Field",
            "property_type": "invalid_type",
        }
        serializer = PropertyDefinitionSerializer(data=data)
        assert not serializer.is_valid()
        assert "Invalid property type" in str(serializer.errors)

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
        assert "string" in str(serializer.errors).lower()

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
        assert "numeric" in str(serializer.errors).lower()

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
        assert "not a valid option" in str(serializer.errors).lower()

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
        assert "list" in str(serializer.errors).lower()

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
        assert "boolean" in str(serializer.errors).lower()
```

**Step 2: Run all tests**

```bash
cd apps/api
python run_tests.py
cd ../..
```

Expected: All tests pass (existing + new unit + new contract).

**Step 3: Commit**

```bash
git add apps/api/plane/tests/unit/hw/
git commit -m "test(hw): add unit tests for PropertyDefinition and PropertyValue serializers"
```
<!-- END_TASK_9 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_10 -->
### Task 10: Final verification of Phase 4

**Step 1: Run all backend tests**

```bash
cd apps/api
python run_tests.py
cd ../..
```

Expected: All tests pass (including Phase 2 tests + Phase 4 tests).

**Step 2: Run contract tests only**

```bash
cd apps/api
python run_tests.py -c
cd ../..
```

Expected: All contract tests pass.

**Step 3: Verify Django starts cleanly**

```bash
cd apps/api
python manage.py check
cd ../..
```

Expected: `System check identified no issues.`

**Step 4: Verify git state is clean**

```bash
git status
```

Expected: Clean working tree.

No commit needed — verification only.
<!-- END_TASK_10 -->
