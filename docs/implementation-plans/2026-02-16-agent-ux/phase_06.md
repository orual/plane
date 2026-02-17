# Agent Management UI Implementation Plan

**Goal:** Build a workspace settings panel where admins manage agent registrations (both external and built-in), following the existing webhook settings UI pattern.

**Architecture:** MobX store + API service for agent profile CRUD, React pages/components for list/detail/create flows, HW/CE overlay for gating.

**Tech Stack:** React 19, MobX, React Hook Form, SWR, TailwindCSS, Lucide icons

**Scope:** Phase 6 of 8 from original design (phases 6-8 are frontend UI)

**Codebase verified:** 2026-02-17

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC1: Agent management UI

- **agent-ux.AC1.1 Success:** Workspace settings shows an "Agents" page listing all registered agents (both external and built-in) with display name, type badge, and active status.
- **agent-ux.AC1.2 Success:** Admin can register a new external agent via modal — form accepts display name, description, webhook URL, and webhook secret. On creation, API token is displayed once.
- **agent-ux.AC1.3 Success:** Agent detail page shows editable configuration fields and a recent runs table with status, trigger type, linked issue, and timestamps.
- **agent-ux.AC1.4 Success:** Built-in agent card is always present (auto-seeded), shows configuration options (model override, tool permissions, active toggle), and cannot be deleted.
- **agent-ux.AC1.5 Success:** Admin can deactivate an agent. Deactivated agents don't appear in mention autocomplete and don't execute on trigger.
- **agent-ux.AC1.6 Failure:** Non-admin users see "Not authorized" when accessing the agents settings page.
- **agent-ux.AC1.7 Failure:** Creating an agent with a duplicate display name within the same workspace returns a validation error.

### agent-ux.AC6: Cross-cutting behaviours

- **agent-ux.AC6.3:** HW/CE overlay pattern is maintained — all new UI has CE stubs.

---

## Codebase Verification Findings

- ✓ Webhook settings UI pattern confirmed at `apps/web/core/components/web-hooks/` — SettingsHeading, card list, detail page, React Hook Form, WebhookStore with `Record<string, IWebhook>`
- ✓ Backend AgentProfile model/views/serializers/URLs exist at `apps/api/plane/hw/`
- ✗ `agent_type` field does NOT yet exist on AgentProfile model — Phase 1 deliverable, we assume it lands before this phase executes
- ✓ Workspace settings sidebar uses extensible constant-based system with HW overlay in `apps/web/hw/components/settings/workspace/sidebar/`
- ✗ `TAgentProfile` type does NOT exist in `apps/web/hw/types/agent.ts` — must be created
- ✗ `AgentProfileStore` does NOT exist — only `AgentRunStore` at `apps/web/hw/store/agent/`
- ✗ Agent service has no profile CRUD methods — only run/activity methods in `apps/web/hw/services/agent.service.ts`
- ✓ Workspace settings routing at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/` confirmed

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Add TAgentProfile type and extend agent types

**Verifies:** agent-ux.AC1.1 (type foundation for profile data)

**Files:**

- Modify: `apps/web/hw/types/agent.ts`

**Implementation:**

Add the `TAgentProfile` type and `TAgentType` union to the existing agent types file. The type must match the backend `AgentProfileSerializer` fields (verified at `apps/api/plane/hw/serializers/agent.py`). Also add `TCreateAgentProfilePayload` for the create form.

```typescript
export type TAgentType = "external" | "builtin";

