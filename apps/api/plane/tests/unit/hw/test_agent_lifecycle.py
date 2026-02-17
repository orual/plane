# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from datetime import timedelta
from django.utils import timezone

from plane.hw.models import (
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
)
from plane.bgtasks.agent_lifecycle_task import (
    detect_stale_agent_runs,
    cleanup_ephemeral_activities,
)
from plane.tests.factories import (
    AgentRunFactory,
    AgentRunActivityFactory,
)


@pytest.mark.unit
class TestDetectStaleAgentRuns:
    """Test the detect_stale_agent_runs Celery task."""

    @pytest.mark.django_db
    def test_inactive_runs_marked_stale_after_timeout(self):
        """AC8.3 — Inactive runs are marked stale after timeout."""
        # Create a run that is in_progress with last activity 6 minutes ago
        run = AgentRunFactory(
            status=AgentRunStatus.IN_PROGRESS,
            stale_timeout=300,  # 5 minutes
        )
        run.last_activity_at = timezone.now() - timedelta(minutes=6)
        run.save()

        # Call the task
        detect_stale_agent_runs()

        # Verify the run is now marked stale
        run.refresh_from_db()
        assert run.status == AgentRunStatus.STALE

    @pytest.mark.django_db
    def test_not_yet_stale_runs_left_alone(self):
        """Not-yet-stale runs are left alone."""
        # Create a run that is in_progress with last activity 2 minutes ago
        run = AgentRunFactory(
            status=AgentRunStatus.IN_PROGRESS,
            stale_timeout=300,  # 5 minutes
        )
        run.last_activity_at = timezone.now() - timedelta(minutes=2)
        run.save()

        # Call the task
        detect_stale_agent_runs()

        # Verify the run is still in_progress
        run.refresh_from_db()
        assert run.status == AgentRunStatus.IN_PROGRESS

    @pytest.mark.django_db
    def test_custom_stale_timeout_respected(self):
        """Custom stale_timeout is respected."""
        # Create a run with a short timeout
        run = AgentRunFactory(
            status=AgentRunStatus.IN_PROGRESS,
            stale_timeout=60,  # 1 minute
        )
        run.last_activity_at = timezone.now() - timedelta(minutes=2)
        run.save()

        # Call the task
        detect_stale_agent_runs()

        # Verify the run is stale (2 min > 60s timeout)
        run.refresh_from_db()
        assert run.status == AgentRunStatus.STALE

    @pytest.mark.django_db
    def test_only_in_progress_runs_affected(self):
        """Only in_progress runs are affected."""
        # Create runs with different statuses but all with last_activity_at in the past
        past_time = timezone.now() - timedelta(hours=1)

        created_run = AgentRunFactory(status=AgentRunStatus.CREATED)
        created_run.last_activity_at = past_time
        created_run.save()

        completed_run = AgentRunFactory(status=AgentRunStatus.COMPLETED)
        completed_run.last_activity_at = past_time
        completed_run.save()

        failed_run = AgentRunFactory(status=AgentRunStatus.FAILED)
        failed_run.last_activity_at = past_time
        failed_run.save()

        # Call the task
        detect_stale_agent_runs()

        # Verify all statuses remain unchanged
        created_run.refresh_from_db()
        completed_run.refresh_from_db()
        failed_run.refresh_from_db()

        assert created_run.status == AgentRunStatus.CREATED
        assert completed_run.status == AgentRunStatus.COMPLETED
        assert failed_run.status == AgentRunStatus.FAILED

    @pytest.mark.django_db
    def test_stale_runs_resume_to_in_progress(self):
        """AC8.4 — Stale runs resume to in_progress when new activity is posted."""
        # Create a run with stale status
        run = AgentRunFactory(status=AgentRunStatus.STALE)

        # Verify that transition to in_progress is allowed
        run.validate_transition(AgentRunStatus.IN_PROGRESS)

        # Update status to in_progress
        run.status = AgentRunStatus.IN_PROGRESS
        run.save()

        # Verify the run is now in_progress
        run.refresh_from_db()
        assert run.status == AgentRunStatus.IN_PROGRESS


