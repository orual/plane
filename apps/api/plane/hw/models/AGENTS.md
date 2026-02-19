# HW agent infrastructure models

Last verified: 2026-02-18

## Purpose

Provides the data model for external AI agents that interact with Plane
through API tokens and webhooks. Agents register as bot users, execute
lifecycle-tracked runs scoped to workspaces/projects/issues, and post
activity streams that auto-create issue comments for response activities.
Supports both external webhook-based agents and built-in agents via the new
conversation grouping and agent type system.

## Contracts

- **Exposes**: `AgentProfile`, `AgentRun`, `AgentRunActivity`,
  `AgentRunStatus`, `AgentActivityType`, `AgentType`, `AgentConversation`,
  `AgentConversationMessage`, `AgentConversationMessageRole`,
  `VALID_STATUS_TRANSITIONS`
- **Guarantees**:
  - Status transitions are enforced in `AgentRun.save()` via
    `VALID_STATUS_TRANSITIONS`. Invalid transitions raise `ValueError`.
  - Terminal states (`completed`, `failed`, `stopped`) are absorbing --
    no transitions out.
  - `stale` can recover to `in_progress` (auto-transitions on new
    activity posting).
  - `AgentRunActivity.save()` forces `is_ephemeral=True` for `thought`
    and `action` types. Callers cannot opt out.
  - `AgentProfile` has a unique constraint on `(workspace, display_name)`.
  - Each `AgentProfile` has exactly one `User` (`bot_type=AGENT`) and
    one `WorkspaceMember` (admin role) created atomically.
  - `AgentProfile.agent_type` defaults to "external" for backward compatibility.
  - `AgentConversationMessage` are ordered by `created_at` ascending.
  - `AgentConversation` are ordered by `created_at` descending.
  - Built-in agents are seeded automatically per workspace via `workspace_seed_task`.
- **Expects**: Valid workspace, project, and issue foreign keys.

## Agent types

`AgentType` enum distinguishes between external and built-in agents:

- `EXTERNAL` (default): Traditional webhook-based agents that register
  external endpoints and respond to triggers like issue creation/updates.
- `BUILTIN`: Built-in AI agents that are automatically seeded per workspace
  and do not require webhook configuration.

Built-in agents:

- Cannot be deleted (automatically maintained per workspace)
- Are automatically created with `agent_type="builtin"` on workspace seed
- Have `is_active=True` by default
- Have unique bot users with `bot_type=AGENT`
- Cannot be created via the external agent API (admin-only)

## Status state machine

```
created --> in_progress --> completed
  |             |   ^          (terminal)
  |             |   |
  |             v   |
  |           stale -+-> failed (terminal)
  |             |
  v             v
failed       stopped (terminal)
stopped
```

## Conversation models

`AgentConversation` groups messages into logical sessions:

- Fields: `workspace` (FK), `user` (FK), `title` (optional), `is_active` (default True)
- Ordering: by `created_at` descending (newest first)
- Auto-seeded per workspace with the built-in agent
- Each conversation can have multiple messages with different roles

`AgentConversationMessage` represents individual conversation turns:

- Fields: `conversation` (FK), `role` ("user" or "assistant"), `content` (text),
  `run` (nullable FK to AgentRun), `created_at` (timestamp)
- Role choices:
  - `USER`: User-initiated messages (query, command, etc.)
  - `ASSISTANT`: Agent responses (including issue updates, etc.)
- Ordering: by `created_at` ascending (chronological)
- `run` FK links to the AgentRun that generated this response (when applicable)

## API endpoints (plane.hw.views.agent)

| Endpoint                                             | Methods            | Auth           | Permission                          |
| ---------------------------------------------------- | ------------------ | -------------- | ----------------------------------- |
| `/api/workspaces/{slug}/agents/`                     | GET, POST          | Session        | ADMIN (create), ADMIN+MEMBER (list) |
| `/api/workspaces/{slug}/agents/{id}/`                | GET, PATCH, DELETE | Session        | ADMIN (mutate), ADMIN+MEMBER (read) |
| `/api/workspaces/{slug}/agent-runs/`                 | GET, POST          | Session+APIKey | ADMIN+MEMBER                        |
| `/api/workspaces/{slug}/agent-runs/{id}/`            | GET, PATCH         | Session+APIKey | ADMIN+MEMBER                        |
| `/api/workspaces/{slug}/agent-runs/{id}/activities/` | GET, POST          | Session+APIKey | ADMIN+MEMBER                        |

