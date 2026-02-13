# Plane CE Soft Fork: Hardware-Aware PM Implementation Plan

Combined from earlier technical analysis and fork strategy documents. See `decision-record.md` for why we're on this path and what we rejected.

All claims below verified against `makeplane/plane` master as of 2026-02-13.

---

## Fork Strategy: Overlay with Periodic Rebase

Maintain our changes as a branch that rebases onto upstream tagged releases. Plane's `ce/` directory pattern makes this unusually clean -- the commercial edition applies the same overlay pattern, so upstream has strong incentive never to break the interface contracts between `core/` and `@/plane-web/*`.

### What we modify (conflict surface on rebase)

| File | Change | Conflict Risk |
|------|--------|---------------|
| `apps/web/tsconfig.json` | Add `./hw/*` to path alias | Low (one line) |
| `apps/api/plane/app/urls/__init__.py` | Import + spread our URL patterns | Medium (upstream adds modules here) |
| `apps/api/plane/settings/common.py` | Add `plane.hw` to `INSTALLED_APPS` | Low (add line) |
| `apps/api/plane/app/views/external/base.py` | Update LLM provider model lists | Medium (upstream may also update) |
| `apps/api/requirements/base.txt` | Add `anthropic` package | Low (add line) |

That's it. Five files, all import/config additions.

### What we create (zero conflict)

| Directory | Contents |
|-----------|----------|
| `apps/web/hw/` | Frontend overlay (components, hooks, stores, services, types) |
| `apps/api/plane/hw/` | Backend Django app (models, views, serializers, URLs, migrations) |
| `sidecar/` | Hardware preview pipeline service |

### When to hard fork

- Upstream restructures the `@/plane-web/*` import boundary
- Upstream replaces Django with a different backend framework
- Upstream changes the `core/` -> `ce/` component interface signatures often enough that rebase is more work than the fork
- We accumulate enough custom backend logic that the Django app boundary no longer isolates our changes

None of these are likely given Plane's architecture is built to support exactly this kind of edition splitting.

---

## What Already Exists (Verified in Repo)

### IssueType Database Model -- complete, unexposed

`apps/api/plane/db/models/issue_type.py`:

```python
class IssueType(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="issue_types", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_epic = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    level = models.FloatField(default=0)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

class ProjectIssueType(ProjectBaseModel):
    issue_type = models.ForeignKey("db.IssueType", related_name="project_issue_types", on_delete=models.CASCADE)
    level = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    # unique_together on (project, issue_type, deleted_at) with soft-delete constraint
```

The `Issue` model already has:

```python
type = models.ForeignKey("db.IssueType", on_delete=models.SET_NULL,
                         related_name="issue_type", null=True, blank=True)
```

And `Project` has: `is_issue_type_enabled = models.BooleanField(default=False)`.

**Note:** `IssueType` is exported from `models/__init__.py`, but `ProjectIssueType` is NOT. We'll need to import it directly from `plane.db.models.issue_type`.

The data model is fully wired end to end. The tables exist. Issues can reference types. There are zero API endpoints -- no serializers, no views, no URL routes.

### Webhook System -- production-ready

Per-workspace webhook URLs, event filtering (project/issue/module/cycle/issue_comment), HMAC signature verification, full request/response logging via `WebhookLog`. Dispatched via Celery task. Ready for our preview pipeline.

### AI Provider Backend -- functional but stale

`get_llm_response()` routes **all providers through the OpenAI client**, including Anthropic. This means it currently relies on Anthropic's OpenAI-compatible API endpoint (or just doesn't work for Anthropic). The Anthropic model list is stuck at Claude 3 era -- no 3.5, no 4.x models.