@pytest.mark.unit
class TestCleanupEphemeralActivities:
    """Test the cleanup_ephemeral_activities Celery task."""

    @pytest.mark.django_db
    def test_ephemeral_activities_cleaned_after_24h(self):
        """AC9.5 — Ephemeral activities are cleaned up after run completion (24h window)."""
        # Create a completed run from 25 hours ago
        run = AgentRunFactory(status=AgentRunStatus.COMPLETED)
        run.completed_at = timezone.now() - timedelta(hours=25)
        run.save()

        # Create activities
        ephemeral_thought = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.THOUGHT,
            is_ephemeral=True,
        )
        ephemeral_action = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.ACTION,
            is_ephemeral=True,
        )
        non_ephemeral_response = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            is_ephemeral=False,
        )
        non_ephemeral_error = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.ERROR,
            is_ephemeral=False,
        )

        # Call the task
        cleanup_ephemeral_activities()

        # Verify ephemeral activities are deleted
        assert not AgentRunActivity.objects.filter(id=ephemeral_thought.id).exists()
        assert not AgentRunActivity.objects.filter(id=ephemeral_action.id).exists()

        # Verify non-ephemeral activities still exist
        assert AgentRunActivity.objects.filter(id=non_ephemeral_response.id).exists()
        assert AgentRunActivity.objects.filter(id=non_ephemeral_error.id).exists()

    @pytest.mark.django_db
    def test_recently_completed_runs_not_cleaned(self):
        """Recently completed runs are not cleaned."""
        # Create a completed run from 12 hours ago
        run = AgentRunFactory(status=AgentRunStatus.COMPLETED)
        run.completed_at = timezone.now() - timedelta(hours=12)
        run.save()

        # Create ephemeral activities
        activity1 = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.THOUGHT,
            is_ephemeral=True,
        )
        activity2 = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.ACTION,
            is_ephemeral=True,
        )

        # Call the task
        cleanup_ephemeral_activities()

        # Verify activities still exist (within 24h window)
        assert AgentRunActivity.objects.filter(id=activity1.id).exists()
        assert AgentRunActivity.objects.filter(id=activity2.id).exists()

    @pytest.mark.django_db
    def test_failed_stopped_runs_also_cleaned(self):
        """Failed/stopped runs are also cleaned."""
        # Create a failed run from 25 hours ago
        failed_run = AgentRunFactory(status=AgentRunStatus.FAILED)
        failed_run.completed_at = timezone.now() - timedelta(hours=25)
        failed_run.save()

        # Create a stopped run from 25 hours ago
        stopped_run = AgentRunFactory(status=AgentRunStatus.STOPPED)
        stopped_run.completed_at = timezone.now() - timedelta(hours=25)
        stopped_run.save()

        # Create ephemeral activities in both runs
        failed_activity = AgentRunActivityFactory(
            run=failed_run,
            activity_type=AgentActivityType.THOUGHT,
            is_ephemeral=True,
        )
        stopped_activity = AgentRunActivityFactory(
            run=stopped_run,
            activity_type=AgentActivityType.ACTION,
            is_ephemeral=True,
        )

        # Call the task
        cleanup_ephemeral_activities()

        # Verify ephemeral activities in both terminal runs are deleted
        assert not AgentRunActivity.objects.filter(id=failed_activity.id).exists()
        assert not AgentRunActivity.objects.filter(id=stopped_activity.id).exists()

    @pytest.mark.django_db
    def test_in_progress_runs_not_cleaned(self):
        """In-progress runs are not cleaned."""
        # Create an in_progress run (no completed_at)
        run = AgentRunFactory(status=AgentRunStatus.IN_PROGRESS)
        # Ensure completed_at is None
        run.completed_at = None
        run.save()

        # Create ephemeral activities
        activity1 = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.THOUGHT,
            is_ephemeral=True,
        )
        activity2 = AgentRunActivityFactory(
            run=run,
            activity_type=AgentActivityType.ACTION,
            is_ephemeral=True,
        )

        # Call the task
        cleanup_ephemeral_activities()

        # Verify activities still exist
        assert AgentRunActivity.objects.filter(id=activity1.id).exists()
        assert AgentRunActivity.objects.filter(id=activity2.id).exists()
