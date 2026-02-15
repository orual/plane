# Hardware Fork Implementation Plan - Phase 2

**Goal:** Full CRUD API for workspace-scoped issue types and project-scoped issue type linking, with comprehensive tests.

**Architecture:** Two ViewSets in the `plane.hw` app: `IssueTypeViewSet` (workspace-scoped CRUD) and `ProjectIssueTypeViewSet` (project-scoped link/unlink). Serializers follow the `StateSerializer` pattern from `plane.app`. URLs are wired through `plane.hw.urls`. Tests follow the existing contract test pattern using `session_client` for the `/api/` prefix.

**Tech Stack:** Django 4.2, Django REST Framework 3.15, pytest, Factory Boy

**Scope:** Phase 2 of 6 from original design

**Codebase verified:** 2026-02-13

**Testing context:** Backend tests use pytest with `@pytest.mark.contract` marker. Tests use `session_client` fixture (force-authenticated) for `/api/` endpoints. Fixtures create workspace + member in `conftest.py`. Tests use real database with `--reuse-db --nomigrations`. Run tests from `apps/api/` via `python run_tests.py -c`. See `apps/api/plane/tests/conftest.py` for base fixtures and `apps/api/plane/tests/contract/api/test_labels.py` for contract test patterns.

**Key model facts (verified):**
- `IssueType` at `apps/api/plane/db/models/issue_type.py:14-32`: fields are `workspace` (FK), `name`, `description`, `logo_props` (JSONField), `is_epic`, `is_default`, `is_active`, `level`, `external_source`, `external_id`. Table: `issue_types`. Inherits `BaseModel` (soft delete).
- `ProjectIssueType` at same file:35-55: inherits `ProjectBaseModel` (provides `project`+`workspace` FKs), `issue_type` (FK), `level`, `is_default`. Table: `project_issue_types`. UniqueConstraint on `(project, issue_type)` where `deleted_at__isnull=True`.
- `Issue.type`: FK to `IssueType`, `on_delete=SET_NULL`, `null=True, blank=True`, `related_name="issue_type"`.
- `Project.is_issue_type_enabled`: `BooleanField(default=False)` at `apps/api/plane/db/models/project.py:99`.
- `BaseViewSet` at `apps/api/plane/app/views/base.py:48`: inherits `ModelViewSet`, default `get_queryset()` returns `self.model.objects.all()`.
- `@allow_permission(allowed_roles, level="PROJECT", creator=False, model=None)` at `apps/api/plane/app/permissions/base.py`. `ROLE.ADMIN=20`, `ROLE.MEMBER=15`, `ROLE.GUEST=5`.
- `BaseSerializer` at `apps/api/plane/app/serializers/base.py:8-10`: extends `ModelSerializer` with `id = PrimaryKeyRelatedField(read_only=True)`.

---

## Phase 2: IssueType backend API

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create IssueType serializers

**Files:**
- Create: `apps/api/plane/hw/serializers/issue_type.py`
- Modify: `apps/api/plane/hw/serializers/__init__.py`

**Step 1: Create `apps/api/plane/hw/serializers/issue_type.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.app.serializers import BaseSerializer
from plane.db.models import IssueType, ProjectIssueType


class IssueTypeSerializer(BaseSerializer):
    class Meta:
        model = IssueType
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace"]


class ProjectIssueTypeSerializer(BaseSerializer):
    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue_type_id",
            "level",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]


class ProjectIssueTypeDetailSerializer(BaseSerializer):
    """Read-only serializer that nests the IssueType data."""

    issue_type_detail = IssueTypeSerializer(source="issue_type", read_only=True)

    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "issue_type_id",
            "issue_type_detail",
            "level",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project"]
```

**Step 2: Update `apps/api/plane/hw/serializers/__init__.py`**

```python
from .issue_type import (
    IssueTypeSerializer,
    ProjectIssueTypeSerializer,
    ProjectIssueTypeDetailSerializer,
)
```

**Step 3: Commit**

```bash
git add apps/api/plane/hw/serializers/
git commit -m "feat(hw): add IssueType and ProjectIssueType serializers"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create IssueType and ProjectIssueType ViewSets

**Files:**
- Create: `apps/api/plane/hw/views/issue_type.py`
- Modify: `apps/api/plane/hw/views/__init__.py`

**Step 1: Create `apps/api/plane/hw/views/issue_type.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.utils import IntegrityError