Config via env vars: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`.

### NDA Firewalling -- already works

`Project.network` field: `SECRET = 0` (only explicit members see it) vs `PUBLIC = 2` (all workspace members). Enforced via `ProjectMember` queries in every view's `get_queryset()`. Create a SECRET project per NDA engagement. Guest accounts (role 5) can be scoped per project.

No additional work needed.

### CE Frontend Stubs -- 280 files

The `ce/` directory contains **280 TypeScript files**, not "~20-30" as previously estimated. Most are stubs returning `<></>` or `null`, but a non-trivial number have real logic (stores, hooks, type definitions). This matters for the fallback strategy if the path alias overlay doesn't work.

---

## Architecture: Directory Layout

### Frontend: TypeScript Path Alias Overlay

```jsonc
// apps/web/tsconfig.json -- the ONE line we change
{
  "compilerOptions": {
    "paths": {
      "@/plane-web/*": ["./hw/*", "./ce/*"]  // was: ["./ce/*"]
    }
  }
}
```

The Vite bundler uses `vite-tsconfig-paths` (confirmed in `apps/web/vite.config.ts`). This resolver tries each substitution in order -- if `./hw/components/foo.tsx` exists, it's used; if not, it falls through to `./ce/components/foo.tsx`.

**Test this immediately.** Create `apps/web/hw/components/issues/issue-details/additional-properties.tsx` with a trivial change (add a console.log), run `pnpm dev`, and verify it's picked up instead of the `ce/` version.

**If fallback doesn't work:** Copy all of `ce/` into `hw/`. This is 280 files, not trivial, but most are small stubs. `ce/` stays untouched for upstream sync. Downside: if upstream adds a new stub in `ce/` that `core/` imports, the build breaks until we copy the new stub into `hw/`. This is detectable (build error) and mechanical (copy file), but it'll happen every upstream sync.

### Frontend Files to Create in `hw/`

Only create files that override CE stubs. Everything else falls through to unmodified `ce/`:

```
apps/web/hw/
├── components/
│   └── issues/
│       ├── filters/
│       │   ├── issue-types.tsx                   # FilterIssueTypes (was: returns null)
│       │   └── applied-filters/
│       │       └── issue-types.tsx               # AppliedIssueTypeFilters (was: returns null)
│       ├── issue-details/
│       │   ├── additional-properties.tsx          # WorkItemAdditionalSidebarProperties (was: <></>)
│       │   ├── issue-type-switcher.tsx            # IssueTypeSwitcher (was: identifier only)
│       │   ├── issue-type-activity.tsx            # IssueTypeActivity (was: <></>)
│       │   ├── issue-properties-activity/
│       │   │   └── root.tsx                       # IssueAdditionalPropertiesActivity (was: <></>)
│       │   └── property-fields/                   # Dynamic form field renderers
│       │       ├── text-field.tsx
│       │       ├── number-field.tsx
│       │       ├── select-field.tsx
│       │       ├── url-field.tsx
│       │       └── date-field.tsx
│       ├── issue-layouts/
│       │   └── additional-properties.tsx          # WorkItemLayoutAdditionalProperties (was: <></>)
│       └── issue-modal/
│           ├── issue-type-select.tsx              # IssueTypeSelect (was: <></>)
│           └── modal-additional-properties.tsx    # WorkItemModalAdditionalProperties (was: null)
├── hooks/
│   └── use-issue-properties.tsx                   # useWorkItemProperties (was: returns undefined)
├── services/
│   ├── issue-type.service.ts
│   └── issue-property.service.ts
├── store/
│   ├── root.store.ts                              # Extend CoreRootStore with our stores
│   ├── issue-type.store.ts
│   └── issue-property.store.ts
└── types/
    └── issue-types/
        ├── index.ts
        └── issue-property-values.d.ts             # TIssuePropertyValues (was: empty object)
```

### Backend: Separate Django App

Everything goes in `apps/api/plane/hw/`, a self-contained Django app. This is the critical difference from the technical-plan, which scattered files across upstream directories (`plane.db.models`, `plane.app.serializers`, `plane.app.views`).

```
apps/api/plane/hw/
├── __init__.py
├── apps.py
├── models/
│   ├── __init__.py
│   └── issue_property.py       # PropertyDefinition + PropertyValue (new tables)
├── serializers/
│   ├── __init__.py
│   ├── issue_type.py           # Serializers for existing IssueType/ProjectIssueType
│   └── issue_property.py       # Serializers for custom properties
├── views/
│   ├── __init__.py
│   ├── issue_type.py           # IssueType CRUD viewset
│   └── issue_property.py       # Property definition + value CRUD
├── urls/
│   ├── __init__.py
│   └── v1.py                   # All URL routes
└── migrations/
    └── 0001_initial.py         # Creates hw_* tables only
