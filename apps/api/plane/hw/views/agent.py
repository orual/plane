# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views import BaseViewSet
from plane.db.models import APIToken, User, Workspace, IssueComment
from plane.db.models.user import BotTypeEnum
from plane.hw.models import (
    AgentProfile,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
)
from plane.hw.serializers import (
    AgentProfileSerializer,
    AgentProfileCreateSerializer,
    AgentRunSerializer,
    AgentRunActivitySerializer,
)


class AgentProfileViewSet(BaseViewSet):
    """Workspace-scoped agent profile management with bot user registration."""

    serializer_class = AgentProfileSerializer
    model = AgentProfile

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("user", "workspace")
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()
        serializer = AgentProfileSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        agent = self.get_queryset().get(pk=pk)
        serializer = AgentProfileSerializer(agent)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        # Validate input with create serializer
        serializer = AgentProfileCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # Create bot user
                bot_user = User.objects.create(
                    username=f"agent_{uuid.uuid4().hex}",
                    email=f"agent_{uuid.uuid4().hex}@agent.internal",
                    display_name=serializer.validated_data["display_name"],
                    is_bot=True,
                    bot_type=BotTypeEnum.AGENT,
                    password=make_password(uuid.uuid4().hex),
                    is_password_autoset=True,
                )

                # Create agent profile
                agent_profile = AgentProfile.objects.create(
                    user=bot_user,
                    workspace=workspace,
                    display_name=serializer.validated_data["display_name"],
                    description=serializer.validated_data.get("description", ""),
                    webhook_url=serializer.validated_data.get("webhook_url", ""),
                    webhook_secret=serializer.validated_data.get("webhook_secret", ""),
                    event_triggers=serializer.validated_data.get("event_triggers", {}),
                )

                # Create API token
                api_token = APIToken.objects.create(
                    label=f"agent-{agent_profile.display_name}",
                    user=bot_user,
                    workspace=workspace,
                    user_type=1,
                    is_service=True,
                )

                # Return profile data plus token (only visible on creation)
                response_serializer = AgentProfileSerializer(agent_profile)
                response_data = response_serializer.data
                response_data["api_token"] = api_token.token

                return Response(response_data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        agent = self.get_queryset().get(pk=pk)
        serializer = AgentProfileSerializer(agent, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        agent = self.get_queryset().get(pk=pk)
        agent.is_active = False
        agent.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentRunViewSet(BaseViewSet):
    """Workspace-scoped run lifecycle management."""

    serializer_class = AgentRunSerializer
    model = AgentRun

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("agent", "workspace", "project", "issue")
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        queryset = self.get_queryset()

        # Optional filtering by agent_id or issue_id
        agent_id = request.query_params.get("agent_id")
        issue_id = request.query_params.get("issue_id")

        if agent_id:
            queryset = queryset.filter(agent_id=agent_id)
        if issue_id:
            queryset = queryset.filter(issue_id=issue_id)

        serializer = AgentRunSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        run = self.get_queryset().get(pk=pk)
        serializer = AgentRunSerializer(run)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        """Create a new run. Requires authentication (agent token or user)."""
        workspace = Workspace.objects.get(slug=slug)

        # Validate input
        serializer = AgentRunSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Validate agent exists and is active
        agent_id = serializer.validated_data.get("agent_id")
        if not agent_id:
            return Response(
                {"error": "agent_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            agent = AgentProfile.objects.get(id=agent_id, workspace=workspace)
            if not agent.is_active:
                return Response(
                    {"error": "Agent is not active"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except AgentProfile.DoesNotExist:
            return Response(
                {"error": "Agent not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Create run
        try:
            run = AgentRun.objects.create(
                agent=agent,
                workspace=workspace,
                project_id=serializer.validated_data.get("project_id"),
                issue_id=serializer.validated_data.get("issue_id"),
                status=AgentRunStatus.CREATED,
                trigger_metadata=serializer.validated_data.get("trigger_metadata", {}),
            )

            response_serializer = AgentRunSerializer(run)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, slug, pk):
        """Update run status with validation. Requires authentication."""
        run = self.get_queryset().get(pk=pk)

        # Check if agent is active
        if not run.agent.is_active:
            return Response(
                {"error": "Agent is not active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Prepare update data
        update_data = dict(request.data)

        # If updating status, validate transition
        if "status" in update_data:
            new_status = update_data["status"]
            try:
                run.validate_transition(new_status)
            except ValueError as e:
                return Response(
                    {"error": str(e)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # If transitioning to terminal state, set completed_at
            if new_status in (
                AgentRunStatus.COMPLETED,
                AgentRunStatus.FAILED,
                AgentRunStatus.STOPPED,
            ):
                if "completed_at" not in update_data:
                    update_data["completed_at"] = timezone.now()

        serializer = AgentRunSerializer(run, data=update_data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AgentRunActivityViewSet(BaseViewSet):
    """Activity posting and retrieval for agent runs."""

    serializer_class = AgentRunActivitySerializer
    model = AgentRunActivity

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(run_id=self.kwargs.get("run_id"), run__workspace__slug=self.kwargs.get("slug"))
            .select_related("run", "run__agent")
            .order_by("created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug, run_id):
        queryset = self.get_queryset()
        serializer = AgentRunActivitySerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug, run_id):
        """Post new activity. Auto-creates IssueComment for response activities."""
        # Get the run
        try:
            run = AgentRun.objects.select_related("agent", "issue").get(
                id=run_id, workspace__slug=slug
            )
        except AgentRun.DoesNotExist:
            return Response(
                {"error": "Run not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check agent is active
        if not run.agent.is_active:
            return Response(
                {"error": "Agent is not active"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check run is in active state
        if run.status not in (
            AgentRunStatus.CREATED,
            AgentRunStatus.IN_PROGRESS,
            AgentRunStatus.STALE,
        ):
            return Response(
                {"error": f"Cannot post activity to run in {run.status} status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-transition if needed
        if run.status in (AgentRunStatus.CREATED, AgentRunStatus.STALE):
            run.status = AgentRunStatus.IN_PROGRESS
            run.save()

        # Create activity
        serializer = AgentRunActivitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=serializer.validated_data.get("activity_type"),
                content=serializer.validated_data.get("content", ""),
                metadata=serializer.validated_data.get("metadata", {}),
            )

            # Update run's last_activity_at
            run.last_activity_at = timezone.now()
            run.save(update_fields=["last_activity_at"])

            # Auto-create IssueComment for response activities
            if activity.activity_type == AgentActivityType.RESPONSE and run.issue_id:
                IssueComment.objects.create(
                    comment_stripped=activity.content,
                    comment_html=f"<p>{activity.content}</p>",
                    comment_json={
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": activity.content}],
                            }
                        ],
                    },
                    project_id=run.project_id,
                    issue_id=run.issue_id,
                    actor=run.agent.user,
                    external_source="agent",
                    external_id=f"{run.id}:{activity.id}",
                )

            response_serializer = AgentRunActivitySerializer(activity)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
