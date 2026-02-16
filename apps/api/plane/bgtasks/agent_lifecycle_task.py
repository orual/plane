# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
from datetime import timedelta

# Django imports
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.hw.models import AgentRun, AgentRunActivity, AgentRunStatus
from plane.utils.exception_logger import log_exception


logger = logging.getLogger("plane.worker")

TERMINAL_STATUSES = (
    AgentRunStatus.COMPLETED,
    AgentRunStatus.FAILED,
    AgentRunStatus.STOPPED,
)


@shared_task
def detect_stale_agent_runs():
    """Mark in_progress agent runs as stale when no activity within stale_timeout.

    Runs every minute via Celery beat. Each run has its own stale_timeout
    (default 300 seconds). A run is stale when:
    - status is 'in_progress'
    - last_activity_at + stale_timeout < now
    """
    try:
        now = timezone.now()
        in_progress_runs = AgentRun.objects.filter(
            status=AgentRunStatus.IN_PROGRESS,
        )

        stale_run_ids = []
        for run in in_progress_runs.only("id", "last_activity_at", "stale_timeout"):
            threshold = run.last_activity_at + timedelta(seconds=run.stale_timeout)
            if now > threshold:
                stale_run_ids.append(run.id)

        if stale_run_ids:
            updated = AgentRun.objects.filter(
                id__in=stale_run_ids,
                status=AgentRunStatus.IN_PROGRESS,
            ).update(status=AgentRunStatus.STALE)
            logger.info(f"Marked {updated} agent runs as stale")
    except Exception as e:
        log_exception(e, warning=True)
        logger.error(f"Failed to detect stale agent runs: {e}")


@shared_task
def cleanup_ephemeral_activities():
    """Delete ephemeral activities from completed runs older than 24 hours.

    Runs hourly via Celery beat. Cleans up thought and action activities
    (is_ephemeral=True) from runs in terminal states (completed, failed,
    stopped) where completed_at is more than 24 hours ago.
    """
    try:
        cutoff = timezone.now() - timedelta(hours=24)
        deleted_count, _ = AgentRunActivity.objects.filter(
            is_ephemeral=True,
            run__status__in=TERMINAL_STATUSES,
            run__completed_at__isnull=False,
            run__completed_at__lt=cutoff,
        ).delete()

        if deleted_count:
            logger.info(f"Cleaned up {deleted_count} ephemeral agent activities")
    except Exception as e:
        log_exception(e, warning=True)
        logger.error(f"Failed to clean up ephemeral activities: {e}")
