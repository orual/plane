# HW AI Infrastructure Implementation Plan — Phase 8

**Goal:** Automated lifecycle management for agent runs — stale detection and ephemeral activity cleanup.

**Architecture:** Two Celery beat tasks in `plane.bgtasks.agent_lifecycle_task`. Stale detection runs every minute, marking `in_progress` runs as `stale` when no activity has been posted within the run's `stale_timeout` window. Ephemeral cleanup runs hourly, deleting `is_ephemeral=True` activities from terminal runs older than 24 hours. Both tasks are registered in `apps/api/plane/celery.py` beat schedule and the module is added to `CELERY_IMPORTS` in `apps/api/plane/settings/common.py`.

**Tech Stack:** Python, Django 4.2, Celery 5.4, pytest

**Scope:** 8 phases from original design (phase 8 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC8: Agent run lifecycle works
- **hw-ai-infra.AC8.3 Success:** Inactive runs are marked `stale` after timeout (default 5 minutes)
- **hw-ai-infra.AC8.4 Success:** Stale runs resume to `in_progress` when new activity is posted

### hw-ai-infra.AC9: Activity system works
- **hw-ai-infra.AC9.5 Success:** Ephemeral activities are cleaned up after run completion (24h window)

---

<!-- START_TASK_1 -->
### Task 1: Create agent lifecycle background tasks

**Verifies:** hw-ai-infra.AC8.3, hw-ai-infra.AC9.5

**Files:**
- Create: `apps/api/plane/bgtasks/agent_lifecycle_task.py`

**Implementation:**

Create the file following the patterns from `apps/api/plane/bgtasks/cleanup_task.py`:

```python
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
```

**Verification:**

Run: `cd apps/api && python -c "from plane.bgtasks.agent_lifecycle_task import detect_stale_agent_runs, cleanup_ephemeral_activities; print('OK')"`
Expected: Imports successfully

**Commit:** `feat: add agent lifecycle background tasks for stale detection and ephemeral cleanup`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Register beat schedule and celery imports

**Files:**
- Modify: `apps/api/plane/celery.py` (add two beat schedule entries)
- Modify: `apps/api/plane/settings/common.py` (add to `CELERY_IMPORTS`)

**Implementation:**

**`apps/api/plane/celery.py`** — add two entries to the existing `app.conf.beat_schedule` dict, after the existing "Intra day recurring jobs" section and before the "Occurs once every day" section:

```python
    # Agent lifecycle management
    "check-every-minute-for-stale-agent-runs": {
        "task": "plane.bgtasks.agent_lifecycle_task.detect_stale_agent_runs",
        "schedule": crontab(minute="*/1"),  # Every minute
    },
    "check-every-hour-for-ephemeral-activity-cleanup": {
        "task": "plane.bgtasks.agent_lifecycle_task.cleanup_ephemeral_activities",
        "schedule": crontab(minute=0),  # Every hour at :00
    },
```

**`apps/api/plane/settings/common.py`** — add to the `CELERY_IMPORTS` tuple at the end, before the closing `)`:

```python
    # agent lifecycle tasks
    "plane.bgtasks.agent_lifecycle_task",
```

**Verification:**

Run: `cd apps/api && python -c "from plane.celery import app; schedule = app.conf.beat_schedule; assert 'check-every-minute-for-stale-agent-runs' in schedule; assert 'check-every-hour-for-ephemeral-activity-cleanup' in schedule; print('OK')"`
Expected: `OK`

**Commit:** `feat: register agent lifecycle tasks in celery beat schedule`
<!-- END_TASK_2 -->

<!-- START_SUBCOMPONENT_A (tasks 3-4) -->

<!-- START_TASK_3 -->
### Task 3: Write unit tests for stale detection

**Verifies:** hw-ai-infra.AC8.3, hw-ai-infra.AC8.4

**Files:**
- Create: `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py`

**Testing:**

Test the `detect_stale_agent_runs` task with these scenarios:

**AC8.3 — Inactive runs are marked stale after timeout:**

1. Create an `AgentRun` with `status=IN_PROGRESS`, `stale_timeout=300`, `last_activity_at` set to 6 minutes ago
2. Call `detect_stale_agent_runs()`
3. Refresh from DB and assert `status == STALE`

**Not-yet-stale runs are left alone:**

1. Create an `AgentRun` with `status=IN_PROGRESS`, `stale_timeout=300`, `last_activity_at` set to 2 minutes ago
2. Call `detect_stale_agent_runs()`
3. Refresh from DB and assert `status == IN_PROGRESS`

**Custom stale_timeout is respected:**

1. Create an `AgentRun` with `status=IN_PROGRESS`, `stale_timeout=60`, `last_activity_at` set to 2 minutes ago
2. Call `detect_stale_agent_runs()`
3. Refresh from DB and assert `status == STALE` (2 min > 60s timeout)

**Only in_progress runs are affected:**

1. Create runs with `status=CREATED`, `status=COMPLETED`, `status=FAILED`, each with `last_activity_at` well past their timeout
2. Call `detect_stale_agent_runs()`
3. Refresh all from DB and assert statuses unchanged

**AC8.4 — Stale runs resume when new activity is posted:**

This AC is actually implemented in Phase 5 Task 3 (`AgentRunActivityViewSet.create` auto-transitions `stale` → `in_progress` when a new activity is posted). Test it at the model level here:

1. Create an `AgentRun` with `status=STALE`
2. Call `run.validate_transition(AgentRunStatus.IN_PROGRESS)` — should not raise
3. Update status to `IN_PROGRESS` — should succeed

Use `@pytest.mark.unit` and `@pytest.mark.django_db`. Create the required `User` (bot), `Workspace`, `AgentProfile`, and `AgentRun` objects using factories or direct creation following existing test patterns in `apps/api/plane/tests/unit/hw/`.

Use `django.utils.timezone.now() - timedelta(...)` to set `last_activity_at` to specific past times. Since `last_activity_at` uses `default=timezone.now` (not `auto_now_add`), you can set it directly: `run.last_activity_at = timezone.now() - timedelta(minutes=6); run.save()`, or use `AgentRun.objects.filter(pk=run.pk).update(last_activity_at=...)` for bulk updates.

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `test: add unit tests for agent stale detection`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Write unit tests for ephemeral cleanup

**Verifies:** hw-ai-infra.AC9.5

**Files:**
- Modify: `apps/api/plane/tests/unit/hw/test_agent_lifecycle.py`

**Testing:**

Add tests for the `cleanup_ephemeral_activities` task:

**AC9.5 — Ephemeral activities are cleaned up after run completion (24h window):**

1. Create an `AgentRun` with `status=COMPLETED`, `completed_at` set to 25 hours ago
2. Create `AgentRunActivity` records:
   - One with `is_ephemeral=True`, `activity_type="thought"`
   - One with `is_ephemeral=True`, `activity_type="action"`
   - One with `is_ephemeral=False`, `activity_type="response"`
   - One with `is_ephemeral=False`, `activity_type="error"`
3. Call `cleanup_ephemeral_activities()`
4. Assert the two ephemeral activities are deleted
5. Assert the two non-ephemeral activities still exist

**Recently completed runs are not cleaned:**

1. Create an `AgentRun` with `status=COMPLETED`, `completed_at` set to 12 hours ago
2. Create ephemeral activities
3. Call `cleanup_ephemeral_activities()`
4. Assert all activities still exist (within 24h window)

**Failed/stopped runs are also cleaned:**

1. Create an `AgentRun` with `status=FAILED`, `completed_at` set to 25 hours ago
2. Create ephemeral activities
3. Call `cleanup_ephemeral_activities()`
4. Assert ephemeral activities are deleted

**In-progress runs are not cleaned:**

1. Create an `AgentRun` with `status=IN_PROGRESS` (no `completed_at`)
2. Create ephemeral activities
3. Call `cleanup_ephemeral_activities()`
4. Assert all activities still exist

Use `@pytest.mark.unit` and `@pytest.mark.django_db`.

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: All tests pass

**Commit:** `test: add unit tests for ephemeral activity cleanup`
<!-- END_TASK_4 -->

<!-- END_SUBCOMPONENT_A -->
