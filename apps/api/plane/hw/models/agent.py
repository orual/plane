# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.db import models
from django.utils import timezone

from plane.db.models import BaseModel


class AgentRunStatus(models.TextChoices):
    CREATED = "created", "Created"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    STOPPED = "stopped", "Stopped"
    STALE = "stale", "Stale"


class AgentActivityType(models.TextChoices):
    THOUGHT = "thought", "Thought"
    ACTION = "action", "Action"
    RESPONSE = "response", "Response"
    ELICITATION = "elicitation", "Elicitation"
    ERROR = "error", "Error"


class AgentType(models.TextChoices):
    EXTERNAL = "external"
    BUILTIN = "builtin"


VALID_STATUS_TRANSITIONS = {
    AgentRunStatus.CREATED: {AgentRunStatus.IN_PROGRESS, AgentRunStatus.FAILED, AgentRunStatus.STOPPED},
    AgentRunStatus.IN_PROGRESS: {
        AgentRunStatus.COMPLETED,
        AgentRunStatus.FAILED,
        AgentRunStatus.STOPPED,
        AgentRunStatus.STALE,
    },
    AgentRunStatus.STALE: {AgentRunStatus.IN_PROGRESS, AgentRunStatus.FAILED, AgentRunStatus.STOPPED},
    AgentRunStatus.COMPLETED: set(),
    AgentRunStatus.FAILED: set(),
    AgentRunStatus.STOPPED: set(),
}


class AgentProfile(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_profile",
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_agents",
    )
    webhook_url = models.URLField(max_length=1024, blank=True, default="")
    webhook_secret = models.CharField(max_length=255, default="")
    event_triggers = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    agent_type = models.CharField(
        max_length=20,
        choices=AgentType.choices,
        default=AgentType.EXTERNAL,
    )

    class Meta:
        db_table = "hw_agent_profiles"
        unique_together = [("workspace", "display_name")]

    def __str__(self):
        return f"{self.display_name} ({self.workspace.slug})"


class AgentRun(BaseModel):
    agent = models.ForeignKey(
        AgentProfile,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_runs",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="agent_runs",
        null=True,
        blank=True,
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="agent_runs",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=AgentRunStatus.choices,
        default=AgentRunStatus.CREATED,
    )
    stale_timeout = models.IntegerField(default=300)
    last_activity_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    trigger_metadata = models.JSONField(default=dict)
    conversation = models.ForeignKey(
        "hw.AgentConversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="runs",
    )

    class Meta:
        db_table = "hw_agent_runs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} ({self.status})"

    def validate_transition(self, new_status):
        """Validate that a status transition is allowed."""
        allowed = VALID_STATUS_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from '{self.status}' to '{new_status}'. "
                f"Allowed transitions: {', '.join(s.value for s in allowed) or 'none'}"
            )

    def save(self, *args, **kwargs):
        """Enforce status transition validation on save."""
        if self.pk:
            try:
                old = AgentRun.objects.only("status").get(pk=self.pk)
                if old.status != self.status:
                    allowed = VALID_STATUS_TRANSITIONS.get(old.status, set())
                    if self.status not in allowed:
                        raise ValueError(
                            f"Cannot transition from '{old.status}' to '{self.status}'. "
                            f"Allowed transitions: {', '.join(s.value for s in allowed) or 'none'}"
                        )
            except AgentRun.DoesNotExist:
                pass
        super().save(*args, **kwargs)


class AgentRunActivity(BaseModel):
    run = models.ForeignKey(
        AgentRun,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    activity_type = models.CharField(
        max_length=20,
        choices=AgentActivityType.choices,
    )
    content = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict)
    is_ephemeral = models.BooleanField(default=False)

    class Meta:
        db_table = "hw_agent_run_activities"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.activity_type} in run {self.run_id}"

    def save(self, *args, **kwargs):
        # AC9.1: Thoughts and actions are always ephemeral by design.
        # This override is intentional — callers cannot opt out.
        if self.activity_type in (AgentActivityType.THOUGHT, AgentActivityType.ACTION):
            self.is_ephemeral = True
        super().save(*args, **kwargs)


class AgentConversation(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="agent_conversations",
    )
    user = models.ForeignKey(
        "db.User",
        on_delete=models.CASCADE,
        related_name="agent_conversations",
    )
    title = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "hw_agent_conversations"
        ordering = ["-created_at"]


class AgentConversationMessageRole(models.TextChoices):
    USER = "user"
    ASSISTANT = "assistant"


class AgentConversationMessage(BaseModel):
    conversation = models.ForeignKey(
        AgentConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(
        max_length=20,
        choices=AgentConversationMessageRole.choices,
    )
    content = models.TextField()
    run = models.ForeignKey(
        AgentRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversation_messages",
    )

    class Meta:
        db_table = "hw_agent_conversation_messages"
        ordering = ["created_at"]