```

---

## Phase 1: IssueType API + Frontend

The model exists. We need CRUD endpoints and frontend UI.

### Backend: Serializers

`apps/api/plane/hw/serializers/issue_type.py`:

```python
from plane.app.serializers.base import BaseSerializer
from plane.db.models import IssueType
from plane.db.models.issue_type import ProjectIssueType


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
        ]
        read_only_fields = ["workspace"]


class ProjectIssueTypeSerializer(BaseSerializer):
    issue_type_detail = IssueTypeSerializer(source="issue_type", read_only=True)

    class Meta:
        model = ProjectIssueType
        fields = [
            "id",
            "project_id",
            "issue_type",
            "issue_type_detail",
            "is_default",
            "level",
        ]
        read_only_fields = ["project"]
```

Note: `ProjectIssueType` must be imported directly from `plane.db.models.issue_type` because it's not exported from `plane.db.models.__init__`.

### Backend: ViewSets

`apps/api/plane/hw/views/issue_type.py` -- follows the `StateViewSet` and `LabelViewSet` patterns exactly:

```python
from django.db import IntegrityError
from rest_framework.response import Response
from rest_framework import status

from plane.app.views.base import BaseViewSet
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IssueType, Issue, Workspace
from plane.db.models.issue_type import ProjectIssueType

from ..serializers import IssueTypeSerializer, ProjectIssueTypeSerializer


