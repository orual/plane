# HW AI Infrastructure Implementation Plan — Phase 2

**Goal:** Complete Stage 1 — rebrand from "Pi", add the missing grammar endpoint, remove rate limit, extend admin settings.

**Architecture:** The frontend already has an AI settings page at `/ai/` in the admin app with `LLM_API_KEY` and `LLM_MODEL` fields. We extend it with `LLM_PROVIDER` and `LLM_BASE_URL`. The grammar endpoint is a new Django view using the same LiteLLM dispatch from Phase 1. The "Pi" branding lives in a few specific files — constants, menu components in both HW and CE overlays.

**Tech Stack:** Python/Django, React/TypeScript, MobX, react-hook-form

**Scope:** 8 phases from original design (phase 2 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC3: /rephrase-grammar/ endpoint works
- **hw-ai-infra.AC3.1 Success:** POST to `/rephrase-grammar/` with text returns grammar-corrected version
- **hw-ai-infra.AC3.2 Success:** Frontend `performEditorTask()` calls succeed (no longer 404)
- **hw-ai-infra.AC3.3 Failure:** Empty text input returns validation error

### hw-ai-infra.AC4: AI is rebranded and rate limit removed
- **hw-ai-infra.AC4.1 Success:** No "Pi" or "Ask Pi" strings appear in the frontend
- **hw-ai-infra.AC4.2 Success:** AI name is stored as a single constant, easily swappable
- **hw-ai-infra.AC4.3 Success:** Users can make unlimited AI requests (no 50/month cap)

### hw-ai-infra.AC5: Instance admin settings for LLM configuration
- **hw-ai-infra.AC5.1 Success:** Admin settings page displays provider, model, API key, and base URL fields
- **hw-ai-infra.AC5.2 Success:** Changing provider/model in settings takes effect on next AI request
- **hw-ai-infra.AC5.3 Success:** API key is stored encrypted (existing pattern via `LLM_API_KEY`)
- **hw-ai-infra.AC5.4 Edge:** Base URL field is optional — blank means use provider default

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Add /rephrase-grammar/ backend endpoint

**Verifies:** hw-ai-infra.AC3.1, hw-ai-infra.AC3.3

**Files:**
- Modify: `apps/api/plane/app/views/external/base.py` (add new view class after WorkspaceGPTIntegrationEndpoint)
- Modify: `apps/api/plane/app/urls/external.py` (register new endpoint)
- Test: `apps/api/plane/tests/contract/hw/test_grammar_endpoint.py` (contract)

**Implementation:**

Create a new `GrammarCorrectionEndpoint` view class in `base.py` following the pattern of `WorkspaceGPTIntegrationEndpoint`. It should:

1. Accept POST with JSON body `{"task": "<task_type>", "text_input": "<text>"}`
2. Validate that `text_input` is non-empty — return 400 with `{"error": "Text input is required"}` if empty
3. Use a grammar-correction system prompt: `"Correct the grammar and improve the clarity of the following text. Return only the corrected text, no explanations."`
4. Call `get_llm_response()` with the task as the system prompt and `text_input` as the user prompt
5. Return `{"response": corrected_text}` on success

Register in `urls/external.py`:
```python
path(
    "workspaces/<str:slug>/rephrase-grammar/",
    GrammarCorrectionEndpoint.as_view(),
    name="grammar-correction",
),
```

Use the same permission class as `WorkspaceGPTIntegrationEndpoint` (workspace member access).

**Testing:**

Contract tests:
- hw-ai-infra.AC3.1: POST with valid text returns 200 with `{"response": "..."}` (mock LiteLLM)
- hw-ai-infra.AC3.3: POST with empty `text_input` returns 400 with validation error

Test file: `apps/api/plane/tests/contract/hw/test_grammar_endpoint.py`
Use `session_client` fixture, mock `litellm.completion`.

**Verification:**

Run: `cd apps/api && python run_tests.py -c`
Expected: All tests pass

**Commit:** `feat: add /rephrase-grammar/ endpoint for grammar correction`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Verify frontend grammar integration works

**Verifies:** hw-ai-infra.AC3.2

**Files:**
- No code changes — this is a verification task

**Implementation:**

The frontend already calls this endpoint via `AIService.performEditorTask()` in `apps/web/core/services/ai.service.ts:38-49`:
```typescript
async performEditorTask(workspaceSlug: string, data: TTaskPayload): Promise<{ response: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/rephrase-grammar/`, data)
}
```

And it's called from `apps/web/hw/components/pages/editor/ai/menu.tsx:78`.

**Verification:**

Run: `cd apps/web && pnpm check:types`
Expected: No type errors. The endpoint response shape `{"response": string}` matches what the frontend expects.

**Commit:** No commit needed — verification only.
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->
### Task 3: Replace "Pi" branding with configurable AI name constant

**Verifies:** hw-ai-infra.AC4.1, hw-ai-infra.AC4.2

**Files:**
- Modify: `apps/web/core/constants/ai.ts`
- Modify: `apps/web/hw/components/pages/editor/ai/menu.tsx`
- Modify: `apps/web/ce/components/pages/editor/ai/menu.tsx`
- Rename: `apps/web/hw/components/pages/editor/ai/ask-pi-menu.tsx` → `apps/web/hw/components/pages/editor/ai/ask-ai-menu.tsx`
- Rename: `apps/web/ce/components/pages/editor/ai/ask-pi-menu.tsx` → `apps/web/ce/components/pages/editor/ai/ask-ai-menu.tsx`
- Modify: `apps/web/hw/components/pages/editor/ai/index.ts` (update export)
- Modify: `apps/web/ce/components/pages/editor/ai/index.ts` (update export)

**Implementation:**

1. In `apps/web/core/constants/ai.ts`:
   - Add `export const AI_ASSISTANT_NAME = "Kairos";` as a single top-level constant
   - Replace `"Pi is generating response"` with `` `${AI_ASSISTANT_NAME} is generating response` `` in `LOADING_TEXTS`

2. In both `hw/` and `ce/` `menu.tsx` files:
   - Import `AI_ASSISTANT_NAME` from `@/core/constants/ai`
   - Replace the hardcoded `"Ask Pi"` menu label (line ~42) with `` `Ask ${AI_ASSISTANT_NAME}` ``
   - Replace `"Pi is writing"` (line ~268) with `` `${AI_ASSISTANT_NAME} is writing` ``

3. Rename the `ask-pi-menu.tsx` files to `ask-ai-menu.tsx` in both `hw/` and `ce/` directories:
   - Rename the component from `AskPiMenu` to `AskAIMenu`
   - Update all imports of `AskPiMenu` to `AskAIMenu` in both menu.tsx files and index.ts exports

4. Update `index.ts` files to export from the renamed file.

**Testing:**

Run: `cd apps/web && grep -rn "Pi\|Ask Pi\|AskPi\|ask-pi" core/constants/ hw/components/pages/editor/ai/ ce/components/pages/editor/ai/`
Expected: Zero matches for "Pi" branding (only the new `AI_ASSISTANT_NAME` constant should remain)

Run: `cd apps/web && pnpm check:types`
Expected: No type errors

**Verification:**

Run: `pnpm check:types && pnpm check:lint`
Expected: All checks pass

**Commit:** `feat: rebrand AI assistant from Pi to configurable name`
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Remove 50 requests/month rate limit

**Verifies:** hw-ai-infra.AC4.3

**Files:**
- Modify: `apps/web/core/components/core/modals/gpt-assistant-popover.tsx:94-95`

**Implementation:**

In the error handler at line 94-95, replace the 50 requests/month error message. The current code:

```typescript
const errorMessage =
  err?.status === 429
    ? error || "You have reached the maximum number of requests of 50 requests per month per user."
    : error || "Some error occurred. Please try again.";
