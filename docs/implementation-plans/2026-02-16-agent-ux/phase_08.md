# Agent Chat UI Implementation Plan

**Goal:** Build a persistent conversational sidebar panel where users have multi-turn dialogues with the built-in agent, with real-time activity streaming.

**Architecture:** Persistent right-side panel injected into the HW `WorkspaceContentWrapper`. MobX store for conversations/messages. SSE via `EventSource` for real-time activity streaming. Reuses existing `AgentRunStore` for activity data. New service layer for conversation CRUD and message sending.

**Tech Stack:** React 19, MobX, EventSource (SSE), TailwindCSS, Lucide icons, highlight.js (via existing lowlight for code blocks)

**Scope:** Phase 8 of 8 from original design (phases 6-8 are frontend UI)

**Codebase verified:** 2026-02-17

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC3: Agent chat panel

- **agent-ux.AC3.1 Success:** A trigger button opens a right sidebar chat panel that persists across page navigation within the workspace.
- **agent-ux.AC3.2 Success:** Sending a message creates a conversation (or continues an existing one) and triggers the built-in agent.
- **agent-ux.AC3.3 Success:** Agent reasoning (thoughts), generated code (actions), tool call results (actions), and final responses stream into the panel in real-time via SSE.
- **agent-ux.AC3.4 Success:** Multi-turn conversation maintains context — the agent's second response accounts for the first exchange.
- **agent-ux.AC3.5 Success:** Elicitation cards render within the chat panel and submitting a response continues the agent's execution.
- **agent-ux.AC3.6 Success:** The agent can operate across the workspace — creating issues, querying cycles, assigning users — from within the chat panel.
- **agent-ux.AC3.7 Failure:** Agent operations respect the user's permissions. An operation the user can't perform manually fails with a clear error in the chat.
- **agent-ux.AC3.8 Edge:** If the SSE connection drops, the panel recovers by fetching missed activities and re-opening the EventSource.
- **agent-ux.AC3.9 Edge:** CE build has no chat panel trigger (CE stub returns null).

### agent-ux.AC6: Cross-cutting behaviours

- **agent-ux.AC6.3:** HW/CE overlay pattern is maintained — `AgentChatPanel` has a CE stub returning `null`.

---

## Codebase Verification Findings

- ✓ `WorkspaceContentWrapper` HW overlay confirmed at `apps/web/hw/components/workspace/content-wrapper.tsx` — flex layout with `AppRailRoot` and content children, ideal injection point for persistent right panel
- ✓ CE content wrapper at `apps/web/ce/components/workspace/content-wrapper.tsx` — identical structure, will remain unchanged
- ✓ Existing `AgentRunStore` at `apps/web/hw/store/agent/agent-run.store.ts` — has `fetchRunsForIssue`, `fetchActivitiesForRun`, `postElicitationResponse`
- ✓ Existing `AgentRunPanel` at `apps/web/hw/components/issues/agent/agent-run-panel.tsx` — template for activity rendering with type-based dispatch
- ✓ Existing `ElicitationCard` at `apps/web/hw/components/issues/agent/elicitation-card.tsx` — reusable for chat elicitation
- ✓ Activity renderers at `apps/web/hw/components/issues/agent/activity-renderers.tsx` — `ThoughtRenderer`, `ActionRenderer`, `ErrorRenderer`, `ResponseRenderer`
- ✓ Code highlighting via lowlight at `packages/editor/src/core/extensions/code/lowlight-plugin.ts` — uses highlight.js, available for reuse
- ✗ No `AgentConversation` model exists yet — Phase 1 deliverable (conversation models, serializers, migrations)
- ✗ No conversation API endpoints exist yet — Phase 4 deliverable (create conversation, send message, list messages)
- ✗ No SSE/EventSource infrastructure exists yet — Phase 5 deliverable (Redis pub/sub SSE views, event emission)
- ✗ No `AgentConversationStore` exists — must be created
- ✗ No `AgentConversationService` exists — must be created