# Third party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from plane.app.views import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IssueType, ProjectIssueType, Issue, Workspace
from plane.hw.serializers import (
    IssueTypeSerializer,
    ProjectIssueTypeSerializer,
    ProjectIssueTypeDetailSerializer,
)


class IssueTypeViewSet(BaseViewSet):
    """Workspace-scoped CRUD for issue types."""

    serializer_class = IssueTypeSerializer
    model = IssueType

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
            .order_by("name")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = IssueTypeSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(issue_type)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        serializer = IssueTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(issue_type, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        issue_type = self.get_queryset().get(pk=pk)

        # Check if any issues reference this type
        if Issue.objects.filter(type=issue_type).exists():
            return Response(
                {"error": "Cannot delete an issue type that is in use by issues."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectIssueTypeViewSet(BaseViewSet):
    """Project-scoped linking of issue types to projects."""

    serializer_class = ProjectIssueTypeSerializer
    model = ProjectIssueType

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
            )
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("issue_type", "project", "workspace")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        serializer = ProjectIssueTypeDetailSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = ProjectIssueTypeSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(project_id=project_id, workspace=workspace)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "This issue type is already linked to the project."},
                status=status.HTTP_409_CONFLICT,
            )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        project_issue_type = self.get_queryset().get(pk=pk)
        project_issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

**Step 2: Update `apps/api/plane/hw/views/__init__.py`**

```python
from .issue_type import IssueTypeViewSet, ProjectIssueTypeViewSet
```

**Step 3: Commit**

```bash
git add apps/api/plane/hw/views/
git commit -m "feat(hw): add IssueType and ProjectIssueType ViewSets"
```
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_3 -->
### Task 3: Wire URL routes

**Files:**
- Create: `apps/api/plane/hw/urls/issue_type.py`
- Modify: `apps/api/plane/hw/urls/__init__.py`

**Step 1: Create `apps/api/plane/hw/urls/issue_type.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.hw.views import IssueTypeViewSet, ProjectIssueTypeViewSet

urlpatterns = [
    # Workspace-scoped issue type CRUD
    path(
        "workspaces/<str:slug>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-issue-types",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-issue-type",
    ),
    # Project-scoped issue type linking
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        ProjectIssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        ProjectIssueTypeViewSet.as_view({"delete": "destroy"}),
        name="project-issue-type",
    ),
]
```

**Step 2: Update `apps/api/plane/hw/urls/__init__.py`**

```python
from .issue_type import urlpatterns as issue_type_urls

urlpatterns = [
    *issue_type_urls,
]
```

**Step 3: Verify Django recognizes the new routes**

```bash
cd apps/api
python manage.py check
```

Expected: `System check identified no issues.`

```bash
cd ../..
```

**Step 4: Commit**

```bash
git add apps/api/plane/hw/urls/
git commit -m "feat(hw): add URL routes for IssueType and ProjectIssueType"
```
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Create seed data migration for default issue types

**Files:**
- Create: `apps/api/plane/hw/migrations/__init__.py`
- Create: `apps/api/plane/hw/migrations/0001_seed_issue_types.py`

**Step 1: Create `apps/api/plane/hw/migrations/__init__.py`**

```python
```

(Empty file.)

**Step 2: Create `apps/api/plane/hw/migrations/0001_seed_issue_types.py`**

This is a data migration that creates the five default issue types for all existing workspaces. New workspaces created after deployment need a separate mechanism (handled by a signal or post-create hook — see Additional considerations in design doc).

```python
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
    """Remove seeded issue types (only those matching default names)."""
    IssueType = apps.get_model("db", "IssueType")
    default_names = [t["name"] for t in DEFAULT_ISSUE_TYPES]
    IssueType.objects.filter(name__in=default_names).delete()


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
```

Note: This migration depends on `("db", "__first__")` to ensure the IssueType table exists, and `("hw", "__first__")` is satisfied by this being the initial migration of the hw app. Since `--nomigrations` is used in tests, this migration won't run during testing — test data is created explicitly via fixtures.

**Step 3: Commit**

```bash
git add apps/api/plane/hw/migrations/
git commit -m "feat(hw): add seed migration for default issue types"
```
<!-- END_TASK_4 -->

<!-- START_SUBCOMPONENT_B (tasks 5-7) -->

<!-- START_TASK_5 -->
### Task 5: Add test factories for IssueType and ProjectIssueType

**Files:**
- Modify: `apps/api/plane/tests/factories.py` (add new factories at end of file)

