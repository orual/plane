# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Agent conversation API views.

Provides endpoints for agent conversations and messages:
- Conversation CRUD and listing
- Message creation with automatic agent task dispatch
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views import BaseViewSet
from plane.authentication.session import BaseSessionAuthentication
from plane.bgtasks.builtin_agent_task import builtin_agent_execute_task
from plane.db.models import Workspace
from plane.hw.models import (
    AgentConversation,
    AgentConversationMessage,
    AgentConversationMessageRole,
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    AgentType,
)
from plane.hw.serializers import (
    AgentConversationSerializer,
    AgentConversationMessageSerializer,
)


class AgentConversationViewSet(BaseViewSet):
    """Workspace-scoped agent conversation management."""

    serializer_class = AgentConversationSerializer
    model = AgentConversation
    authentication_classes = [BaseSessionAuthentication]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"), user=self.request.user)
            .select_related("workspace", "user")
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug):
        """List user's conversations in the workspace."""
        queryset = self.get_queryset()
        serializer = AgentConversationSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        """Get conversation with messages."""
        conversation = self.get_queryset().get(pk=pk)
        serializer = AgentConversationSerializer(conversation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        """Create a new conversation."""
        workspace = Workspace.objects.get(slug=slug)

        # Validate input
        serializer = AgentConversationSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Create conversation with current user
            conversation = AgentConversation.objects.create(
                workspace=workspace,
                user=request.user,
                title=serializer.validated_data.get("title", ""),
            )

            response_serializer = AgentConversationSerializer(conversation)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class AgentConversationMessageViewSet(BaseViewSet):
    """Message creation and listing for agent conversations."""

    serializer_class = AgentConversationMessageSerializer
    model = AgentConversationMessage
    authentication_classes = [BaseSessionAuthentication]

    def get_queryset(self):
        conversation_id = self.kwargs.get("conversation_id")
        return (
            super()
            .get_queryset()
            .filter(
                conversation_id=conversation_id,
                conversation__workspace__slug=self.kwargs.get("slug"),
                conversation__user=self.request.user,
            )
            .select_related("conversation", "run")
            .order_by("created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def list(self, request, slug, conversation_id):
        """List messages in a conversation."""
        queryset = self.get_queryset()
        serializer = AgentConversationMessageSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug, conversation_id):
        """Send a message and dispatch agent task.

        Creates a user message and automatically dispatches the built-in agent
        task to process the request. The agent task will create the assistant
        response message when it completes.
        """
        # Get the conversation and verify ownership
        try:
            conversation = AgentConversation.objects.select_related("workspace").get(
                id=conversation_id, workspace__slug=slug, user=request.user
            )
        except AgentConversation.DoesNotExist:
            return Response(
                {"error": "Conversation not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate input
        serializer = AgentConversationMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user_message_content = serializer.validated_data.get("content", "")
        if not user_message_content:
            return Response(
                {"error": "Message content is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Create user message
            user_message = AgentConversationMessage.objects.create(
                conversation=conversation,
                role=AgentConversationMessageRole.USER,
                content=user_message_content,
            )

            # Find the workspace's built-in agent profile
            try:
                builtin_agent = AgentProfile.objects.get(
                    workspace=conversation.workspace,
                    agent_type=AgentType.BUILTIN,
                    is_active=True,
                )
            except AgentProfile.DoesNotExist:
                return Response(
                    {"error": "Built-in agent not found or not active"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Create agent run linked to the conversation
            run = AgentRun.objects.create(
                agent=builtin_agent,
                workspace=conversation.workspace,
                created_by=request.user,
                status=AgentRunStatus.CREATED,
                conversation=conversation,
            )

            # Build previous conversation messages for context
            previous_messages = []
            previous_message_records = (
                AgentConversationMessage.objects.filter(
                    conversation=conversation,
                )
                .exclude(id=user_message.id)
                .select_related("run")
                .order_by("created_at")
            )

            for msg in previous_message_records:
                previous_messages.append(
                    {
                        "role": msg.role,
                        "content": msg.content,
                    }
                )

            # Dispatch agent task
            builtin_agent_execute_task.delay(
                run_id=str(run.id),
                trigger_type="conversation",
                user_message=user_message_content,
                conversation_messages=previous_messages if previous_messages else None,
            )

            # Return the created user message and run ID
            return Response(
                {
                    "message": AgentConversationMessageSerializer(user_message).data,
                    "run_id": str(run.id),
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