class IssueTypeViewSet(BaseViewSet):
    serializer_class = IssueTypeSerializer
    model = IssueType

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(is_active=True)
            .select_related("workspace")
            .order_by("level")
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = IssueTypeSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(workspace=workspace)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Issue type with this name already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        return Response(
            IssueTypeSerializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

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
        if Issue.objects.filter(type=issue_type).exists():
            return Response(
                {"error": "Cannot delete issue type with existing issues. Reassign first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectIssueTypeViewSet(BaseViewSet):
    serializer_class = ProjectIssueTypeSerializer
    model = ProjectIssueType

    def get_queryset(self):
        return (
            ProjectIssueType.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_type__is_active=True,
            )
            .select_related("issue_type")
            .order_by("level")
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = ProjectIssueTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        return Response(
            ProjectIssueTypeSerializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        self.get_queryset().get(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

### Backend: URL Routes

`apps/api/plane/hw/urls/v1.py`:

```python
from django.urls import path
from ..views import (
    IssueTypeViewSet,
    ProjectIssueTypeViewSet,
    PropertyDefinitionViewSet,
    IssuePropertyValueViewSet,
)

urlpatterns = [
    # Workspace-scoped issue type CRUD
    path(
        "workspaces/<str:slug>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="hw-workspace-issue-types",
    ),
    path(
        "workspaces/<str:slug>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="hw-workspace-issue-type",
    ),
    # Project-scoped issue type linking
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        ProjectIssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="hw-project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        ProjectIssueTypeViewSet.as_view({"delete": "destroy"}),
        name="hw-project-issue-type",
    ),
    # Property definitions (Phase 2, but routes defined here)
    path(
        "workspaces/<str:slug>/issue-property-definitions/",
        PropertyDefinitionViewSet.as_view({"get": "list", "post": "create"}),
        name="hw-property-definitions",
    ),
    path(
        "workspaces/<str:slug>/issue-property-definitions/<uuid:pk>/",
        PropertyDefinitionViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="hw-property-definition",
    ),
    # Issue property values
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/properties/",
        IssuePropertyValueViewSet.as_view({"get": "list", "post": "create"}),
        name="hw-issue-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/properties/<uuid:pk>/",
        IssuePropertyValueViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="hw-issue-property",
    ),
]
```

### Wiring into Plane

Two upstream files change:

**`apps/api/plane/settings/common.py`** -- add to INSTALLED_APPS:

```python
INSTALLED_APPS = [
    # ... existing apps ...
    "plane.hw",  # Hardware-aware PM extensions
]
```

**`apps/api/plane/app/urls/__init__.py`** -- add import and spread:

```python
from plane.hw.urls import v1 as hw_v1_urls

urlpatterns = [
    # ... existing patterns ...
    *hw_v1_urls.urlpatterns,
]
```

### Frontend: Service + Store + Components

**`hw/services/issue-type.service.ts`** -- API client following the `APIService` pattern:

```typescript
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@plane/services";

export interface IIssueType {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  logo_props: Record<string, unknown>;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
}

export interface IProjectIssueType {
  id: string;
  project_id: string;
  issue_type: string;
  issue_type_detail: IIssueType;
  is_default: boolean;
  level: number;
}

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listWorkspaceTypes(workspaceSlug: string): Promise<IIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/`)
      .then((res) => res?.data);
  }

  async createWorkspaceType(
    workspaceSlug: string,
    data: Partial<IIssueType>
  ): Promise<IIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-types/`, data)
      .then((res) => res?.data);
  }

  async updateWorkspaceType(
    workspaceSlug: string,
    typeId: string,
    data: Partial<IIssueType>
  ): Promise<IIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-types/${typeId}/`, data)
      .then((res) => res?.data);
  }

  async listProjectTypes(
    workspaceSlug: string,
    projectId: string
  ): Promise<IProjectIssueType[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`
    ).then((res) => res?.data);
  }

  async linkTypeToProject(
    workspaceSlug: string,
    projectId: string,
    data: { issue_type: string }
  ): Promise<IProjectIssueType> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`,
      data
    ).then((res) => res?.data);
  }
}
```

**`hw/store/issue-type.store.ts`** -- MobX store following `core/store/label.store.ts` pattern: observable map keyed by ID, actions for CRUD, computed getters filtered by project.

**`hw/store/root.store.ts`** -- extends the CE root store:

```typescript
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "../../ce/store/timeline";
import { TimeLineStore } from "../../ce/store/timeline";
import type { IIssueTypeStore } from "./issue-type.store";
import { IssueTypeStore } from "./issue-type.store";
import type { IIssuePropertyStore } from "./issue-property.store";
import { IssuePropertyStore } from "./issue-property.store";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  issueTypeStore: IIssueTypeStore;
  issuePropertyStore: IIssuePropertyStore;

  constructor() {
    super();
    this.timelineStore = new TimeLineStore(this);
    this.issueTypeStore = new IssueTypeStore(this);
    this.issuePropertyStore = new IssuePropertyStore(this);
  }
}
```

This file overrides the CE `root.store.ts` (which only adds `TimelineStore`). If upstream adds stores to `ce/root.store.ts`, we need to sync them here. This is the one file where the overlay pattern requires manual maintenance on every upstream sync.

**Component implementations** are standard React + MobX observer components. Each CE stub has a well-defined prop interface. The key ones for Phase 1:

- **`issue-type-select.tsx`** -- Searchable dropdown following `StateDropdown` pattern. Props from CE: `control` (react-hook-form), `projectId`, `disabled`, `variant`.
- **`issue-type-switcher.tsx`** -- In issue detail header. Dropdown allowing type change, calls `issueOperations.update()` with new `type_id`.
- **`filters/issue-types.tsx`** -- Checkbox list for filter panel. Follow any existing filter component (priority, state) as template.
- **`applied-filters/issue-types.tsx`** -- Filter chips with remove buttons. Follow `AppliedStateFilters` pattern.

### Seed Data

Default types: "Software", "PCB Design", "Mechanical Assembly", "Hardware General".

---

## Phase 2: Custom Properties Model + API

This is where the two source docs diverged most. The fork-plan proposed JSONB on existing models; the technical-plan proposed normalized tables in upstream directories. We take the technical-plan's data model and house it in the fork-plan's `hw/` Django app.

### Why normalized tables, not JSONB

The fork-plan argued JSONB was simpler and fine for 5-10 people. This is wrong even at that scale because:

1. "Show me all issues where PCB Revision = 3.2" requires `jsonb_extract_path_text` and can't use Django ORM's `.filter()` naturally
2. "Sort by part number" in the list view requires raw SQL or gnarly annotations
3. Validation lives in application code rather than schema constraints
4. The migration from JSONB to normalized when you inevitably need it is harder than starting normalized

Normalized tables in our own `hw_*` namespace add ~100 more lines of model code but save us from a painful migration later and give us ORM-native filtering from day one.

### Data Model

`apps/api/plane/hw/models/issue_property.py`:

```python
from django.db import models
from plane.db.models.base import BaseModel
from plane.db.models.project import ProjectBaseModel


