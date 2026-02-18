# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.hw.views import (
    AgentProfileViewSet,
    AgentRunViewSet,
    AgentRunActivityViewSet,
    AgentConversationViewSet,
    AgentConversationMessageViewSet,
)

urlpatterns = [
    # Agent profile CRUD
    path(
        "workspaces/<str:slug>/agents/",
        AgentProfileViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agents",
    ),
    path(
        "workspaces/<str:slug>/agents/<uuid:pk>/",
        AgentProfileViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="workspace-agent",
    ),
    # Agent runs
    path(
        "workspaces/<str:slug>/agent-runs/",
        AgentRunViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agent-runs",
    ),
    path(
        "workspaces/<str:slug>/agent-runs/<uuid:pk>/",
        AgentRunViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="workspace-agent-run",
    ),
    # Agent run activities
    path(
        "workspaces/<str:slug>/agent-runs/<uuid:run_id>/activities/",
        AgentRunActivityViewSet.as_view({"get": "list", "post": "create"}),
        name="agent-run-activities",
    ),
    # Agent conversations
    path(
        "workspaces/<str:slug>/agent-conversations/",
        AgentConversationViewSet.as_view({"get": "list", "post": "create"}),
        name="workspace-agent-conversations",
    ),
    path(
        "workspaces/<str:slug>/agent-conversations/<uuid:pk>/",
        AgentConversationViewSet.as_view({"get": "retrieve"}),
        name="workspace-agent-conversation",
    ),
    # Agent conversation messages
    path(
        "workspaces/<str:slug>/agent-conversations/<uuid:conversation_id>/messages/",
        AgentConversationMessageViewSet.as_view({"get": "list", "post": "create"}),
        name="agent-conversation-messages",
    ),
]