**Critical dependencies:** This phase assumes Phases 1, 4, and 5 are complete. All conversation models, API endpoints, and SSE infrastructure must exist before these frontend components can function end-to-end. However, the UI components can be built and tested with mocked data, and SSE integration can be stubbed until Phase 5 lands.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Add conversation types

**Verifies:** agent-ux.AC3.2, agent-ux.AC3.4 (type foundation)

**Files:**

- Modify: `apps/web/hw/types/agent.ts`

**Implementation:**

Add conversation and message types that match the backend models from Phase 1. These types represent the conversation structure for the chat UI.

```typescript
export type TAgentConversation = {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TAgentConversationMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TCreateConversationPayload = {
  title?: string;
};

export type TCreateMessagePayload = {
  content: string;
};
```

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(types): add agent conversation and message types`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create AgentConversationService

**Verifies:** agent-ux.AC3.2, agent-ux.AC3.4

**Files:**

- Create: `apps/web/hw/services/agent-conversation.service.ts`

**Implementation:**

Create a service class extending `APIService` (same pattern as `AgentService`). Endpoints match Phase 4 API routes.

Methods:

- `listConversations(workspaceSlug: string): Promise<TAgentConversation[]>` — `GET /api/workspaces/{slug}/agent-conversations/`
- `createConversation(workspaceSlug: string, data: TCreateConversationPayload): Promise<TAgentConversation>` — `POST /api/workspaces/{slug}/agent-conversations/`
- `getConversation(workspaceSlug: string, conversationId: string): Promise<TAgentConversation>` — `GET /api/workspaces/{slug}/agent-conversations/{id}/`
- `listMessages(workspaceSlug: string, conversationId: string): Promise<TAgentConversationMessage[]>` — `GET /api/workspaces/{slug}/agent-conversations/{id}/messages/`
- `sendMessage(workspaceSlug: string, conversationId: string, data: TCreateMessagePayload): Promise<TAgentConversationMessage>` — `POST /api/workspaces/{slug}/agent-conversations/{id}/messages/`

Follow the existing `AgentService` pattern at `apps/web/hw/services/agent.service.ts` for URL construction and error handling.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(services): add agent conversation service`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: AgentConversationService tests

**Verifies:** agent-ux.AC3.2, agent-ux.AC3.4

**Files:**

- Create: `apps/web/hw/services/agent-conversation.service.test.ts`

**Testing:**
Tests must verify:

- agent-ux.AC3.2: `sendMessage` calls correct endpoint with payload and returns parsed response
- agent-ux.AC3.4: `listMessages` calls correct endpoint and returns messages array
- `createConversation` calls correct endpoint
- `listConversations` calls correct endpoint

Mock the HTTP layer. Follow patterns from any existing service tests in the codebase.

**Verification:**
Run: `pnpm --filter=web test -- --run agent-conversation.service`
Expected: All tests pass

**Commit:** `test(services): add agent conversation service tests`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-6) -->

<!-- START_TASK_4 -->

### Task 4: Create AgentConversationStore

**Verifies:** agent-ux.AC3.1, agent-ux.AC3.2, agent-ux.AC3.4, agent-ux.AC3.6

**Files:**

- Create: `apps/web/hw/store/agent/agent-conversation.store.ts`
- Modify: `apps/web/hw/store/agent/index.ts` (barrel export)
- Modify: `apps/web/hw/store/root.store.ts` (register on rootStore)

**Implementation:**

Create a MobX store following the `AgentRunStore` pattern. The store manages:

1. **Conversations list**: `conversations: Record<string, TAgentConversation> | null` — keyed by ID
2. **Messages by conversation**: `messagesByConversationId: Record<string, TAgentConversationMessage[]>` — keyed by conversation ID
3. **Active conversation**: `activeConversationId: string | null` — currently open conversation
4. **Panel state**: `isPanelOpen: boolean` — controls panel visibility (persists across navigation)
5. **Loader**: `loaderCount: number` — reference-counted loader (follow AgentRunStore pattern)

Actions:

