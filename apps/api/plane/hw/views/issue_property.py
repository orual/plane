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