class IssuePropertyDefinition(BaseModel):
    """Defines a custom property (e.g., 'PCB Revision', 'Part Number').
    Scoped to workspace, optionally scoped to an issue type."""

    PROPERTY_TYPES = [
        ("text", "Text"),
        ("number", "Number"),
        ("select", "Select"),
        ("multi_select", "Multi Select"),
        ("url", "URL"),
        ("date", "Date"),
        ("boolean", "Boolean"),
    ]

    workspace = models.ForeignKey(
        "db.Workspace",
        related_name="hw_property_definitions",
        on_delete=models.CASCADE,
    )
    issue_type = models.ForeignKey(
        "db.IssueType",
        related_name="hw_property_definitions",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    property_type = models.CharField(max_length=50, choices=PROPERTY_TYPES)
    options = models.JSONField(default=list, blank=True)
    is_required = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "hw_issue_property_definitions"
        ordering = ["sort_order"]
        verbose_name = "Issue Property Definition"
        verbose_name_plural = "Issue Property Definitions"

    def __str__(self):
        return f"{self.name} ({self.property_type})"


class IssuePropertyValue(ProjectBaseModel):
    """Stores the value of a custom property for a specific issue.
    One row per (issue, property_definition) pair."""

    issue = models.ForeignKey(
        "db.Issue",
        related_name="hw_property_values",
        on_delete=models.CASCADE,
    )
    property_definition = models.ForeignKey(
        IssuePropertyDefinition,
        related_name="values",
        on_delete=models.CASCADE,
    )
    value = models.JSONField(default=dict)

    class Meta:
        db_table = "hw_issue_property_values"
        unique_together = ["issue", "property_definition"]
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"

    def __str__(self):
        return f"{self.issue_id}:{self.property_definition.name}"
```

### Design rationale

- **Separate definition + value tables** rather than JSONB on existing Issue/IssueType models. Preserves filterability via Django ORM.
- **`issue_type` FK on definition is nullable** -- properties can be type-specific ("only show PCB Revision on PCB Design issues") or universal (null type = applies to all issues in workspace).
- **`value` as JSONField** on the value row gives flexibility for different types without multiple columns. The `property_type` on the definition tells frontend how to render and validate.
- **`options` as JSONField** on the definition stores dropdown choices for select/multi_select types.
- **All tables prefixed `hw_`** -- completely decoupled from upstream migrations. No cross-app migration dependency on specific upstream migration numbers.
- **Extends `ProjectBaseModel`** for values (inherits workspace/project scoping) and `BaseModel` for definitions (workspace-scoped only).

### Migration

`apps/api/plane/hw/migrations/0001_initial.py` -- creates two new tables: `hw_issue_property_definitions` and `hw_issue_property_values`. Zero modifications to upstream tables. The migration dependency is only on `db.__first__` (the initial migration of the db app), not on a specific numbered migration.

### Serializers

`apps/api/plane/hw/serializers/issue_property.py`:

```python
from rest_framework import serializers
from plane.app.serializers.base import BaseSerializer
from ..models import IssuePropertyDefinition, IssuePropertyValue


class PropertyDefinitionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyDefinition
        fields = [
            "id",
            "workspace_id",
            "issue_type",
            "name",
            "description",
            "property_type",
            "options",
            "is_required",
            "sort_order",
        ]
        read_only_fields = ["workspace"]


class IssuePropertyValueSerializer(BaseSerializer):
    property_definition_detail = PropertyDefinitionSerializer(
        source="property_definition", read_only=True
    )

    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue_id",
            "property_definition",
            "property_definition_detail",
            "value",
        ]
        read_only_fields = ["issue"]

    def validate(self, data):
        definition = data.get("property_definition") or self.instance.property_definition
        value = data.get("value", {})

        if definition.is_required and not value:
            raise serializers.ValidationError(
                {"value": f"'{definition.name}' is required."}
            )

        prop_type = definition.property_type
        raw = value.get("value")

        if raw is not None:
            if prop_type == "number" and not isinstance(raw, (int, float)):
                raise serializers.ValidationError(
                    {"value": f"'{definition.name}' must be a number."}
                )
            if prop_type == "select" and raw not in definition.options:
                raise serializers.ValidationError(
                    {"value": f"'{raw}' is not a valid option for '{definition.name}'."}
                )
            if prop_type == "boolean" and not isinstance(raw, bool):
                raise serializers.ValidationError(
                    {"value": f"'{definition.name}' must be true or false."}
                )

        return data