**Step 1: Read the current end of `apps/api/plane/tests/factories.py`**

Find the last factory class in the file and add after it.

**Step 2: Add IssueTypeFactory and ProjectIssueTypeFactory**

Append these factory classes to `apps/api/plane/tests/factories.py`:

```python
class IssueTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "db.IssueType"

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Issue Type {n}")
    description = ""
    logo_props = factory.LazyFunction(lambda: {"color": "#3B82F6"})
    is_default = False
    is_active = True
    level = 0
    workspace = factory.SubFactory(WorkspaceFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectIssueTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "db.ProjectIssueType"

    id = factory.LazyFunction(uuid4)
    issue_type = factory.SubFactory(IssueTypeFactory)
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.LazyAttribute(lambda o: o.project.workspace)
    level = 0
    is_default = False
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
```

**Step 3: Verify the factories import correctly**

```bash
cd apps/api
python -c "from plane.tests.factories import IssueTypeFactory, ProjectIssueTypeFactory; print('OK')"
cd ../..
```

Expected: `OK`

**Step 4: Commit**

```bash
git add apps/api/plane/tests/factories.py
git commit -m "feat(hw): add IssueType and ProjectIssueType test factories"
```
<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Write contract tests for IssueType workspace endpoints

**Files:**
- Create: `apps/api/plane/tests/contract/hw/__init__.py`
- Create: `apps/api/plane/tests/contract/hw/test_issue_types.py`

**Step 1: Create `apps/api/plane/tests/contract/hw/__init__.py`**

```python
```

(Empty file.)