export type TAgentProfile = {
  id: string;
  user_id: string;
  workspace_id: string;
  agent_type: TAgentType;
  webhook_url: string;
  webhook_secret: string;
  event_triggers: Record<string, unknown>;
  is_active: boolean;
  display_name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type TCreateAgentProfilePayload = {
  display_name: string;
  description: string;
  webhook_url: string;
  webhook_secret: string;
  event_triggers?: Record<string, unknown>;
};

export type TAgentProfileCreateResponse = TAgentProfile & {
  api_token: string;
};
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add TAgentProfile type definitions`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add agent profile CRUD methods to AgentService

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.5

**Files:**

- Modify: `apps/web/hw/services/agent.service.ts`

**Implementation:**

Add profile CRUD methods to the existing `AgentService` class, following the same pattern as the existing run endpoints. The endpoints match the backend URL patterns at `apps/api/plane/hw/urls/agent.py`: `workspaces/<slug>/agents/` for list/create, `workspaces/<slug>/agents/<uuid>/` for retrieve/update/delete.

Add a new section above the existing "Agent run endpoints" section:

```typescript
// ============================================================
// Agent profile endpoints
// ============================================================

async listAgentProfiles(workspaceSlug: string): Promise<TAgentProfile[]> {
  return this.get(`/api/workspaces/${workspaceSlug}/agents/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}

async getAgentProfile(workspaceSlug: string, agentId: string): Promise<TAgentProfile> {
  return this.get(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}

async createAgentProfile(
  workspaceSlug: string,
  data: TCreateAgentProfilePayload
): Promise<TAgentProfileCreateResponse> {
  return this.post(`/api/workspaces/${workspaceSlug}/agents/`, data)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}

async updateAgentProfile(
  workspaceSlug: string,
  agentId: string,
  data: Partial<TAgentProfile>
): Promise<TAgentProfile> {
  return this.patch(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`, data)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}

async deleteAgentProfile(workspaceSlug: string, agentId: string): Promise<void> {
  return this.delete(`/api/workspaces/${workspaceSlug}/agents/${agentId}/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}
```

Also add the new type imports at the top of the file:

```typescript
import type {
  TAgentRun,
  TAgentRunActivity,
  TCreateActivityPayload,
  TAgentProfile,
  TAgentProfileCreateResponse,
  TCreateAgentProfilePayload,
} from "@/plane-web/types/agent";
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add agent profile CRUD methods to AgentService`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: AgentService tests for profile endpoints

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.5

**Files:**

- Create: `apps/web/hw/services/agent.service.test.ts`

**Testing:**

Follow the existing service test pattern from `apps/web/hw/services/issue-type.service.test.ts`. Tests verify URL construction and error handling for each profile CRUD method.

Tests must verify:

- `listAgentProfiles` calls GET `/api/workspaces/{slug}/agents/`
- `getAgentProfile` calls GET `/api/workspaces/{slug}/agents/{id}/`
- `createAgentProfile` calls POST with payload
- `updateAgentProfile` calls PATCH with partial payload
- `deleteAgentProfile` calls DELETE
- Error handling: each method throws `error.response.data` on failure

**Verification:**
Run: `cd apps/web && pnpm test -- agent.service.test`
Expected: All tests pass

**Commit:** `test(agent-ux): add AgentService profile endpoint tests`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-6) -->

<!-- START_TASK_4 -->

### Task 4: Create AgentProfileStore

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.5

**Files:**

- Create: `apps/web/hw/store/agent/agent-profile.store.ts`
- Modify: `apps/web/hw/store/agent/index.ts` (add barrel export)
- Modify: `apps/web/hw/store/root.store.ts` (register on root store)

**Implementation:**

Create `AgentProfileStore` following the `WebhookStore` pattern (verified at `apps/web/core/store/workspace/webhook.store.ts`). Key design points:

- `profiles: Record<string, TAgentProfile> | null` observable (null = not loaded, empty object = loaded with no results)
- `apiToken: string | null` observable for one-time display after creation
- CRUD actions matching the service methods
- `getProfileById` computed helper via `computedFn`

Interface:

```typescript
export interface IAgentProfileStore {
  // observables
  profiles: Record<string, TAgentProfile> | null;
  apiToken: string | null;
  // computed helpers
  getProfileById: (agentId: string) => TAgentProfile | null;
  // fetch actions
  fetchProfiles: (workspaceSlug: string) => Promise<TAgentProfile[]>;
  fetchProfileById: (workspaceSlug: string, agentId: string) => Promise<TAgentProfile>;
  // crud actions
  createProfile: (
    workspaceSlug: string,
    data: TCreateAgentProfilePayload
  ) => Promise<{ profile: TAgentProfile; apiToken: string }>;
  updateProfile: (workspaceSlug: string, agentId: string, data: Partial<TAgentProfile>) => Promise<TAgentProfile>;
  removeProfile: (workspaceSlug: string, agentId: string) => Promise<void>;
  // token actions
  clearApiToken: () => void;
}
```

The implementation follows the same MobX patterns as `WebhookStore`: `makeObservable`, `runInAction` for state updates, `computedFn` for parameterized computed values.

Update `apps/web/hw/store/agent/index.ts` barrel export:

```typescript
export { AgentRunStore } from "./agent-run.store";
export type { IAgentRunStore } from "./agent-run.store";
export { AgentProfileStore } from "./agent-profile.store";
export type { IAgentProfileStore } from "./agent-profile.store";
```

Update `apps/web/hw/store/root.store.ts` to add `agentProfileStore`:

```typescript
import { AgentProfileStore } from "./agent/agent-profile.store";
import type { IAgentProfileStore } from "./agent/agent-profile.store";

export class RootStore extends CoreRootStore {
  // ... existing stores
  agentProfileStore: IAgentProfileStore;

  constructor() {
    super();
    // ... existing store initialization
    this.agentProfileStore = new AgentProfileStore(this);
  }
}
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add AgentProfileStore with CRUD operations`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: AgentProfileStore tests

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.5, agent-ux.AC1.7

**Files:**

- Create: `apps/web/hw/store/agent/agent-profile.store.test.ts`

**Testing:**

Follow the existing store test pattern from `apps/web/hw/store/agent/agent-run.store.test.ts` and `apps/web/hw/store/issue-type.store.test.ts`. Mock `AgentService` with `vi.mock` and spy on prototype methods.

Tests must verify:

- agent-ux.AC1.1: `fetchProfiles` populates `profiles` map keyed by ID
- agent-ux.AC1.2: `createProfile` adds new profile to map and stores `apiToken`
- agent-ux.AC1.5: `updateProfile` with `{ is_active: false }` updates the profile in the map
- agent-ux.AC1.7: `createProfile` propagates service error (backend handles duplicate validation)
- `removeProfile` deletes from map
- `clearApiToken` resets `apiToken` to null
- `getProfileById` returns correct profile or null

**Verification:**
Run: `cd apps/web && pnpm test -- agent-profile.store.test`
Expected: All tests pass

**Commit:** `test(agent-ux): add AgentProfileStore tests`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Add CE stub for AgentProfileStore

**Verifies:** agent-ux.AC6.3

**Files:**

- Modify: `apps/web/ce/store/root.store.ts`

**Implementation:**

The CE root store at `apps/web/ce/store/root.store.ts` imports and instantiates `AgentRunStore` from `@/plane-web/store/agent/agent-run.store.ts` identically to the HW root store (both HW and CE use the same store class). Follow this same pattern: import `AgentProfileStore` from `@/plane-web/store/agent/agent-profile.store.ts` and instantiate it in the CE root store constructor. The key contract is that `rootStore.agentProfileStore` exists in both builds.

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors in both HW and CE builds

**Commit:** `feat(agent-ux): add AgentProfileStore CE stub`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-8) -->

<!-- START_TASK_7 -->

### Task 7: Add "Agents" to workspace settings sidebar navigation

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.6, agent-ux.AC6.3

**Files:**

- Modify: `apps/web/hw/components/settings/workspace/sidebar/item-categories.tsx`
- Modify: `apps/web/hw/components/settings/workspace/sidebar/item-icon.tsx`
- Modify: `apps/web/hw/components/settings/workspace/layout-access.ts`

**Implementation:**

Follow the exact pattern used for `workspace_issue_types` (verified in the three files above).

In `item-icon.tsx`, add the `Bot` icon from lucide-react for the new `"agents"` key:

```typescript
import { ArrowUpToLine, Bot, Building, CreditCard, LayoutList, Users, Webhook } from "lucide-react";

type WorkspaceSettingsIconKey = TWorkspaceSettingsTabs | "workspace_issue_types" | "agents";

export const WORKSPACE_SETTINGS_ICONS: Record<WorkspaceSettingsIconKey, LucideIcon | React.FC<ISvgIcons>> = {
  // ... existing entries
  agents: Bot,
};
```

In `item-categories.tsx`, extend `TExtendedWorkspaceSettingsItem` to include `"agents"` key and add the agents item to the DEVELOPER category:

```typescript
type TExtendedWorkspaceSettingsItem = Omit<TWorkspaceSettingsItem, "key"> & {
  key: TWorkspaceSettingsItem["key"] | "workspace_issue_types" | "agents";
};

const AGENTS_SETTINGS_ITEM: TExtendedWorkspaceSettingsItem = {
  key: "agents",
  i18n_label: "workspace_settings.settings.agents.title",
  href: "/settings/agents",
  access: [EUserWorkspaceRoles.ADMIN],
  highlight: (pathname: string, baseUrl: string) => new RegExp(`^${baseUrl}/settings/agents/`).test(pathname),
};
```

Add it to the same category that contains webhooks. Verify the exact category constant from `@plane/constants` by searching for where webhooks are grouped (e.g., `grep -r "webhooks" apps/web/hw/components/settings/workspace/sidebar/item-categories.tsx`). The constant is likely `WORKSPACE_SETTINGS_CATEGORY.DEVELOPER` but must be confirmed at execution time:

```typescript
[WORKSPACE_SETTINGS_CATEGORY.DEVELOPER]: [
  WORKSPACE_SETTINGS["webhooks"],
  AGENTS_SETTINGS_ITEM,
],
```

In `layout-access.ts`, add the agents route with ADMIN-only access:

```typescript
export const EXTENDED_WORKSPACE_SETTINGS_ACCESS: Record<string, EUserWorkspaceRoles[]> = {
  ...BASE_WORKSPACE_SETTINGS_ACCESS,
  "/settings/issue-types": [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
  "/settings/agents": [EUserWorkspaceRoles.ADMIN],
};
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors. The "Agents" item appears in the sidebar under DEVELOPER category for admin users.

**Commit:** `feat(agent-ux): add agents to workspace settings sidebar`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Create agents settings route pages (list + detail)

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.3, agent-ux.AC1.6

**Files:**

- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/page.tsx`
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/header.tsx`
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/[agentId]/page.tsx`
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/[agentId]/header.tsx`

**Implementation:**

Follow the exact pattern from the webhook pages (verified at `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/webhooks/`).

**List page (`agents/page.tsx`):**

- Uses `observer` wrapper
- Checks admin permissions via `useUserPermissions` + `allowPermissions([EUserPermissions.ADMIN])`
- Non-admin: renders `<NotAuthorizedView section="settings" />`
- Uses SWR to fetch agent profiles: `useSWR("AGENT_PROFILES_LIST_${workspaceSlug}", () => fetchProfiles(workspaceSlug))`
- Shows `SettingsHeading` with title and "Add agent" CTA button
- Renders `<AgentsList />` if profiles exist, empty state otherwise
- Create modal triggered by CTA button
- Wraps content in `<SettingsContentWrapper>`

**Detail page (`agents/[agentId]/page.tsx`):**

- Uses `observer` wrapper
- Fetches single agent profile via SWR
- Renders `<AgentDetailRoot />` component (created in later task)

**Header files** follow the pattern from `webhooks/header.tsx` — breadcrumb with settings back link.

The actual component implementations (AgentsList, AgentDetailRoot, CreateAgentModal) are created in subsequent tasks. These pages import them from `@/plane-web/components/settings/agents/`.

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors (component imports will resolve to empty stubs initially — create placeholder barrel exports as needed)

**Commit:** `feat(agent-ux): add agents settings route pages`

<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 9-13) -->

<!-- START_TASK_9 -->

### Task 9: Create AgentsList and AgentsListItem components

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.4

**Files:**

- Create: `apps/web/hw/components/settings/agents/agents-list.tsx`
- Create: `apps/web/hw/components/settings/agents/agents-list-item.tsx`
- Create: `apps/web/hw/components/settings/agents/index.ts`

**Implementation:**

**`AgentsList`** — follows `WebhooksList` pattern. Uses `observer`, accesses `agentProfileStore.profiles` from the MobX store, renders each profile as an `AgentsListItem`. Sort to show built-in agent first, then external agents alphabetically.

**`AgentsListItem`** — card component showing:

- Display name
- Type badge ("Built-in" or "External") using a styled span with different colours
- Active/inactive status indicator (green/grey dot)
- Description excerpt (truncated)
- Links to detail page: `/${workspaceSlug}/settings/agents/${agent.id}/`

The built-in agent card should be visually distinct (subtle background tint or badge).

**`index.ts`** barrel export:

```typescript
export { AgentsList } from "./agents-list";
export { AgentsListItem } from "./agents-list-item";
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add AgentsList and AgentsListItem components`

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->

### Task 10: Create CreateAgentModal component

**Verifies:** agent-ux.AC1.2, agent-ux.AC1.7

**Files:**

- Create: `apps/web/hw/components/settings/agents/create-agent-modal.tsx`
- Modify: `apps/web/hw/components/settings/agents/index.ts` (add export)

**Implementation:**

Follow the two-phase pattern from `apps/web/core/components/web-hooks/create-webhook-modal.tsx`. The modal has two states:

**Phase 1 — Form:** Uses React Hook Form with fields:

- `display_name` (required, text input)
- `description` (optional, textarea)
- `webhook_url` (required, URL input)
- `webhook_secret` (optional, text input)

On submit, calls `agentProfileStore.createProfile()`. If the service returns a validation error (duplicate name — agent-ux.AC1.7), display it inline on the `display_name` field.

**Phase 2 — Token display:** After successful creation, show the API token once (from `agentProfileStore.apiToken`). Include a copy-to-clipboard button and a warning that the token won't be shown again. A "Done" button closes the modal and calls `clearApiToken()`.

Use `@plane/propel` components: `Button`, `Input`, and the existing modal wrapper pattern.

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add CreateAgentModal with two-phase flow`

<!-- END_TASK_10 -->

<!-- START_TASK_11 -->

### Task 11: Create AgentDetailRoot component

**Verifies:** agent-ux.AC1.3, agent-ux.AC1.4, agent-ux.AC1.5

**Files:**

- Create: `apps/web/hw/components/settings/agents/agent-detail-root.tsx`
- Create: `apps/web/hw/components/settings/agents/agent-detail-form.tsx`
- Create: `apps/web/hw/components/settings/agents/agent-runs-table.tsx`
- Modify: `apps/web/hw/components/settings/agents/index.ts` (add exports)

**Implementation:**

**`AgentDetailRoot`** — container component:

- Fetches agent profile by ID via SWR
- Renders `AgentDetailForm` and `AgentRunsTable`
- For built-in agents: shows model override select, tool permissions toggles, active toggle. Does NOT show delete button (agent-ux.AC1.4).
- For external agents: shows editable display name, description, webhook URL, webhook secret, active toggle, and delete button.

**`AgentDetailForm`** — React Hook Form for editing agent fields:

- External agents: `display_name`, `description`, `webhook_url`, `webhook_secret`, `is_active` toggle
- Built-in agents: `is_active` toggle, model override (text input for now — full config depends on backend support), description
- Save button calls `agentProfileStore.updateProfile()`
- Deactivation toggle (agent-ux.AC1.5) updates `is_active` field

**`AgentRunsTable`** — displays recent runs for this agent:

- Fetches runs for this agent. **Pre-verification required:** The existing `AgentService.listAgentRuns()` only supports `?issue_id=` filtering. Check at execution time whether the backend `AgentRunViewSet` supports `?agent_id=` filtering. If not, either: (a) extend the backend viewset's `get_queryset` to accept `agent_id` as a filter parameter, or (b) use a nested URL pattern like `/api/workspaces/{slug}/agents/{agentId}/runs/` if the backend supports it, or (c) filter client-side from all workspace runs (least ideal but functional)
- Table columns: Status (using existing `RunStatusBadge`), trigger type (from `trigger_metadata`), linked issue (link to issue if `issue_id` present), timestamps (created_at, completed_at)
- Limit to most recent 20 runs

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add agent detail page components`

<!-- END_TASK_11 -->

<!-- START_TASK_12 -->

### Task 12: Create CE stubs for agent settings components

**Verifies:** agent-ux.AC6.3

**Files:**

- Create: `apps/web/ce/components/settings/agents/index.ts`
- Create: `apps/web/ce/components/settings/agents/agents-list.tsx`
- Create: `apps/web/ce/components/settings/agents/create-agent-modal.tsx`
- Create: `apps/web/ce/components/settings/agents/agent-detail-root.tsx`

**Implementation:**

Each CE stub must satisfy the same TypeScript interface as the HW implementation but render `null` or empty content. Follow the pattern from existing CE stubs at `apps/web/ce/components/issues/agent/`.

**`agents-list.tsx`:**

```typescript
export function AgentsList() {
  return null;
}
```

**`create-agent-modal.tsx`:**

```typescript
type CreateAgentModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CreateAgentModal(_props: CreateAgentModalProps) {
  return null;
}
```

**`agent-detail-root.tsx`:**

```typescript
type AgentDetailRootProps = {
  workspaceSlug: string;
  agentId: string;
};

export function AgentDetailRoot(_props: AgentDetailRootProps) {
  return null;
}
```

**`index.ts`** barrel export matching HW exports:

```typescript
export { AgentsList } from "./agents-list";
export { CreateAgentModal } from "./create-agent-modal";
export { AgentDetailRoot } from "./agent-detail-root";
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors in either HW or CE build

**Commit:** `feat(agent-ux): add CE stubs for agent settings components`

<!-- END_TASK_12 -->

<!-- START_TASK_13 -->

### Task 13: Wire up list page to components and verify end-to-end

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.6

**Files:**

- Modify: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/page.tsx`
- Modify: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents/[agentId]/page.tsx`

**Implementation:**

Wire the page components to import from `@/plane-web/components/settings/agents/` and connect them to the store:

**List page** — ensure it:

1. Uses SWR to call `agentProfileStore.fetchProfiles(workspaceSlug)`
2. Renders `AgentsList` when profiles are loaded
3. Renders `CreateAgentModal` controlled by local state
4. Shows `NotAuthorizedView` for non-admin users (agent-ux.AC1.6)
5. Shows loading state while profiles are null

**Detail page** — ensure it:

1. Extracts `agentId` from route params
2. Renders `AgentDetailRoot` with `workspaceSlug` and `agentId` props

Add i18n keys for the agents settings page (check existing pattern in the translation files — likely in a workspace_settings namespace).

**Verification:**
Run: `pnpm check:types --filter=web`
Run: `pnpm build --filter=web` (if available in dev mode)
Expected: No type errors. Pages render correctly when navigating to `/settings/agents/`.

**Commit:** `feat(agent-ux): wire agent settings pages to components`

<!-- END_TASK_13 -->

<!-- END_SUBCOMPONENT_D -->

<!-- START_SUBCOMPONENT_E (tasks 14-15) -->

<!-- START_TASK_14 -->

### Task 14: Add i18n translation keys for agent settings

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.3

**Files:**

- Modify: the primary English locale file (find via `grep -r "workspace_settings.settings.webhooks.title"` to locate the correct i18n file)

**Implementation:**

Add translation keys following the existing `workspace_settings.settings.webhooks.*` pattern:

```json
"workspace_settings.settings.agents.title": "Agents",
"workspace_settings.settings.agents.description": "Manage AI agents that can interact with your workspace through mentions and the chat panel.",
"workspace_settings.settings.agents.add_agent": "Add agent",
"workspace_settings.settings.agents.external": "External",
"workspace_settings.settings.agents.builtin": "Built-in",
"workspace_settings.settings.agents.active": "Active",
"workspace_settings.settings.agents.inactive": "Inactive",
"workspace_settings.settings.agents.api_token_warning": "This API token will only be shown once. Copy it now.",
"workspace_settings.settings.agents.detail.runs": "Recent runs",
"workspace_settings.settings.agents.detail.configuration": "Configuration",
"workspace_settings.settings.agents.detail.deactivate": "Deactivate agent",
"workspace_settings.settings.agents.detail.delete": "Delete agent",
"settings_empty_state.agents.title": "No agents yet",
"settings_empty_state.agents.description": "Register external agents or configure the built-in agent to start automating your workflow.",
"settings_empty_state.agents.cta_primary": "Add your first agent"
```

**Verification:**
Run: `pnpm check:types --filter=web`
Expected: No type errors

**Commit:** `feat(agent-ux): add i18n keys for agent settings`

<!-- END_TASK_14 -->

<!-- START_TASK_15 -->

### Task 15: AgentProfileStore integration test

**Verifies:** agent-ux.AC1.1, agent-ux.AC1.2, agent-ux.AC1.5, agent-ux.AC1.7

**Files:**

- Modify: `apps/web/hw/store/agent/agent-profile.store.test.ts` (extend from Task 5)

**Testing:**

Add integration-style tests that verify the full CRUD lifecycle:

Tests must verify:

- agent-ux.AC1.1: After `fetchProfiles`, `profiles` map contains all returned agents with correct fields including `agent_type`, `display_name`, `is_active`
- agent-ux.AC1.2: After `createProfile`, new profile appears in map AND `apiToken` is set
- agent-ux.AC1.5: After `updateProfile` with `{ is_active: false }`, profile in map reflects deactivated state
- agent-ux.AC1.7: When service throws validation error for duplicate name, store propagates the error and does not modify the profiles map
- Full lifecycle: fetch → create → update → remove → verify map state at each step

**Verification:**
Run: `cd apps/web && pnpm test -- agent-profile.store.test`
Expected: All tests pass

**Commit:** `test(agent-ux): add AgentProfileStore lifecycle tests`

<!-- END_TASK_15 -->

<!-- END_SUBCOMPONENT_E -->
