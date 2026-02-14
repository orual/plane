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
        PropertyDefinitionViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-property-definition",
    ),
    # Issue-scoped property value CRUD
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/",
        IssuePropertyValueViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-property-values",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/bulk-upsert/",
        IssuePropertyValueViewSet.as_view({"put": "bulk_upsert"}),
        name="issue-property-values-bulk-upsert",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/property-values/<uuid:pk>/",
        IssuePropertyValueViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-property-value",
    ),
]