- `fetchConversations(workspaceSlug)` — loads all conversations
- `createConversation(workspaceSlug, data)` — creates new conversation, sets as active
- `fetchMessages(workspaceSlug, conversationId)` — loads messages for a conversation
- `sendMessage(workspaceSlug, conversationId, data)` — sends message, optimistically adds to list
- `openPanel()` / `closePanel()` / `togglePanel()` — panel visibility
- `setActiveConversation(id)` — switches active conversation
- `appendActivity(conversationId, activity)` — called by SSE handler to add streamed activities

Computed helpers:

- `activeConversation` — returns the active `TAgentConversation` or null
- `activeMessages` — returns messages for the active conversation
- `hasActiveConversation` — boolean

Register on `rootStore.agentConversationStore` in the HW root store.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(store): add agent conversation MobX store`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: AgentConversationStore tests

**Verifies:** agent-ux.AC3.1, agent-ux.AC3.2, agent-ux.AC3.4

**Files:**

- Create: `apps/web/hw/store/agent/agent-conversation.store.test.ts`

**Testing:**
Tests must verify:

- agent-ux.AC3.2: `sendMessage` calls service, optimistically adds message to store, and updates on response
- agent-ux.AC3.4: `fetchMessages` populates `messagesByConversationId` for the given conversation
- agent-ux.AC3.1: `isPanelOpen` persists through simulated actions (open, navigate mock, verify still open)
- `createConversation` adds to conversations map and sets `activeConversationId`
- `appendActivity` adds activities to the correct conversation's message list

Mock the service layer. Follow the `AgentRunStore` test patterns if they exist, otherwise follow `WebhookStore` test patterns.

**Verification:**
Run: `pnpm --filter=web test -- --run agent-conversation.store`
Expected: All tests pass

**Commit:** `test(store): add agent conversation store tests`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: CE stubs for conversation store

**Verifies:** agent-ux.AC6.3

**Files:**

- Modify: `apps/web/ce/store/root.store.ts` (add `agentConversationStore` instantiation)

**Implementation:**

The CE root store at `apps/web/ce/store/root.store.ts` imports and instantiates `AgentRunStore` from `@/plane-web/store/agent/agent-run.store.ts` identically to the HW root store. Follow this same pattern: import `AgentConversationStore` from `@/plane-web/store/agent/agent-conversation.store.ts` and instantiate it in the CE root store constructor. The key contract is that `rootStore.agentConversationStore` exists in both builds.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(ce): add conversation store stub to CE root store`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-10) -->

<!-- START_TASK_7 -->

### Task 7: Create ChatMessageList component

**Verifies:** agent-ux.AC3.3, agent-ux.AC3.4, agent-ux.AC3.5, agent-ux.AC3.7

**Files:**

- Create: `apps/web/hw/components/agent/chat/chat-message-list.tsx`

**Implementation:**

A scrollable message list that renders user messages and agent activity messages. This is the core visual component of the chat panel.

Structure:

- Receives `messages: TAgentConversationMessage[]` and `activities: TAgentRunActivity[]` as props (or reads from store)
- Renders messages in chronological order
- User messages: right-aligned bubble with content
- Agent messages: left-aligned, may contain:
  - Response text (from `TAgentRunActivity` with `activity_type: "response"`)
  - Thought/reasoning (collapsible, muted — reuse `ThoughtRenderer` pattern from `activity-renderers.tsx`)
  - Action/tool calls (pill-style — reuse `ActionRenderer` pattern)
  - Code blocks with syntax highlighting (see Task 9)
  - Error messages (red alert — reuse `ErrorRenderer` pattern). **Permission errors** (AC3.7) must be distinguished from generic errors: detect permission-related content (e.g., activities containing "permission", "not authorized", or a structured `permission_error` metadata key) and render them with clear, user-friendly language (e.g., "You don't have permission to create issues in Project X") rather than raw error strings.
  - Elicitation prompts (AC3.5 — reuse `ElicitationCard` component)
- Auto-scrolls to bottom on new messages (use `useEffect` with ref)
- Shows loading indicator when agent is processing (run status is `in_progress`)

Props interface:

```typescript
type TChatMessageListProps = {
  workspaceSlug: string;
  conversationId: string;
};
```