```

Replace with a generic rate limit message that doesn't mention a specific cap:

```typescript
const errorMessage =
  err?.status === 429
    ? error || "Rate limit exceeded. Please try again later."
    : error || "Some error occurred. Please try again.";
```

The 429 handling stays (the LLM provider may return rate limit errors) but the fictional 50/month cap message is removed.

**Testing:**

Run: `cd apps/web && grep -rn "50 requests\|per month per user" .`
Expected: Zero matches

Run: `pnpm check:types`
Expected: No type errors

**Verification:**

Run: `pnpm check`
Expected: All checks pass

**Commit:** `fix: remove hardcoded 50 requests/month rate limit message`
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Search for any remaining "Pi" or "GPT" branding

**Verifies:** hw-ai-infra.AC4.1

**Files:**
- Potentially additional files found during search

**Implementation:**

Run a broad search for remaining AI branding that should be updated:

```bash
grep -rn '"Pi "\|"Ask Pi"\|"Pi is\|AskPi\|ask-pi' apps/web/
grep -rn 'GPTIntegration\|gpt-assistant\|GPT' apps/web/ --include="*.tsx" --include="*.ts"
```

Note: Backend class names like `GPTIntegrationEndpoint` are internal and don't need renaming (they're not user-facing). Frontend component file names like `gpt-assistant-popover.tsx` are also internal, but any user-facing strings containing "GPT" should be replaced.

Update any additional references found. The admin sidebar description "Configure your OpenAI creds." at `apps/admin/hooks/use-sidebar-menu/core.ts` should be updated to "Configure AI provider settings."

**Verification:**

Run: `pnpm check`
Expected: All checks pass

**Commit:** `chore: clean up remaining AI branding references`
<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 6-7) -->

<!-- START_TASK_6 -->
### Task 6: Extend admin AI settings with provider and base URL fields

**Verifies:** hw-ai-infra.AC5.1, hw-ai-infra.AC5.3, hw-ai-infra.AC5.4

**Files:**
- Modify: `packages/types/src/instance/ai.ts` (add new config key types)
- Modify: `apps/admin/app/(all)/(dashboard)/ai/form.tsx` (add provider dropdown and base URL field)

**Implementation:**

1. In `packages/types/src/instance/ai.ts`, extend the type:
```typescript
export type TInstanceAIConfigurationKeys = "LLM_API_KEY" | "LLM_MODEL" | "LLM_PROVIDER" | "LLM_BASE_URL";
```

2. In `apps/admin/app/(all)/(dashboard)/ai/form.tsx`:

Add two new fields to the form:

- **LLM_PROVIDER**: A select/dropdown field with options: `"anthropic"`, `"openai"`, `"gemini"`. Default: `"anthropic"`. Label: "LLM Provider". Description: "Select your AI provider. Anthropic is recommended."

- **LLM_BASE_URL**: A text field. Label: "Base URL (optional)". Description: "Custom endpoint URL for Ollama or self-hosted providers. Leave blank to use the provider's default API endpoint." Placeholder: `"http://localhost:11434"`.

Follow the existing form field pattern using `TControllerInputFormField` from `apps/admin/components/common/controller-input.tsx`.

Update the form's `defaultValues` to include the new fields from `config["LLM_PROVIDER"]` and `config["LLM_BASE_URL"]`.

Update the sidebar description at `apps/admin/hooks/use-sidebar-menu/core.ts` from "Configure your OpenAI creds." to "Configure AI provider settings."

3. The backend already handles these keys:
   - `LLM_PROVIDER` is already in `llm_config_variables` (core.py)
   - `LLM_BASE_URL` was added in Phase 1, Task 2
   - The `PATCH /api/instances/configurations/` endpoint handles any valid configuration key
   - `LLM_API_KEY` already has `is_encrypted=True`

**Testing:**

Run: `pnpm check:types`
Expected: No type errors — the new type keys are used in the form and compatible with the instance configuration API.

**Verification:**

Run: `pnpm check`
Expected: All checks pass

**Commit:** `feat: extend admin AI settings with provider and base URL fields`
<!-- END_TASK_6 -->

<!-- START_TASK_7 -->
### Task 7: Verify admin settings take effect on LLM requests

**Verifies:** hw-ai-infra.AC5.2

**Files:**
- No code changes — this is a verification and documentation task

**Implementation:**

The flow is already wired:
1. Admin saves settings → PATCH `/api/instances/configurations/` → stored in `InstanceConfiguration` table
2. AI request comes in → `get_llm_config()` calls `get_configuration_value()` → reads from `InstanceConfiguration` table
3. `get_llm_response()` uses the returned provider, model, API key, base URL

No additional code needed — the existing `get_configuration_value()` mechanism in `apps/api/plane/license/utils/instance_value.py` reads from the database on each request.

Verify this by reading through the flow in:
- `apps/api/plane/app/views/external/base.py` → `get_llm_config()` → `get_configuration_value()`
- `apps/api/plane/license/utils/instance_value.py` → reads `InstanceConfiguration` table

**Verification:**

Run: `cd apps/api && python run_tests.py -u`
Expected: Existing tests still pass — config reading is already tested.

**Commit:** No commit needed — verification only.
<!-- END_TASK_7 -->

<!-- START_TASK_8 -->
### Task 8: Write contract test for admin settings persistence (AC5.2)

**Verifies:** hw-ai-infra.AC5.2

**Files:**
- Create: `apps/api/plane/tests/contract/hw/test_llm_admin_settings.py`

**Testing:**

A contract test verifying that changing LLM settings via the instance configuration API affects subsequent `get_llm_config()` calls:

- hw-ai-infra.AC5.2: Create `InstanceConfiguration` entries for `LLM_PROVIDER` and `LLM_BASE_URL`, then call `get_llm_config()` and verify the returned values match what was stored. Update the values, call again, and verify the new values are returned.

The test should:
1. Create `InstanceConfiguration` objects directly (or via the admin API endpoint if accessible in tests)
2. Call `get_llm_config()` and assert provider/base_url match
3. Update the `InstanceConfiguration` values
4. Call `get_llm_config()` again and assert the new values are returned

This requires `SKIP_ENV_VAR=True` in test settings so `get_configuration_value()` reads from the database rather than environment variables. Check the test settings at `apps/api/plane/settings/test.py` for this flag.

Use `@pytest.mark.contract` and `@pytest.mark.django_db`.

**Verification:**

Run: `cd apps/api && python run_tests.py -c`
Expected: All tests pass

**Commit:** `test: add contract test for admin LLM settings persistence`
<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_C -->