- Run and activity endpoints accept `APIKeyAuthentication` (for agent
  tokens). Profile endpoints use session auth only.
- POST to activities auto-creates `IssueComment` for `response` type
  activities (content is HTML-escaped).
- `api_token` is returned only on profile creation (not on subsequent
  reads).

## Background tasks

- `agent_webhook_send_task` -- sends HMAC-SHA256 signed webhooks to
  agent endpoints. Retries 5x with 600s exponential backoff. Deactivates
  agent on persistent failure.
- `detect_stale_agent_runs` -- Celery beat every minute. Marks
  `in_progress` runs as `stale` when `last_activity_at + stale_timeout <
now`.
- `cleanup_ephemeral_activities` -- Celery beat every hour. Deletes
  `is_ephemeral=True` activities from terminal runs older than 24 hours.
- `workspace_seed_task` -- creates built-in agent profile for new workspaces
  (idempotent). Executed once per workspace on initial creation.

## Mention trigger

`_detect_agent_mentions()` in `plane.app.views.issue.comment` parses
`@agent-name` from comment text, creates an `AgentRun`, and dispatches
`agent_webhook_send_task` with event type `issue_comment.mention`.

## Dependencies

- **Uses**: `plane.db.models.BaseModel`, `plane.db.models.User`,
  `plane.db.models.Workspace`, `plane.db.models.IssueComment`,
  `plane.db.models.APIToken`, `plane.db.models.BotTypeEnum`,
  `plane.bgtasks.workspace_seed_task`
- **Serializers**: `AgentProfileSerializer`, `AgentProfileCreateSerializer`,
  `AgentRunSerializer`, `AgentRunActivitySerializer`,
  `AgentConversationSerializer`, `AgentConversationMessageSerializer`
- **Used by**: `plane.hw.views.agent`, `plane.hw.serializers.agent`,
  `plane.bgtasks.agent_webhook_task`, `plane.bgtasks.agent_lifecycle_task`,
  `plane.app.views.issue.comment` (mention detection)
- **Boundary**: Agent models live in `plane.hw`, not `plane.db`. They
  are HW-only and should not be imported by CE code paths.

## Invariants

- Every `AgentProfile` has exactly one `User` with `is_bot=True` and
  `bot_type=AGENT`.
- `webhook_secret` is never exposed in API responses (excluded from
  `AgentProfileSerializer`).
- `completed_at` is set by the view layer on terminal state transitions,
  not by the serializer.
- Ephemeral activities (`thought`, `action`) are always deleted after
  the run completes (24h grace period).
- Built-in agents (`agent_type="builtin"`) cannot be deleted via API.
- `AgentConversation` messages are always ordered chronologically within
  each conversation.
- External agents default to `agent_type="external"` when not specified,
  maintaining backward compatibility with existing agent infrastructure.

## Key files

- `agent.py` -- model definitions (AgentProfile, AgentRun, AgentRunActivity,
  AgentConversation, AgentConversationMessage, AgentType, AgentConversationMessageRole)
- `../serializers/agent.py` -- DRF serializers (separate create/update serializers,
  including conversation serializers)
- `../views/agent.py` -- ViewSets (AgentProfileViewSet, AgentRunViewSet,
  AgentRunActivityViewSet) -- _Note: AgentConversationViewSets are planned_
- `../urls/agent.py` -- URL routing
- `../../bgtasks/agent_webhook_task.py` -- webhook delivery
- `../../bgtasks/agent_lifecycle_task.py` -- stale detection, ephemeral cleanup
- `../../bgtasks/workspace_seed_task.py` -- built-in agent seeding (idempotent)