```

### ViewSets

`apps/api/plane/hw/views/issue_property.py` -- two viewsets:

- **`PropertyDefinitionViewSet`**: Workspace-scoped CRUD for defining custom properties. Admin-only create/update/delete, member-readable.
- **`IssuePropertyValueViewSet`**: Issue-scoped CRUD for setting values on specific issues. Bulk-create/update endpoint for setting multiple properties at once.

Follow the same patterns as `IssueTypeViewSet` above. The value viewset should also support a bulk endpoint (`POST` with a list of `{property_definition, value}` pairs) for the frontend to set all properties on an issue in one request.

### Frontend: Custom Properties UI

This is the most frontend work. Three stub replacements, a hook, new field components, and new stores/services.

**`hw/components/issues/issue-details/additional-properties.tsx`** -- the main sidebar section. Receives `workItemId`, `workItemTypeId`, `projectId`, `workspaceSlug`, `isEditable`. Called from `core/components/issues/issue-detail/sidebar.tsx` (~line 269).

Implementation: fetch property definitions for the issue's type from the store, fetch current values, render an appropriate input per property based on `property_type`. Use Plane's existing `@plane/ui` components. Each property gets an icon, label, and value/editor following the `SidebarPropertyListItem` pattern in `core/`.

**`hw/components/issues/issue-details/property-fields/`** -- individual field renderers:
- `text-field.tsx` (~60 lines)
- `number-field.tsx` (~60 lines)
- `select-field.tsx` (~80 lines)
- `url-field.tsx` (~70 lines)
- `date-field.tsx` (~70 lines)

**`hw/components/issues/issue-layouts/additional-properties.tsx`** -- compact value display for list/kanban views. Render as small pills or inline text.

**`hw/components/issues/issue-modal/modal-additional-properties.tsx`** -- property inputs in create/edit modal. Uses react-hook-form `control` prop.

**`hw/hooks/use-issue-properties.tsx`** -- fetches definitions for a given issue type + current values for a specific issue. Manages loading states and caching via the store.

**`hw/types/issue-types/issue-property-values.d.ts`** -- typed interfaces for definitions, values, and API response shapes.

**`hw/services/issue-property.service.ts`** -- API client for property definitions CRUD and issue property values CRUD.

**`hw/store/issue-property.store.ts`** -- MobX store: observable maps for definitions (keyed by ID, filterable by issue_type) and values (keyed by issue ID). Actions for CRUD.

### Predefined Property Schemas

Seed these for first-run:

**PCB Design:**
- PCB Revision (text, required)
- Part Number (text)
- Design Review Status (select: Not Started / In Review / Approved / Rejected, required, default: Not Started)
- Schematic Link (url)
- Component Count (number)

**Mechanical Assembly:**
- CAD File Link (url)
- Material (text)
- Weight (number)
- Revision (text, required)

**Software:**
- Branch (text)
- PR Link (url)

---

## Phase 3: KiCad Preview Pipeline

Orthogonal to the fork -- an external service interacting with Plane via REST API and webhooks.

### Architecture

```
KiCad commit -> GitHub webhook -> Sidecar service -> KiBot renders -> Plane API (comment with images)
```

The pipeline is inbound (git -> Plane), not outbound (Plane -> external), so it uses GitHub webhooks, not Plane's webhook system. Plane's outbound webhooks become useful later (e.g., "when issue transitions to Review, re-render all linked hardware files").

### Sidecar Service

A lightweight service that:

1. Receives GitHub webhooks on push events to hardware file paths
2. Extracts Plane issue IDs from commit messages (convention: `PROJ-42` or `[PROJ-42]`)
3. Triggers KiBot rendering (`kicad-cli` or KiBot -> SVG/PNG of schematics and PCB layouts)
4. Uploads renders to Plane via the `FileAsset` upload endpoint
5. Creates a comment on the linked issue with Markdown-embedded images

### GitHub Actions Workflow

```yaml
name: KiCad Preview Pipeline
on:
  push:
    paths:
      - 'hardware/electrical/**/*.kicad_sch'
      - 'hardware/electrical/**/*.kicad_pcb'

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: INTI-CMNB/KiBot@v2
        with:
          config: hardware/kicad/kibot.yaml
          dir: output
      - name: Post to Plane
        run: python sidecar/post_preview.py --issue-from-commit --renders output/
        env:
          PLANE_API_TOKEN: ${{ secrets.PLANE_API_TOKEN }}
          PLANE_BASE_URL: ${{ secrets.PLANE_BASE_URL }}