**Step 2: Create `apps/api/plane/tests/contract/hw/test_issue_types.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status
from uuid import uuid4

from plane.db.models import IssueType, ProjectIssueType, Issue, Project, ProjectMember, State, WorkspaceMember


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
def issue_type(db, workspace):
    """Create a test issue type."""
    return IssueType.objects.create(
        name="Electrical",
        description="Electrical engineering work items",
        logo_props={"color": "#F59E0B"},
        workspace=workspace,
    )


@pytest.fixture
def issue_type_data():
    """Sample issue type data for creation tests."""
    return {
        "name": "Mechanical",
        "description": "Mechanical engineering work items",
        "logo_props": {"color": "#10B981"},
    }


@pytest.fixture
def guest_user(db):
    """Create a guest user."""
    from plane.db.models import User

    user = User.objects.create(
        email="guest@plane.so",
        username="guest_user",
        first_name="Guest",
        last_name="User",
    )
    user.set_password("guest@123")
    user.save()
    return user


@pytest.fixture
def guest_client(api_client, guest_user, workspace):
    """Return a session-authenticated client for a guest-level workspace member."""
    WorkspaceMember.objects.create(workspace=workspace, member=guest_user, role=5)
    api_client.force_authenticate(user=guest_user)
    return api_client


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
# Workspace IssueType endpoints
# ============================================================


@pytest.mark.contract
class TestIssueTypeListCreate:
    """Test workspace-scoped IssueType list and create endpoints."""

    def get_url(self, workspace_slug):
        return f"/api/workspaces/{workspace_slug}/issue-types/"

    @pytest.mark.django_db
    def test_list_issue_types(self, session_client, workspace, issue_type):
        """Test listing issue types for a workspace."""
        url = self.get_url(workspace.slug)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        names = [it["name"] for it in response.data]
        assert "Electrical" in names

    @pytest.mark.django_db
    def test_create_issue_type_as_admin(self, session_client, workspace, issue_type_data):
        """Test creating an issue type as workspace admin."""
        url = self.get_url(workspace.slug)
        response = session_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == issue_type_data["name"]
        assert response.data["description"] == issue_type_data["description"]
        assert IssueType.objects.filter(workspace=workspace, name=issue_type_data["name"]).exists()

    @pytest.mark.django_db
    def test_create_issue_type_as_member_forbidden(self, member_client, workspace, issue_type_data):
        """Members should not be able to create issue types."""
        url = self.get_url(workspace.slug)
        response = member_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_create_issue_type_as_guest_forbidden(self, guest_client, workspace, issue_type_data):
        """Guests should not be able to create issue types."""
        url = self.get_url(workspace.slug)
        response = guest_client.post(url, issue_type_data, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_create_issue_type_missing_name(self, session_client, workspace):
        """Creating an issue type without a name should fail."""
        url = self.get_url(workspace.slug)
        response = session_client.post(url, {"description": "No name"}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_list_issue_types_as_guest(self, guest_client, workspace, issue_type):
        """Guests should be able to list issue types."""
        url = self.get_url(workspace.slug)
        response = guest_client.get(url)

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.contract
class TestIssueTypeDetail:
    """Test workspace-scoped IssueType retrieve, update, and delete."""

    def get_url(self, workspace_slug, issue_type_id):
        return f"/api/workspaces/{workspace_slug}/issue-types/{issue_type_id}/"

    @pytest.mark.django_db
    def test_retrieve_issue_type(self, session_client, workspace, issue_type):
        """Test retrieving a single issue type."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(issue_type.id)
        assert response.data["name"] == "Electrical"

    @pytest.mark.django_db
    def test_retrieve_nonexistent_issue_type(self, session_client, workspace):
        """Retrieving a nonexistent issue type should return 404."""
        url = self.get_url(workspace.slug, uuid4())
        response = session_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_update_issue_type(self, session_client, workspace, issue_type):
        """Test updating an issue type."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.patch(url, {"name": "Electrical v2"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        issue_type.refresh_from_db()
        assert issue_type.name == "Electrical v2"

    @pytest.mark.django_db
    def test_update_issue_type_as_member_forbidden(self, member_client, workspace, issue_type):
        """Members should not be able to update issue types."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = member_client.patch(url, {"name": "Hacked"}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_delete_issue_type(self, session_client, workspace, issue_type):
        """Test deleting an issue type with no referencing issues."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        # Default manager filters out soft-deleted records
        assert not IssueType.objects.filter(id=issue_type.id).exists()

    @pytest.mark.django_db
    def test_delete_issue_type_in_use(self, session_client, workspace, issue_type, project, create_user):
        """Deleting an issue type that is referenced by issues should fail."""
        state = State.objects.filter(project=project).first()
        if not state:
            state = State.objects.create(
                name="Todo",
                project=project,
                workspace=workspace,
                group="backlog",
            )

        Issue.objects.create(
            name="Test Issue",
            project=project,
            workspace=workspace,
            state=state,
            type=issue_type,
            created_by=create_user,
        )

        url = self.get_url(workspace.slug, issue_type.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "in use" in response.data["error"].lower()
        assert IssueType.objects.filter(id=issue_type.id).exists()

    @pytest.mark.django_db
    def test_delete_issue_type_as_guest_forbidden(self, guest_client, workspace, issue_type):
        """Guests should not be able to delete issue types."""
        url = self.get_url(workspace.slug, issue_type.id)
        response = guest_client.delete(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN


# ============================================================
# Project IssueType endpoints
# ============================================================


@pytest.mark.contract
class TestProjectIssueTypeListCreate:
    """Test project-scoped IssueType linking endpoints."""

    def get_url(self, workspace_slug, project_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-types/"

    @pytest.mark.django_db
    def test_list_project_issue_types(self, session_client, workspace, project, issue_type):
        """Test listing issue types linked to a project."""
        # Link the issue type to the project
        ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id)
        response = session_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["issue_type_detail"]["name"] == "Electrical"

    @pytest.mark.django_db
    def test_link_issue_type_to_project(self, session_client, workspace, project, issue_type):
        """Test linking an issue type to a project."""
        url = self.get_url(workspace.slug, project.id)
        response = session_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert ProjectIssueType.objects.filter(project=project, issue_type=issue_type).exists()

    @pytest.mark.django_db
    def test_link_duplicate_issue_type(self, session_client, workspace, project, issue_type):
        """Linking the same issue type twice should return 409."""
        ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id)
        response = session_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.django_db
    def test_link_issue_type_as_member_forbidden(self, member_client, workspace, project, issue_type):
        """Members should not be able to link issue types to projects."""
        # Add the member user to the project as a member
        ProjectMember.objects.create(
            project=project,
            member=member_client.handler._force_user,
            role=15,
            is_active=True,
        )

        url = self.get_url(workspace.slug, project.id)
        response = member_client.post(url, {"issue_type_id": str(issue_type.id)}, format="json")

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestProjectIssueTypeDelete:
    """Test project-scoped IssueType unlinking."""

    def get_url(self, workspace_slug, project_id, project_issue_type_id):
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/issue-types/{project_issue_type_id}/"

    @pytest.mark.django_db
    def test_unlink_issue_type_from_project(self, session_client, workspace, project, issue_type):
        """Test unlinking an issue type from a project."""
        pit = ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        url = self.get_url(workspace.slug, project.id, pit.id)
        response = session_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectIssueType.objects.filter(id=pit.id).exists()
```