The component should be an `observer` to reactively update from the MobX store.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): create ChatMessageList component`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Create ChatInput component

**Verifies:** agent-ux.AC3.2

**Files:**

- Create: `apps/web/hw/components/agent/chat/chat-input.tsx`

**Implementation:**

A text input with send button for composing messages.

Features:

- Text input (textarea) with auto-resize
- Send button (enabled only when input is non-empty and agent is not processing)
- Enter to send, Shift+Enter for newline
- Disabled state while agent is processing (show "Agent is thinking...")
- On send: calls store's `sendMessage`, clears input

Props interface:

```typescript
type TChatInputProps = {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};
```

Keep this component simple — it's just the input mechanism, not the message display.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): create ChatInput component`

<!-- END_TASK_8 -->

<!-- START_TASK_9 -->

### Task 9: Create AgentCodeBlock component

**Verifies:** agent-ux.AC3.3 (code blocks are part of action activity rendering)

**Files:**

- Create: `apps/web/hw/components/agent/chat/agent-code-block.tsx`

**Implementation:**

A syntax-highlighted code block renderer for code that appears in agent responses. Reuses the existing highlight.js infrastructure from the editor.

The existing lowlight plugin at `packages/editor/src/core/extensions/code/lowlight-plugin.ts` uses `highlight.js/lib/core`. For the chat component, use highlight.js directly:

```typescript
import hljs from "highlight.js/lib/core";
```

Or use a simpler approach with the `lowlight` package if it's already exported.

Features:

- Language detection from code fence markers (e.g., ` ```python `)
- Syntax highlighting via highlight.js
- Copy button (copies code to clipboard)
- Language label in top-right corner
- Styled with Tailwind (dark background, monospace font)

Props interface:

```typescript
type TAgentCodeBlockProps = {
  code: string;
  language?: string;
};
```

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): create AgentCodeBlock with syntax highlighting`

<!-- END_TASK_9 -->

<!-- START_TASK_10 -->

### Task 10: Create ChatSSEManager

**Verifies:** agent-ux.AC3.3, agent-ux.AC3.8

**Files:**

- Create: `apps/web/hw/components/agent/chat/chat-sse-manager.tsx` (or as a hook: `apps/web/hw/hooks/use-chat-sse.ts`)

**Implementation:**

Manages `EventSource` lifecycle for real-time activity streaming. This connects to the SSE endpoint created in Phase 5.

A custom hook is the recommended approach:

```typescript
function useChatSSE(workspaceSlug: string, conversationId: string | null): void;
```

Behaviour:

- When `conversationId` is non-null, opens `EventSource` to `/api/workspaces/{slug}/agent-conversations/{id}/events/`
- On message event: parse the activity data, call `agentConversationStore.appendActivity(conversationId, activity)`
- On error: attempt reconnection with exponential backoff (max 5 retries, starting at 1s)
- On reconnection: do a catch-up fetch of activities since last received timestamp to avoid gaps
- Cleanup: close `EventSource` on unmount or when `conversationId` changes

The hook uses `useEffect` for lifecycle management and accesses the store via `useContext` or direct MobX store import.

**SSE endpoint URL verification:** The URL `/api/workspaces/{slug}/agent-conversations/{id}/events/` depends on Phase 5's implementation. Phase 5 uses raw Redis pub/sub with async `StreamingHttpResponse` (not django-eventstream). The SSE endpoints are standard Django URL routes. Reference the Phase 5 implementation plan for the correct endpoint paths.

**Graceful degradation:** If the SSE endpoint is not yet available (Phase 5 not complete) or returns 404, log the error and fall back to polling with `setInterval` every 3 seconds.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): create SSE manager hook for real-time streaming`

<!-- END_TASK_10 -->

<!-- END_SUBCOMPONENT_C -->

<!-- START_SUBCOMPONENT_D (tasks 11-13) -->

<!-- START_TASK_11 -->

### Task 11: Create AgentChatPanel container

**Verifies:** agent-ux.AC3.1, agent-ux.AC3.6

**Files:**

- Create: `apps/web/hw/components/agent/chat/agent-chat-panel.tsx`
- Create: `apps/web/hw/components/agent/chat/index.ts` (barrel export)

**Implementation:**

The main container component that assembles the chat UI. This is the component injected into `WorkspaceContentWrapper`.

Structure:

```
AgentChatPanel (sidebar container)
├── Header (title, close button, conversation selector)
├── ChatMessageList (scrollable message history)
├── ChatInput (text input with send)
└── useChatSSE hook (real-time streaming)
```

Features:

- Fixed-width right sidebar (e.g., 400px, or resizable with drag handle)
- Slide-in/slide-out animation on open/close
- Header with:
  - "Agent Chat" title
  - Close button (X icon)
  - "New conversation" button
- Reads `isPanelOpen` and `activeConversationId` from `agentConversationStore`
- On mount with active conversation: fetches messages and connects SSE
- On send: if no active conversation, creates one first, then sends message
- `observer` wrapper for MobX reactivity

The panel renders conditionally based on `isPanelOpen` from the store.

```typescript
export const AgentChatPanel = observer(function AgentChatPanel({ workspaceSlug }: { workspaceSlug: string }) {
  const { agentConversationStore } = useRootStore();
  if (!agentConversationStore?.isPanelOpen) return null;
  // ... render panel
});
```

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): create AgentChatPanel container`