```

### Plane API for Posting Previews

```
POST /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/comments/
{
    "comment_html": "<p>Schematic updated in commit <a href=\"{commit_url}\">{short_sha}</a></p><img src=\"{rendered_url}\" alt=\"Power Stage Schematic Rev 3.2\" />"
}
```

Images uploaded via the asset endpoint first, then referenced in comment HTML.

### Altium and SolidWorks

- **Altium**: Altium 365 provides shareable web viewer URLs. No headless rendering. Integration is link cards and manual export.
- **SolidWorks**: Binary blobs, no meaningful git diffing, no headless rendering. Best path: STEP/STL export -> three.js thumbnail. Realistically, someone exports a screenshot and the pipeline attaches it. This is a workflow discipline problem, not a tooling problem.

The KiCad project will have a smoother preview experience than Altium. Keep expectations calibrated.

---

## Phase 4: AI Provider Config

### Backend: Update Model Lists and Add Native Anthropic SDK

The Anthropic provider in `apps/api/plane/app/views/external/base.py` lists models from the Claude 3 era. Currently `get_llm_response()` routes all providers through the OpenAI client -- this doesn't work reliably for Anthropic without their OpenAI-compatible endpoint.

Update the model list:

```python
class AnthropicProvider(LLMProvider):
    name = "Anthropic"
    models = [
        "claude-sonnet-4-5-20250929",
        "claude-haiku-4-5-20251001",
        "claude-sonnet-4-20250514",
        "claude-3-5-sonnet-20241022",
    ]
    default_model = "claude-sonnet-4-5-20250929"
```

Add native SDK routing in `get_llm_response()`:

```python
def get_llm_response(task, prompt, api_key, model, provider):
    final_text = task + "\n" + prompt
    try:
        if provider.lower() == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": final_text}],
            )
            return message.content[0].text, None
        else:
            if provider.lower() == "gemini":
                model = f"gemini/{model}"
            client = OpenAI(api_key=api_key)
            chat_completion = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": final_text}],
            )
            return chat_completion.choices[0].message.content, None
    except Exception as e:
        log_exception(e)
        error_type = e.__class__.__name__
        if error_type == "AuthenticationError":
            return None, f"Invalid API key for {provider}"
        elif error_type == "RateLimitError":
            return None, f"Rate limit exceeded for {provider}"
        else:
            return None, f"Error occurred while generating response from {provider}"