**Step 3: Verify tests run (expect some may fail until ViewSets are fully wired)**

```bash
cd apps/api
python run_tests.py -c
cd ../..
```

Expected: All tests pass including the new contract tests.

**Step 4: Commit**

```bash
git add apps/api/plane/tests/contract/hw/
git commit -m "test(hw): add contract tests for IssueType workspace and project endpoints"
```
<!-- END_TASK_6 -->

<!-- START_TASK_7 -->
### Task 7: Write unit tests for IssueType serializers

**Files:**
- Create: `apps/api/plane/tests/unit/hw/__init__.py`
- Create: `apps/api/plane/tests/unit/hw/test_issue_type_serializers.py`

**Step 1: Create `apps/api/plane/tests/unit/hw/__init__.py`**

```python
```

(Empty file.)

**Step 2: Create `apps/api/plane/tests/unit/hw/test_issue_type_serializers.py`**

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import IssueType, ProjectIssueType, Project
from plane.hw.serializers import (
    IssueTypeSerializer,
    ProjectIssueTypeSerializer,
    ProjectIssueTypeDetailSerializer,
)


@pytest.mark.unit
class TestIssueTypeSerializer:
    """Test IssueTypeSerializer validation and output shape."""

    @pytest.mark.django_db
    def test_valid_data(self, workspace):
        """Serializer accepts valid issue type data."""
        data = {"name": "Electrical", "description": "EE work", "logo_props": {"color": "#F59E0B"}}
        serializer = IssueTypeSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.django_db
    def test_missing_name(self, workspace):
        """Serializer rejects data without a name."""
        data = {"description": "No name"}
        serializer = IssueTypeSerializer(data=data)
        assert not serializer.is_valid()
        assert "name" in serializer.errors

    @pytest.mark.django_db
    def test_output_shape(self, workspace):
        """Serialized output contains all expected fields."""
        issue_type = IssueType.objects.create(
            name="Mechanical",
            workspace=workspace,
            logo_props={"color": "#10B981"},
        )
        serializer = IssueTypeSerializer(issue_type)
        data = serializer.data

        assert "id" in data
        assert "name" in data
        assert "description" in data
        assert "logo_props" in data
        assert "workspace_id" in data
        assert "is_default" in data
        assert "is_active" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert data["name"] == "Mechanical"


@pytest.mark.unit
class TestProjectIssueTypeDetailSerializer:
    """Test ProjectIssueTypeDetailSerializer nesting."""

    @pytest.mark.django_db
    def test_nested_issue_type_detail(self, workspace, create_user):
        """Detail serializer includes nested issue type data."""
        project = Project.objects.create(
            name="Test Project",
            identifier="TP",
            workspace=workspace,
            created_by=create_user,
        )
        issue_type = IssueType.objects.create(
            name="Design",
            workspace=workspace,
            logo_props={"color": "#7C3AED"},
        )
        pit = ProjectIssueType.objects.create(
            issue_type=issue_type,
            project=project,
            workspace=workspace,
        )

        serializer = ProjectIssueTypeDetailSerializer(pit)
        data = serializer.data

        assert "issue_type_detail" in data
        assert data["issue_type_detail"]["name"] == "Design"
        assert data["issue_type_detail"]["logo_props"] == {"color": "#7C3AED"}
        assert data["issue_type_id"] == str(issue_type.id)
        assert data["project_id"] == str(project.id)
```

**Step 3: Run all tests**

```bash
cd apps/api
python run_tests.py
cd ../..
```

Expected: All tests pass (existing + new unit + new contract).

**Step 4: Commit**

```bash
git add apps/api/plane/tests/unit/hw/
git commit -m "test(hw): add unit tests for IssueType serializers"
```
<!-- END_TASK_7 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_TASK_8 -->
### Task 8: Final verification of Phase 2

**Step 1: Run all backend tests**

```bash
cd apps/api
python run_tests.py
cd ../..
```

Expected: All tests pass.

**Step 2: Verify Django starts cleanly**

```bash
cd apps/api
python manage.py check
cd ../..
```

Expected: `System check identified no issues.`

**Step 3: Verify git state is clean**

```bash
git status
```

Expected: Clean working tree.

No commit needed — verification only.
<!-- END_TASK_8 -->
