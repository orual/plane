# Agent Mention Autocomplete Implementation Plan

**Goal:** Extend the editor mention dropdown to show active agents alongside users, and route mention-triggered execution based on agent type.

**Architecture:** Extend the existing HW `useAdditionalEditorMention` hook to include an "Agents" section in the mention dropdown. Add `"agent_mention"` to the shared search entity types. Backend search endpoint returns agent profiles. Comment mention detection routes to the correct execution path based on `agent_type`.

**Tech Stack:** React 19, TipTap editor mention extension, MobX, TailwindCSS, Lucide icons

**Scope:** Phase 7 of 8 from original design (phases 6-8 are frontend UI)

**Codebase verified:** 2026-02-17

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC2: Agent mention autocomplete

- **agent-ux.AC2.1 Success:** Typing `@` in the rich text editor shows an "Agents" section in the mention dropdown alongside the existing "Users" section.
- **agent-ux.AC2.2 Success:** Agent suggestions filter as the user types, showing matching agent display names with a bot icon and type badge.
- **agent-ux.AC2.3 Success:** Selecting an agent inserts `@agent-name` into the editor content.
- **agent-ux.AC2.4 Success:** Posting a comment with `@builtin-agent-name` triggers the built-in execution task (not a webhook).
- **agent-ux.AC2.5 Success:** Posting a comment with `@external-agent-name` triggers a webhook (existing behaviour preserved).
- **agent-ux.AC2.6 Success:** Built-in agent's response appears as a comment on the issue with the bot user as actor.
- **agent-ux.AC2.7 Edge:** Mentioning a deactivated agent does not trigger execution or webhook.
- **agent-ux.AC2.8 Edge:** CE build shows no agent section in the mention dropdown (CE stub returns empty sections).

### agent-ux.AC6: Cross-cutting behaviours

- **agent-ux.AC6.3:** HW/CE overlay pattern is maintained — CE hook remains unchanged (returns empty sections).

---

## Codebase Verification Findings

- ✓ `useAdditionalEditorMention` HW hook confirmed at `apps/web/hw/hooks/use-additional-editor-mention.tsx` — currently returns empty `sections`, `["user_mention"]` for `editorMentionTypes`, and `undefined` for `parseAdditionalEditorContent`
- ✓ CE stub is identical at `apps/web/ce/hooks/use-additional-editor-mention.tsx` — will remain unchanged
- ✓ `useEditorMention` core hook at `apps/web/core/hooks/editor/use-editor-mention.tsx:27` calls `useAdditionalEditorMention`, merges `editorMentionTypes` into search request, and appends additional sections to user sections
- ✓ `TSearchEntities` defined at `packages/types/src/search.ts:15` — currently `"user_mention" | "issue" | "project" | "cycle" | "module" | "page"`
- ✓ `TSearchResponse` at `packages/types/src/search.ts:68` — keyed by entity type, each value is an array
- ✓ `TMentionSection` and `TMentionSuggestion` confirmed in `packages/editor/src/core/extensions/mentions/mentions-list-dropdown.tsx` — sections have `key`, `title?`, `items[]`; items have `entity_identifier`, `entity_name`, `icon`, `id`, `title`, `subTitle?`
- ✓ Backend search endpoint at `apps/api/plane/app/views/search/base.py:304` handles `query_type` parameter — must add `"agent_mention"` case
- ✓ Backend `_detect_agent_mentions()` at `apps/api/plane/app/views/issue/comment.py:32` uses regex on `comment_stripped` — currently triggers for ALL `@name` patterns regardless of mention type
- ✗ No `"agent_mention"` entity type exists yet — must be added to `TSearchEntities` union and `TSearchResponse`
- ✗ Agent profile service has no search/list endpoint for mention autocomplete — must be added (Phase 6 creates the profile CRUD service, this phase adds a search method)

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Extend TSearchEntities with agent_mention type

**Verifies:** agent-ux.AC2.1 (type foundation for agent mentions)

**Files:**

- Modify: `packages/types/src/search.ts`

**Implementation:**

Add `"agent_mention"` to the `TSearchEntities` union type. Add `TAgentSearchResponse` type for the search endpoint response shape. Add `agent_mention?` to `TSearchResponse`.

The `TAgentSearchResponse` shape should match what the backend search endpoint returns for agents — profile ID, display name, and avatar URL (if any). Keep it minimal since this is only for mention suggestions.

```typescript
export type TSearchEntities = "user_mention" | "issue" | "project" | "cycle" | "module" | "page" | "agent_mention";

export type TAgentSearchResponse = {
  id: string;
  display_name: string;
  agent_type: "external" | "builtin";
};
```