```

Add `anthropic` to `apps/api/requirements/base.txt`.

### Frontend: Provider Selection

For v1, just set `LLM_PROVIDER=anthropic` as an environment variable. The backend already reads env vars as fallback. The admin UI dropdown (in `apps/admin/app/(all)/(dashboard)/ai/form.tsx`) is nice-to-have but not critical -- the `ControllerInput` component may not support `select` type, and building a custom one isn't worth it for day one.

### Future: Custom LLM Backend

For Ollama, Letta, or a custom Rust service: add a new provider subclass and a routing case in `get_llm_response()`. The function signature is `(task, prompt, api_key, model, provider) -> (text, error)`. Drop-in replacement.

---

## Phase 5: Polish and Deploy

- Activity tracking for issue type changes and custom property changes
- Workspace admin UI for managing issue types and property schemas
- Seed data for first project
- Production deployment (Docker Compose with proper secrets, backups, SSL)
- Documentation for team onboarding

### Deployment Requirements

From CONTRIBUTING.md (verified):

- Docker Engine
- Node.js 20+ LTS
- Python 3.8+
- PostgreSQL 15
- Redis (Valkey) 7.2
- RabbitMQ 3.13
- MinIO (S3-compatible storage)
- **Minimum 12 GB RAM** (8 GB may crash during Docker builds)

### Our Additions to Docker Compose

- `sidecar` service for the preview pipeline
- Mount KiBot and kicad-cli in the sidecar container
- Configure `PLANE_API_TOKEN` for sidecar -> Plane API auth
- Configure `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` in `apps/api/.env`

Plane also provides an all-in-one community image at `deployments/aio/community/` that packages everything into a single container with supervisor. May be simpler for initial deployment.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TS path fallback doesn't work | Medium | Low-Medium | Copy all 280 ce/ files to hw/; more maintenance overhead than hoped but mechanically straightforward |
| Upstream changes `@/plane-web` interface contracts | Low | High | These contracts are shared with their own commercial edition; breaking them breaks their product |
| root.store.ts diverges from upstream ce/ version | Medium | Low | Manual sync on each upstream rebase -- file is 20 lines, changes are obvious |
| Plane upstream changes Django framework or DB | Very Low | Very High | Hard fork trigger; unlikely given 119+ migrations and stable architecture |
| 12 GB RAM requirement too high for deployment target | Medium | Medium | Use AIO community image; consider managed Postgres + Redis to reduce local memory |
| KiBot rendering fails on complex schematics | Low | Low | Fall back to manual screenshot attachment; preview pipeline is additive, not critical path |
| Upstream relicenses from AGPL-3.0 | Very Low | Very High | Hard fork trigger; AGPL is irrevocable for existing versions |
| ProjectIssueType unique constraint interactions with soft delete | Low | Medium | Test thoroughly; the existing constraint uses `deleted_at__isnull=True` condition |

---

## Key Files Reference

### Files We Modify (5 files, conflict surface on rebase)

| File | Change |
|------|--------|
| `apps/web/tsconfig.json` | Add `./hw/*` to path alias (one line) |
| `apps/api/plane/app/urls/__init__.py` | Import + spread our URL patterns (two lines) |
| `apps/api/plane/settings/common.py` | Add `plane.hw` to INSTALLED_APPS (one line) |
| `apps/api/plane/app/views/external/base.py` | Update LLM providers + add Anthropic SDK path |
| `apps/api/requirements/base.txt` | Add `anthropic` package (one line) |

### Files We Create (zero conflict, everything in new directories)

| Directory | Contents |
|-----------|----------|
| `apps/web/hw/` | ~25 frontend files: components, hooks, stores, services, types |
| `apps/api/plane/hw/` | ~12 backend files: models, views, serializers, URLs, migrations |
| `sidecar/` | Preview pipeline service + Plane API posting script |

### Existing Files We Reference but Don't Modify

| File | Why |
|------|-----|
| `apps/api/plane/db/models/issue_type.py` | IssueType model we build on top of |
| `apps/api/plane/db/models/issue.py` | Issue model with `type` FK (line 162) |
| `apps/api/plane/db/models/project.py` | `is_issue_type_enabled` flag (line 99) |
| `apps/api/plane/app/views/state/base.py` | Pattern template for ViewSet |
| `apps/web/core/components/issues/issue-detail/sidebar.tsx` | Where our sidebar component gets rendered (~line 269) |
| `apps/web/ce/store/root.store.ts` | CE root store we override (20 lines) |