<!-- END_TASK_11 -->

<!-- START_TASK_12 -->

### Task 12: Add chat panel trigger button

**Verifies:** agent-ux.AC3.1

**Files:**

- Create: `apps/web/hw/components/agent/chat/chat-trigger-button.tsx`

**Implementation:**

A floating action button that toggles the chat panel. Positioned in the bottom-right corner of the workspace.

Features:

- Circular button with `Bot` icon (from Lucide, consistent with agent branding)
- Fixed position: `bottom-6 right-6`
- Calls `agentConversationStore.togglePanel()` on click
- Shows a badge/dot indicator when there are unread messages (optional, can be deferred)
- Only renders in HW build (part of HW component tree)

```typescript
export const ChatTriggerButton = observer(function ChatTriggerButton() {
  const { agentConversationStore } = useRootStore();
  if (!agentConversationStore) return null;

  return (
    <button onClick={() => agentConversationStore.togglePanel()} className="fixed bottom-6 right-6 z-50 ...">
      <Bot className="size-5" />
    </button>
  );
});
```

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): add floating trigger button`

<!-- END_TASK_12 -->

<!-- START_TASK_13 -->

### Task 13: Inject chat panel into WorkspaceContentWrapper

**Verifies:** agent-ux.AC3.1

**Files:**

- Modify: `apps/web/hw/components/workspace/content-wrapper.tsx`

**Implementation:**

Add the `AgentChatPanel` and `ChatTriggerButton` as siblings in the workspace layout. The panel sits to the right of the main content area, inside the flex container.

Current structure (line 27-39):

```tsx
<div className="relative flex size-full overflow-hidden">
  {shouldRenderAppRail && <AppRailRoot />}
  <div className={cn("relative size-full pl-2 pb-2 pr-2 flex-grow ...")}>{children}</div>
</div>
```

Updated structure:

```tsx
<div className="relative flex size-full overflow-hidden">
  {shouldRenderAppRail && <AppRailRoot />}
  <div className={cn("relative size-full pl-2 pb-2 pr-2 flex-grow ...")}>{children}</div>
  <AgentChatPanel workspaceSlug={workspaceSlug} />
  <ChatTriggerButton />
</div>
```

The `workspaceSlug` can be obtained from the URL params (check existing pattern in the workspace layout). The `AgentChatPanel` component handles its own visibility via the store's `isPanelOpen` state.

When the panel is open, the main content area should shrink to accommodate it. This can be done with flexbox — the panel has a fixed width and the content area has `flex-grow`.

**Note:** The CE `WorkspaceContentWrapper` at `apps/web/ce/components/workspace/content-wrapper.tsx` remains unchanged — it doesn't import or render the chat components.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(chat): inject chat panel into workspace layout`

<!-- END_TASK_13 -->

