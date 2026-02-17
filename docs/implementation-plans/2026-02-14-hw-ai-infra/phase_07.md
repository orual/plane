# HW AI Infrastructure Implementation Plan — Phase 7

**Goal:** Display agent run state and activities in the issue detail view.

**Architecture:** New HW components in `apps/web/hw/components/issues/agent/` render agent runs as a collapsible panel in the issue detail sidebar. A MobX store in `apps/web/hw/store/agent/` manages run and activity state. An API service in `apps/web/hw/services/agent.service.ts` handles HTTP calls. CE stubs provide empty implementations. The activity timeline in the issue detail view already discriminates by `activity_type` — we add agent-specific types.

**Tech Stack:** React, TypeScript, MobX, TailwindCSS

**Scope:** 8 phases from original design (phase 7 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC11: Activity rendering in UI
- **hw-ai-infra.AC11.1 Success:** Issue detail view shows a collapsible panel for active agent runs
- **hw-ai-infra.AC11.2 Success:** Thoughts render as muted/collapsed text
- **hw-ai-infra.AC11.3 Success:** Actions render as status pills
- **hw-ai-infra.AC11.4 Success:** Errors render as red alert banners
- **hw-ai-infra.AC11.5 Success:** Elicitations render as input cards; submitting posts a response activity
- **hw-ai-infra.AC11.6 Success:** Run status badge appears on issues with active runs
- **hw-ai-infra.AC11.7 Success:** Bot user comments appear naturally in the issue timeline with avatar and display name

---

<!-- START_TASK_1 -->
### Task 1: Create agent API service

**Files:**
- Create: `apps/web/hw/services/agent.service.ts`

**Implementation:**

Create a service following the pattern from `apps/web/hw/services/issue-type.service.ts`. Import `APIService` from `@/services/api.service` and `API_BASE_URL` from `@/helpers/common.helper`.

Methods:

```typescript
class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async listAgentRuns(workspaceSlug: string, issueId?: string): Promise<TAgentRun[]>
  async getAgentRun(workspaceSlug: string, runId: string): Promise<TAgentRun>
  async listRunActivities(workspaceSlug: string, runId: string): Promise<TAgentRunActivity[]>
  async postActivity(workspaceSlug: string, runId: string, data: TCreateActivityPayload): Promise<TAgentRunActivity>
}
```

Endpoints map to the URLs registered in Phase 5:
- GET `/api/workspaces/{slug}/agent-runs/?issue_id={issueId}` — list runs
- GET `/api/workspaces/{slug}/agent-runs/{runId}/` — get run
- GET `/api/workspaces/{slug}/agent-runs/{runId}/activities/` — list activities
- POST `/api/workspaces/{slug}/agent-runs/{runId}/activities/` — post activity (for elicitation responses)

**Verification:**

Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat: add agent API service`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Create agent TypeScript types

**Files:**
- Create: `apps/web/hw/types/agent.ts`
- Modify: `apps/web/hw/types/index.ts` (export the new types)

**Implementation:**

Define types matching the API response shapes from Phase 5 serializers:

```typescript
export type TAgentRunStatus = "created" | "in_progress" | "completed" | "failed" | "stopped" | "stale";
export type TAgentActivityType = "thought" | "action" | "response" | "elicitation" | "error";

export type TAgentRun = {
  id: string;
  agent_id: string;
  workspace_id: string;
  project_id: string | null;
  issue_id: string | null;
  status: TAgentRunStatus;
  stale_timeout: number;
  last_activity_at: string;
  completed_at: string | null;
  trigger_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TAgentRunActivity = {
  id: string;
  run_id: string;
  activity_type: TAgentActivityType;
  content: string;
  metadata: Record<string, unknown>;
  is_ephemeral: boolean;
  created_at: string;
  updated_at: string;
};

export type TCreateActivityPayload = {
  activity_type: TAgentActivityType;
  content: string;
  metadata?: Record<string, unknown>;
};
```

**Verification:**

Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat: add agent TypeScript types`
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Create agent MobX store

**Files:**
- Create: `apps/web/hw/store/agent/agent-run.store.ts`
- Create: `apps/web/hw/store/agent/index.ts`
- Modify: `apps/web/hw/store/root.store.ts` (register store)

**Implementation:**

Follow the MobX store pattern from `apps/web/hw/store/issue/issue-details/activity.store.ts`:

```typescript
import { makeObservable, observable, action, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { AgentService } from "@/plane-web/services/agent.service";
import type { TAgentRun, TAgentRunActivity } from "@/plane-web/types/agent";

export interface IAgentRunStore {
  // observables
  runsByIssueId: Record<string, string[]>;
  runMap: Record<string, TAgentRun>;
  activitiesByRunId: Record<string, string[]>;
  activityMap: Record<string, TAgentRunActivity>;
  loader: boolean;

  // computed helpers
  getRunsByIssueId: (issueId: string) => TAgentRun[];
  getActivitiesByRunId: (runId: string) => TAgentRunActivity[];
  hasActiveRuns: (issueId: string) => boolean;

  // actions
  fetchRunsForIssue: (workspaceSlug: string, issueId: string) => Promise<void>;
  fetchActivitiesForRun: (workspaceSlug: string, runId: string) => Promise<void>;
  postElicitationResponse: (workspaceSlug: string, runId: string, content: string) => Promise<void>;
}
```

The store:
- Stores runs indexed by issue ID for efficient lookup
- `hasActiveRuns` returns true if any run for the issue has status `created`, `in_progress`, or `stale`
- `postElicitationResponse` POSTs a response activity to the run (for user replies to elicitation cards)

Register in `apps/web/hw/store/root.store.ts`:
```typescript
import { AgentRunStore, IAgentRunStore } from "./agent/agent-run.store";

export class RootStore extends CoreRootStore {
  // existing stores...
  agentRunStore: IAgentRunStore;

  constructor() {
    super();
    // existing...
    this.agentRunStore = new AgentRunStore(this);
  }
}
```

**Verification:**

Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat: add agent run MobX store`
<!-- END_TASK_3 -->

<!-- START_SUBCOMPONENT_A (tasks 4-6) -->

<!-- START_TASK_4 -->
### Task 4: Create agent run panel component

**Verifies:** hw-ai-infra.AC11.1, hw-ai-infra.AC11.2, hw-ai-infra.AC11.3, hw-ai-infra.AC11.4

**Files:**
- Create: `apps/web/hw/components/issues/agent/agent-run-panel.tsx`
- Create: `apps/web/hw/components/issues/agent/activity-renderers.tsx`
- Create: `apps/web/hw/components/issues/agent/index.ts`

**Implementation:**

**`agent-run-panel.tsx`**: A collapsible panel component wrapped in `observer()` that:
1. Takes `workspaceSlug`, `issueId` props
2. Uses `useStore()` to access `agentRunStore`
3. Calls `fetchRunsForIssue` on mount via `useEffect`
4. Renders each active run as a collapsible `<Disclosure>` (from `@headlessui/react`) showing:
   - Run status badge (coloured pill: green=in_progress, grey=created, yellow=stale, red=failed)
   - Agent display name
   - Activity timeline (fetched on expand)

**`activity-renderers.tsx`**: Activity type discriminated renderers:
- `ThoughtRenderer` — muted text (`text-custom-text-400`), collapsed by default with expand toggle
- `ActionRenderer` — status pill badge (`bg-custom-primary-100/20 text-custom-primary-100`)
- `ErrorRenderer` — red alert banner (`bg-red-500/10 border-red-500/20 text-red-500`)
- `ResponseRenderer` — normal text (these show as comments in the timeline, so this is a lightweight fallback)

Each renderer takes `activity: TAgentRunActivity` and renders the `content` field with appropriate styling.

Follow TailwindCSS patterns from existing components. Use `cn()` utility for conditional classes.

**Verification:**

Run: `pnpm check:types && pnpm check:lint`
Expected: All checks pass

**Commit:** `feat: add agent run panel and activity renderers`
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Create elicitation renderer and run status badge

**Verifies:** hw-ai-infra.AC11.5, hw-ai-infra.AC11.6

**Files:**
- Create: `apps/web/hw/components/issues/agent/elicitation-card.tsx`
- Create: `apps/web/hw/components/issues/agent/run-status-badge.tsx`

**Implementation:**

**`elicitation-card.tsx`**: A card component that:
1. Renders the agent's question from `activity.metadata.question`
2. Based on `activity.metadata.input_type`:
   - `"text"` → renders a text input with submit button
   - `"select"` → renders option buttons from `activity.metadata.options`
3. On submit, calls `agentRunStore.postElicitationResponse()` with the user's input
4. Shows a loading state while submitting
5. After submission, replaces the input with the submitted response text

Style as a card with border, padding, and subtle background (`bg-custom-background-90 border border-custom-border-200 rounded-lg p-4`).

**`run-status-badge.tsx`**: A small badge component that:
1. Takes `issueId` prop
2. Uses `agentRunStore.hasActiveRuns(issueId)` to determine visibility
3. Renders a small animated dot or icon when an agent is active
4. Shows agent icon (e.g., Lucide `Bot` icon) with pulse animation

This badge is intended to be placed on issue cards in list/kanban views to indicate active agent runs.

**Verification:**

Run: `pnpm check:types && pnpm check:lint`
Expected: All checks pass

**Commit:** `feat: add elicitation card and run status badge components`
<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Create CE stubs for agent components

**Verifies:** N/A (infrastructure to maintain HW/CE overlay pattern)

**Files:**
- Create: `apps/web/ce/components/issues/agent/agent-run-panel.tsx`
- Create: `apps/web/ce/components/issues/agent/run-status-badge.tsx`
- Create: `apps/web/ce/components/issues/agent/index.ts`

**Implementation:**

Follow the CE stub pattern from `apps/web/ce/components/issues/issue-details/additional-properties.tsx`:

Each CE stub exports the same component name with the same props type but returns an empty fragment `<></>`.

```typescript
// ce/components/issues/agent/agent-run-panel.tsx
export type TAgentRunPanelProps = {
  workspaceSlug: string;
  issueId: string;
};

export function AgentRunPanel(_props: TAgentRunPanelProps) {
  return <></>;
}
```

Same pattern for `RunStatusBadge`.

**Verification:**

Run: `pnpm check:types`
Expected: No type errors — CE stubs satisfy same interface as HW components

**Commit:** `feat: add CE stubs for agent components`
<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_TASK_7 -->
### Task 7: Integrate agent panel into issue detail view

**Verifies:** hw-ai-infra.AC11.1, hw-ai-infra.AC11.7

**Files:**
- Modify: `apps/web/hw/components/issues/issue-details/` (the sidebar or detail layout — exact file to be determined by executor during codebase investigation)

**Implementation:**

Add the `AgentRunPanel` component to the issue detail view. The exact integration point depends on the issue detail layout structure:

1. Import `AgentRunPanel` from `@/plane-web/components/issues/agent`
2. Place it in the issue detail sidebar or below the description, before the activity timeline
3. Pass `workspaceSlug` and `issueId` from the parent component's props/context
4. The panel is self-contained — it fetches its own data and manages its own state via the MobX store

For AC11.7 (bot user comments in timeline): Bot user comments are already handled by the existing comment rendering system. When `AgentRunActivity` with `activity_type="response"` creates an `IssueComment` (Phase 5, Task 3), that comment appears naturally in the timeline because the existing `IssueActivityCommentRoot` component fetches and renders all comments. The bot user's avatar and display name appear because the comment has an `actor` FK pointing to the bot User record.

No changes needed to the comment rendering system — it already supports bot user comments via the `actor` field.

**Verification:**

Run: `pnpm check:types && pnpm check:lint`
Expected: All checks pass

**Commit:** `feat: integrate agent run panel into issue detail view`
<!-- END_TASK_7 -->

<!-- START_TASK_8 -->
### Task 8: Write unit tests for agent MobX store

**Verifies:** hw-ai-infra.AC11.1, hw-ai-infra.AC11.6

**Files:**
- Create: `apps/web/hw/store/agent/__tests__/agent-run.store.test.ts`

**Testing:**

Unit tests for the `AgentRunStore` observable behaviour. Mock the `AgentService` methods:

- hw-ai-infra.AC11.1: After `fetchRunsForIssue()` completes, `getRunsByIssueId(issueId)` returns the expected `TAgentRun[]` from the mock service response
- hw-ai-infra.AC11.6: `hasActiveRuns(issueId)` returns `true` when at least one run has status `created`, `in_progress`, or `stale`; returns `false` when all runs are `completed`/`failed`/`stopped`; returns `false` when no runs exist for the issue
- `getActivitiesByRunId(runId)` returns activities in order after `fetchActivitiesForRun()` completes
- `postElicitationResponse()` calls the service and updates the store

Use Vitest (the project's frontend test framework). Mock `AgentService` methods with `vi.fn()`.

**Verification:**

Run: `pnpm test --filter=web`
Expected: All tests pass

**Commit:** `test: add unit tests for agent MobX store`
<!-- END_TASK_8 -->