Add `agent_mention?: TAgentSearchResponse[];` to the `TSearchResponse` type.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(types): add agent_mention to search entity types`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Add agent search method to AgentService

**Verifies:** agent-ux.AC2.3 (search filters by display name)

**Files:**

- Modify: `apps/web/hw/services/agent.service.ts` (or `agent-profile.service.ts` if Phase 6 created a separate service — check at execution time)

**Implementation:**

Add a `searchAgents` method that calls the workspace search endpoint with `query_type: ["agent_mention"]`. This reuses the existing search infrastructure — the same endpoint that `useEditorMention` already calls.

Alternatively, if the agent profile service from Phase 6 already has a `listAgentProfiles` method, we can reuse that with a filter parameter. The mention hook calls the workspace search endpoint (not a direct agent list), so the backend search endpoint must be extended to handle `"agent_mention"` query type.

The method signature should be:

```typescript
async searchAgents(workspaceSlug: string, query: string): Promise<TAgentSearchResponse[]>
```

This can call the existing `/api/workspaces/${slug}/search/?search=${query}&query_type=agent_mention&count=5` endpoint once the backend adds the agent_mention handler.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(services): add agent search method for mention autocomplete`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Agent search service tests

**Verifies:** agent-ux.AC2.3

**Files:**

- Modify: `apps/web/hw/services/agent.service.test.ts` (extend the file created in Phase 6 Task 3 with agent search tests)

**Testing:**
Tests must verify:

- agent-ux.AC2.2: `searchAgents` calls the correct endpoint with query parameters and returns the parsed response

Follow existing service test patterns. Mock the HTTP layer (the `APIService` base class uses `axios` internally).

**Verification:**
Run: `pnpm --filter=web test -- --run agent.service`
Expected: All tests pass

**Commit:** `test(services): add agent search service tests`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-6) -->

<!-- START_TASK_4 -->

### Task 4: Implement useAdditionalEditorMention HW hook

**Verifies:** agent-ux.AC2.1, agent-ux.AC2.2, agent-ux.AC2.3, agent-ux.AC2.7

**Files:**

- Modify: `apps/web/hw/hooks/use-additional-editor-mention.tsx`

**Implementation:**

Replace the current no-op implementation with real logic:

1. **Extend `editorMentionTypes`** to `["user_mention", "agent_mention"]`. This tells the core `useEditorMention` hook to include `agent_mention` in the search request.

2. **Implement `updateAdditionalSections`** to process the `agent_mention` key from the search response:
   - Extract `response.agent_mention` (array of `TAgentSearchResponse`)
   - Map each to a `TMentionSuggestion` with:
     - `entity_identifier`: agent profile `id`
     - `entity_name`: `"agent_mention"`
     - `icon`: Lucide `Bot` icon (consistent with sidebar)
     - `title`: `display_name`
     - `subTitle`: agent_type badge text (e.g., "Built-in" or "External")
     - `id`: agent profile `id`
   - Return `{ sections: [{ key: "agents", title: "Agents", items }] }` if items exist, otherwise `{ sections: [] }`

3. **Implement `parseAdditionalEditorContent`** to handle the `"agent_mention"` entity type:
   - When `entityType === "agent_mention"`, return `{ redirectionPath: "/settings/agents", textContent: displayName }` (or similar — check how `user_mention` rendering resolves names)
   - This ensures agent mention nodes render correctly in read-only views

The hook should access the workspace slug from the router (via `useParams` or existing hooks) to construct search requests. However, the core hook already handles the search call — the HW hook only processes the response. So no direct API call is needed here.

**Key consideration:** The `enableAdvancedMentions` arg controls whether agents appear. When `false`, return the existing no-op behaviour. When `true`, return the agent section. This allows feature-flagging. Note: the HW hook already receives `_args: TUseAdditionalEditorMentionArgs` with `enableAdvancedMentions: boolean`, but the underscore prefix indicates it's currently unused. Remove the underscore prefix from the `_args` parameter and destructure `enableAdvancedMentions` to use it for gating the agent section.