<!-- END_SUBCOMPONENT_D -->

<!-- START_SUBCOMPONENT_E (tasks 14-16) -->

<!-- START_TASK_14 -->

### Task 14: CE stubs for chat components

**Verifies:** agent-ux.AC3.9, agent-ux.AC6.3

**Files:**

- Create: `apps/web/ce/components/agent/chat/agent-chat-panel.tsx`
- Create: `apps/web/ce/components/agent/chat/chat-trigger-button.tsx`
- Create: `apps/web/ce/components/agent/chat/index.ts`

**Implementation:**

CE stubs that return `null` — matching the pattern from `AgentRunPanel` CE stub.

```typescript
// agent-chat-panel.tsx
export const AgentChatPanel = () => null;

// chat-trigger-button.tsx
export const ChatTriggerButton = () => null;
```

Barrel export both from `index.ts`.

CE chat stubs go under `components/agent/chat/` (not `components/issues/agent/`) because the chat panel is workspace-scoped, not issue-scoped — mirroring the HW path at `apps/web/hw/components/agent/chat/`.

These are only needed if the `WorkspaceContentWrapper` imports from `@/plane-web/` for these components. Verify at execution time — if the HW wrapper imports directly from `@/plane-web/components/agent/chat/`, the CE stubs must exist at the matching CE path.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(ce): add CE stubs for chat panel components`

<!-- END_TASK_14 -->

<!-- START_TASK_15 -->

### Task 15: i18n keys for chat UI

**Verifies:** agent-ux.AC3.1

**Files:**

- Modify: i18n locale files (check which files at execution time — likely `packages/i18n/src/locales/en.json` or similar)

**Implementation:**

Add translation keys for chat UI strings:

- `agent_chat.title`: "Agent Chat"
- `agent_chat.new_conversation`: "New conversation"
- `agent_chat.placeholder`: "Send a message..."
- `agent_chat.thinking`: "Agent is thinking..."
- `agent_chat.send`: "Send"
- `agent_chat.copy_code`: "Copy code"
- `agent_chat.copied`: "Copied!"
- `agent_chat.reconnecting`: "Reconnecting..."
- `agent_chat.connection_lost`: "Connection lost. Retrying..."

Follow existing i18n patterns in the codebase. If the project doesn't use i18n heavily, hardcode strings and skip this task.

**Verification:**
Run: `pnpm check:types`
Expected: No type errors

**Commit:** `feat(i18n): add chat UI translation keys`

<!-- END_TASK_15 -->

<!-- START_TASK_16 -->

### Task 16: Chat panel integration tests

**Verifies:** agent-ux.AC3.1, agent-ux.AC3.2, agent-ux.AC3.4, agent-ux.AC3.5, agent-ux.AC3.7, agent-ux.AC3.9, agent-ux.AC6.3

**Files:**

- Create: `apps/web/hw/components/agent/chat/agent-chat-panel.test.tsx`

**Testing:**
Tests must verify:

- agent-ux.AC3.1: Panel renders when `isPanelOpen` is true, hidden when false. Trigger button toggles panel. Panel persists across navigation.
- agent-ux.AC3.2: Sending a message calls `agentConversationStore.sendMessage` with correct args. If no active conversation, `createConversation` is called first.
- agent-ux.AC3.4: Message list renders all messages from the active conversation in order.
- agent-ux.AC3.5: When activities include an elicitation type, `ElicitationCard` renders with submit handler.
- agent-ux.AC3.7: When activities include a permission error (`activity_type: "error"` with permission-related content), the error renders with user-friendly messaging (not raw error text).
- agent-ux.AC3.9: CE stubs render null.
- agent-ux.AC6.3: CE stubs render null (same as AC3.9 — tests both the component stub and the pattern).

Mock the MobX store and service layer. Use `@testing-library/react` for component rendering. Follow existing test patterns.

**Verification:**
Run: `pnpm --filter=web test -- --run agent-chat-panel`
Expected: All tests pass

**Commit:** `test(chat): add chat panel integration tests`

<!-- END_TASK_16 -->

<!-- END_SUBCOMPONENT_E -->