```typescript
const editorMentionTypes: TSearchEntities[] = useMemo(
  () => (enableAdvancedMentions ? ["user_mention", "agent_mention"] : ["user_mention"]),
  [enableAdvancedMentions]
);
```

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(editor): implement agent mention autocomplete in HW hook`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Verify CE stub remains unchanged

**Verifies:** agent-ux.AC2.8, agent-ux.AC6.3

**Files:**

- Read (no modify): `apps/web/ce/hooks/use-additional-editor-mention.tsx`

**Implementation:**

The CE stub at `apps/web/ce/hooks/use-additional-editor-mention.tsx` already returns `{ sections: [] }`, `undefined`, and `["user_mention"]`. It does NOT need changes because:

- It returns `["user_mention"]` only — agents never appear in CE
- It returns empty sections — no agent results processed
- It returns `undefined` for content parsing — agent mention nodes ignored

Verify the CE stub still compiles after the `TSearchEntities` type extension in Task 1 (it should, since `"user_mention"` is still valid).

**Verification:**
Run: `pnpm check:types`
Expected: No type errors (CE stub unchanged and still valid)

**Commit:** No commit needed — verification only

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: Hook integration tests

**Verifies:** agent-ux.AC2.1, agent-ux.AC2.2, agent-ux.AC2.3, agent-ux.AC2.7, agent-ux.AC2.8, agent-ux.AC6.3

**Files:**

- Create: `apps/web/hw/hooks/use-additional-editor-mention.test.tsx`

**Testing:**
Tests must verify:

- agent-ux.AC2.1: When `enableAdvancedMentions` is true, `editorMentionTypes` includes `"agent_mention"` and `updateAdditionalSections` returns an "Agents" section with correct `TMentionSuggestion` shape from a mock response
- agent-ux.AC2.2: Each suggestion shows matching agent display name with a bot icon and type badge
- agent-ux.AC2.3: Each suggestion has `entity_name: "agent_mention"` and `entity_identifier` set to the agent profile ID (inserting `@agent-name`)
- agent-ux.AC2.7: When the mock response contains no agents (empty array), `updateAdditionalSections` returns `{ sections: [] }` (deactivated agents excluded by backend)
- agent-ux.AC2.8: When `enableAdvancedMentions` is false, `editorMentionTypes` is `["user_mention"]` and sections are empty (CE behaviour)
- agent-ux.AC6.3: CE stub returns empty sections regardless of flag

Use `renderHook` from `@testing-library/react` to test the hook in isolation. Mock the search response shape.

**Verification:**
Run: `pnpm --filter=web test -- --run use-additional-editor-mention`
Expected: All tests pass

**Commit:** `test(editor): add agent mention hook tests`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-9) -->

<!-- START_TASK_7 -->

### Task 7: Add agent_mention handler to backend search endpoint

**Verifies:** agent-ux.AC2.1, agent-ux.AC2.2, agent-ux.AC2.7

**Files:**

- Modify: `apps/api/plane/app/views/search/base.py`

**Implementation:**

In the `SearchEndpoint.get()` method (line ~304), add a handler for `query_type == "agent_mention"`. This follows the same pattern as the existing `"user_mention"` handler.

**Pre-condition:** Phase 1 must be complete — the `agent_type` field must exist on `AgentProfile` and the corresponding migration must be applied. Verify by running: `python manage.py shell -c 'from plane.hw.models.agent import AgentProfile; print(AgentProfile._meta.get_field("agent_type"))'`.

The handler should:

1. Query `AgentProfile` objects filtered by:
   - `workspace__slug=slug` (from URL)
   - `is_active=True` (only active agents)
   - `display_name__icontains=search` (search query filter)
2. Return results with shape: `{ id, display_name, agent_type }`
3. Limit to `count` results (from query param, default 5)

```python
if "agent_mention" in query_type:
    from plane.hw.models.agent import AgentProfile

    agents = AgentProfile.objects.filter(
        workspace__slug=slug,
        is_active=True,
    )
    if search:
        agents = agents.filter(display_name__icontains=search)

    results["agent_mention"] = list(
        agents.values("id", "display_name", "agent_type")[:count]
    )
```

Note: The backend `AgentProfile` model does not have an `avatar_url` field. Use a default bot icon on the frontend instead of an avatar URL.

**Important:** The `SearchEndpoint.get()` method has two separate `for query_type in query_types` loops: one inside `if project_id:` (lines ~315-525) and one inside `else:` (lines ~528-727). Add the `agent_mention` handler to **both** branches. Agents are workspace-scoped, so the same query logic applies regardless of project context. The mention autocomplete is invoked from project-scoped editors (issue comments), so the `if project_id` branch is the more commonly hit path.

**Verification:**
Run: `python run_tests.py -u`
Expected: Existing tests pass, no regressions

**Commit:** `feat(search): add agent_mention handler to search endpoint`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Update \_detect_agent_mentions for agent type routing

**Verifies:** agent-ux.AC2.4, agent-ux.AC2.5, agent-ux.AC2.6

**Files:**

- Modify: `apps/api/plane/app/views/issue/comment.py`

**Implementation:**

**Pre-condition:** Phase 1 must be complete — `agent_type` field must exist on `AgentProfile`. Without it, `agent.agent_type` access will raise `AttributeError`.

Update `_detect_agent_mentions()` (line ~32) to check `agent.agent_type` and route accordingly:

- For `agent_type == "external"`: Keep existing webhook dispatch path (unchanged — AC2.5)
- For `agent_type == "builtin"`: Dispatch `builtin_agent_execute_task.delay()` instead of webhook (AC2.4). The builtin task (Phase 4) is responsible for creating the bot comment on the issue (AC2.6).

The function currently:

1. Extracts `@name` patterns via regex
2. Queries `AgentProfile` matching `display_name__in=mentions`
3. Creates `AgentRun` for each match
4. Dispatches webhook for each

Add the type-based routing after run creation:

```python
for agent in agents:
    run = AgentRun.objects.create(...)

    if agent.agent_type == "builtin":
        builtin_agent_execute_task.delay(
            run_id=str(run.id),
            trigger_context={"trigger": "mention", "comment_text": comment_text},
        )
    else:
        agent_webhook_send_task.delay(
            agent_profile_id=str(agent.id),
            run_id=str(run.id),
            event_type="issue_comment.mention",
            event_data={...},
            current_site=current_site,
        )
```

**Import safety:** `builtin_agent_execute_task` is defined in Phase 4 (`apps/api/plane/bgtasks/builtin_agent_task.py`). The import **must** be done lazily (inside the function body) to prevent breaking all comment operations if Phase 4 is not yet complete:

```python
if agent.agent_type == "builtin":
    try:
        from plane.bgtasks.builtin_agent_task import builtin_agent_execute_task
        builtin_agent_execute_task.delay(...)
    except ImportError:
        logger.error("builtin_agent_execute_task not available — Phase 4 not deployed")
```

Do NOT add the import at module level — a broken module-level import would break ALL comment CRUD operations for all users.

**Verification:**
Run: `python run_tests.py -u`
Expected: Existing tests pass

**Commit:** `feat(comments): route agent mentions by agent type`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Backend mention tests

**Verifies:** agent-ux.AC2.4, agent-ux.AC2.5, agent-ux.AC2.7

**Files:**

- Create or modify: `apps/api/plane/tests/unit/test_agent_mentions.py` (or appropriate test file per project convention)

**Testing:**
Tests must verify:

- agent-ux.AC2.4: Comment with `@builtin-agent` dispatches builtin execution task (not webhook)
- agent-ux.AC2.5: Comment with `@external-agent` dispatches webhook task (existing behaviour preserved)
- agent-ux.AC2.7: Comment with `@inactive-agent` (deactivated) does not trigger any execution

Use the existing test fixtures (`workspace`, `create_user`, etc.) and factories. Mock the Celery task dispatches to verify they're called with correct arguments.

**Verification:**
Run: `python run_tests.py -u`
Expected: All tests pass

**Commit:** `test(comments): add agent mention routing tests`

<!-- END_TASK_9 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_TASK_10 -->

### Task 10: Enable advanced mentions in HW editors

**Verifies:** agent-ux.AC2.1

**Files:**

- Search for all call sites of `useEditorMention` and verify they pass `enableAdvancedMentions: true` in the HW build

**Implementation:**

The `useEditorMention` hook accepts `enableAdvancedMentions` (defaults to `false`) and passes it to `useAdditionalEditorMention`. To enable agent mentions, the call sites need to pass `true`.

Check the editor components at:

- `apps/web/core/components/editor/rich-text/editor.tsx:63`
- `apps/web/core/components/editor/lite-text/editor.tsx:104`
- `apps/web/core/components/editor/document/editor.tsx:69`
- `apps/web/core/components/pages/editor/editor-body.tsx:110`

If `enableAdvancedMentions` is already being passed (possibly from a prop or config), verify it's `true` in HW context. If not, determine the right approach:

- Option A: Always pass `true` in core editors (HW hook returns agents, CE hook returns empty — safe either way)
- Option B: Pass a value from a HW/CE config constant

Option A is simpler and safe because the CE stub ignores the flag. Recommend this approach.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(editor): enable advanced mentions for agent autocomplete`

<!-- END_TASK_10 -->

<!-- START_TASK_11 -->

### Task 11: End-to-end mention flow integration test

**Verifies:** agent-ux.AC2.1, agent-ux.AC2.2, agent-ux.AC2.3

**Files:**

- Create: `apps/web/hw/hooks/use-editor-mention-integration.test.tsx` (or co-locate with existing editor tests)

**Testing:**
Tests must verify the complete mention flow:

- agent-ux.AC2.1: Mock `searchEntity` returning both `user_mention` and `agent_mention` results. Verify `fetchMentions` returns both "Users" and "Agents" sections.
- agent-ux.AC2.2: Verify agent suggestion items show display name with bot icon and type badge.
- agent-ux.AC2.3: Verify agent suggestion items have `entity_name: "agent_mention"` and correct `entity_identifier` (for inserting `@agent-name`).

Use `renderHook` to test `useEditorMention` with a mock `searchEntity`. Verify the hook passes `["user_mention", "agent_mention"]` to the search and correctly merges the returned sections.

**Verification:**
Run: `pnpm --filter=web test -- --run use-editor-mention`
Expected: All tests pass

**Commit:** `test(editor): add mention flow integration tests`

<!-- END_TASK_11 -->
