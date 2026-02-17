# Agent UX Implementation Plan — Phase 2: Tool Registry

**Goal:** Create the self-documenting tool registry with MVP tool set and permission enforcement.

**Architecture:** A Python decorator-based registry where each tool declares its name, description, parameter schema, and return schema. The registry generates markdown documentation for the LLM system prompt and TypeScript declarations for the sandbox. Tools execute within a `ToolContext` carrying the triggering user, workspace, and current `AgentRun`, with permission enforcement reusing existing DRF role patterns.

**Tech Stack:** Django 4.2, Django REST Framework 3.15, Python dataclasses, pytest with pytest-django

**Scope:** 8 phases from original design (this is phase 2 of 8)

**Codebase verified:** 2026-02-16

---

## Acceptance Criteria Coverage

This phase implements and tests:

### agent-ux.AC4: Built-in agent runtime

- **agent-ux.AC4.4 Success:** The tool registry generates correct markdown documentation and typed sandbox bindings from registered tool definitions.
- **agent-ux.AC4.6 Failure:** A tool call for an operation the user lacks permission for returns a permission error to the sandbox (not a crash).
- **agent-ux.AC4.8 Failure:** Invalid tool name in sandbox code returns a tool error (not a crash).

---

## Investigation findings

- **No `agent_tools/` directory exists** — needs to be created under `apps/api/plane/hw/`.
- **Issue model** at `apps/api/plane/db/models/issue.py:104-242` — key fields: name, description_html, state (FK), priority (choices), assignees (M2M through IssueAssignee), labels (M2M through IssueLabel), project (FK), sequence_id (auto). Required for creation: project, name; state auto-assigned in save().
- **IssueComment model** at `apps/api/plane/db/models/issue.py:441-530` — fields: issue (FK), comment_html, actor (FK), access.
- **Project model** at `apps/api/plane/db/models/project.py:68-177` — fields: name, workspace (FK), identifier, network.
- **Cycle model** at `apps/api/plane/db/models/cycle.py:60-101` — through model `CycleIssue` (lines 104-127) for linking issues.
- **Module model** at `apps/api/plane/db/models/module.py:67-127` — through model `ModuleIssue` (lines 152-171) for linking issues.
- **Label model** at `apps/api/plane/db/models/label.py:11-57` — workspace or project scoped.
- **State model** at `apps/api/plane/db/models/state.py:79-126` — `objects` manager excludes triage states. Fields: name, color, group, project.
- **Permission pattern** at `apps/api/plane/app/permissions/base.py:19-77` — `@allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT"|"WORKSPACE")`. Workspace admins override project-level checks.
- **WorkspaceMember** at `apps/api/plane/db/models/workspace.py:198-231` — roles: 20=Admin, 15=Member, 5=Guest.
- **ProjectMember** at `apps/api/plane/db/models/project.py:210-260` — same role values.
- **Issue search** at `apps/api/plane/utils/issue_search.py:14-24` — simple `icontains` on name, sequence_id, project\_\_identifier.

---

<!-- START_SUBCOMPONENT_A (tasks 1-3) -->

<!-- START_TASK_1 -->

### Task 1: Create ToolRegistry, ToolContext, and @tool decorator

**Verifies:** agent-ux.AC4.4, agent-ux.AC4.8

**Files:**

- Create: `apps/api/plane/hw/agent_tools/__init__.py`
- Create: `apps/api/plane/hw/agent_tools/registry.py`

**Implementation:**

Create `apps/api/plane/hw/agent_tools/__init__.py` as an empty file (tool module imports will be added in Task 4).

Create `apps/api/plane/hw/agent_tools/registry.py` with:

1. `ToolParam` dataclass — represents one parameter of a tool:
   - `name: str`
   - `type: str` (e.g., "string", "integer", "boolean", "array")
   - `description: str`
   - `required: bool = True`
   - `items_type: str | None = None` (for array types)

2. `ToolDefinition` dataclass — represents a registered tool:
   - `name: str` (dotted name like "issues.create")
   - `description: str`
   - `params: list[ToolParam]`
   - `return_type: str` (description of return value)
   - `handler: Callable`
   - `requires_project: bool = False` (whether tool needs project_id in context)

3. `ToolContext` dataclass — execution context passed to every tool call:
   - `user: User` (the triggering user, for permission checks)
   - `workspace: Workspace`
   - `run: AgentRun`
   - `project_id: UUID | None = None` (set when run is project-scoped)

4. `ToolRegistry` class (instantiable, with module-level `default_registry` singleton):
   - `_tools: dict[str, ToolDefinition]` instance variable (set in `__init__`)
   - `tool(name, description, params, return_type, requires_project=False)` decorator — registers the decorated function on this instance. A module-level `tool = default_registry.tool` alias provides the `@tool(...)` convenience decorator for production code.
   - `get_tool(name) -> ToolDefinition | None`
   - `list_tools() -> list[ToolDefinition]`
   - `execute(name, params, context) -> dict` — looks up tool, validates it exists, calls handler with params and context. Returns `{"result": ...}` on success or `{"error": ...}` on failure. Catches `PermissionError` and returns an error dict (not a crash). Returns error for unknown tool names (not a crash).
   - `generate_docs() -> str` — produces markdown documentation of all registered tools for the LLM system prompt. Format: tool name, description, parameters table (name, type, required, description), return type.
   - `generate_types() -> str` — produces TypeScript declarations for the sandbox. Format: `declare function toolName(params: {...}): Promise<{...}>`.

The `execute()` method must handle three cases gracefully:

- Unknown tool name → return `{"error": "Unknown tool: <name>"}`
- `PermissionError` raised by handler → return `{"error": "Permission denied: <message>"}`
- Any other exception → return `{"error": "Tool execution failed: <message>"}`

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add tool registry with decorator, context, and doc generation`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Permission enforcement helper

**Verifies:** agent-ux.AC4.6

**Files:**

- Create: `apps/api/plane/hw/agent_tools/permissions.py`

**Implementation:**

Create permission check functions that raise `PermissionError` on failure:

1. `check_workspace_member(context: ToolContext, min_role: int = 5) -> None` — verifies that `context.user` is an active `WorkspaceMember` of `context.workspace` with `role >= min_role`. Raises `PermissionError` with descriptive message on failure.

2. `check_project_member(context: ToolContext, project_id: UUID, min_role: int = 5) -> None` — verifies that `context.user` is an active `ProjectMember` of the given project with `role >= min_role`. Workspace admins (role=20) bypass this check (matching the existing pattern at `apps/api/plane/app/permissions/base.py:53-67`). Raises `PermissionError` on failure.

Use role constants from the existing codebase: `ROLE.ADMIN = 20`, `ROLE.MEMBER = 15`, `ROLE.GUEST = 5` (from `apps/api/plane/app/permissions/base.py`).

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add permission enforcement helpers for tool registry`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Tests for registry and permissions

**Verifies:** agent-ux.AC4.4, agent-ux.AC4.6, agent-ux.AC4.8

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_tool_registry.py`

**Testing:**

Tests must verify:

- **agent-ux.AC4.4:** Registering a tool via `@ToolRegistry.tool(...)` makes it accessible via `get_tool()` and `list_tools()`. `generate_docs()` produces markdown containing each registered tool's name, description, and parameter table. `generate_types()` produces TypeScript declarations with correct function signatures.
- **agent-ux.AC4.8:** `execute()` with an unknown tool name returns `{"error": "Unknown tool: <name>"}` — no exception raised.
- **agent-ux.AC4.6:** `execute()` with a handler that raises `PermissionError` returns `{"error": "Permission denied: <message>"}` — no exception raised.
- `check_workspace_member` raises `PermissionError` when user is not a workspace member.
- `check_workspace_member` passes when user is an active workspace member with sufficient role.
- `check_project_member` raises `PermissionError` when user is not a project member and is not a workspace admin.
- `check_project_member` passes when user is a project member with sufficient role.
- `check_project_member` passes for workspace admins even without project membership.

Use `@pytest.mark.django_db` and the existing `workspace`, `create_user` fixtures. Create `ProjectMember` and `WorkspaceMember` records directly.

**Important:** `ToolRegistry` must support both a global singleton (for production) and isolated instances (for testing). Implement this as an instantiable class with a module-level `default_registry = ToolRegistry()` singleton. The `@ToolRegistry.tool(...)` classmethod decorator registers on the default instance. Tests create their own `ToolRegistry()` instances for isolation. Task 1 must implement this pattern — it is not optional.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass.

**Commit:** `test(hw): add tests for tool registry and permission enforcement`

<!-- END_TASK_3 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 4-6) -->

<!-- START_TASK_4 -->

### Task 4: Issue and comment tools

**Verifies:** agent-ux.AC4.4 (partial — tools register and appear in docs)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/tools/__init__.py`
- Create: `apps/api/plane/hw/agent_tools/tools/issues.py`
- Create: `apps/api/plane/hw/agent_tools/tools/comments.py`

**Implementation:**

Create `tools/__init__.py` that imports all tool modules to trigger registration.

`issues.py` — register these tools via `@ToolRegistry.tool(...)`:

1. `issues.list` — List issues in a project. Params: `project_id` (string, required), `state_id` (string, optional), `priority` (string, optional), `assignee_id` (string, optional). Returns list of issue dicts (id, name, state_id, priority, sequence_id, assignees, labels). Permission: `check_project_member(context, project_id, min_role=5)`. Query via `Issue.issue_objects.filter(workspace=context.workspace, project_id=project_id)` with optional filters.

2. `issues.get` — Get a single issue by ID. Params: `issue_id` (string, required). Returns issue dict with full detail. Permission: project member. Query via `Issue.issue_objects.get(id=issue_id, workspace=context.workspace)`.

3. `issues.create` — Create an issue. Params: `project_id` (string, required), `name` (string, required), `description_html` (string, optional), `priority` (string, optional), `state_id` (string, optional), `assignee_ids` (array of strings, optional), `label_ids` (array of strings, optional). Permission: `check_project_member(context, project_id, min_role=15)`. Create via `Issue.objects.create(..., created_by=context.user, updated_by=context.user)`, then add assignees via `IssueAssignee.objects.create()` and labels via `IssueLabel.objects.create()`. All `BaseModel` create operations must include `created_by=context.user, updated_by=context.user`.

4. `issues.update` — Update an issue. Params: `issue_id` (string, required), plus optional fields same as create (except project_id). Permission: project member with role >= 15. Fetch issue, update fields, save.

5. `issues.search` — Search issues by text. Params: `query` (string, required), `project_id` (string, optional — if omitted, search across workspace). Returns list of matching issues. Permission: workspace member (if no project_id) or project member. Uses `search_issues()` from `apps/api/plane/utils/issue_search.py`.

`comments.py` — register these tools:

1. `comments.list` — List comments on an issue. Params: `issue_id` (string, required). Returns list of comment dicts (id, comment_html, actor display_name, created_at). Permission: project member (get project from issue).

2. `comments.create` — Create a comment on an issue. Params: `issue_id` (string, required), `comment_html` (string, required). Permission: project member with role >= 15. Create via `IssueComment.objects.create(issue_id=issue_id, comment_html=comment_html, actor=context.user)`.

Each tool handler should return a plain dict (serialised to JSON by the registry). Use `str(uuid)` for UUID fields in return values.

Update `apps/api/plane/hw/agent_tools/__init__.py` to import `tools` subpackage.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

Run: `python -c "from plane.hw.agent_tools.tools import issues, comments; from plane.hw.agent_tools.registry import ToolRegistry; print(len(ToolRegistry.list_tools()), 'tools registered')"`
Expected: 7 tools registered.

**Commit:** `feat(hw): add issue and comment agent tools`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Project, cycle, and module tools

**Verifies:** agent-ux.AC4.4 (partial)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/tools/projects.py`
- Create: `apps/api/plane/hw/agent_tools/tools/cycles.py`
- Create: `apps/api/plane/hw/agent_tools/tools/modules.py`

**Implementation:**

`projects.py`:

1. `projects.list` — List projects in the workspace. No project-level params. Returns list of project dicts (id, name, identifier, description). Permission: `check_workspace_member(context, min_role=5)`. Query: `Project.objects.filter(workspace=context.workspace, archived_at__isnull=True)`.

2. `projects.get` — Get a single project. Params: `project_id` (string, required). Returns project dict with full detail. Permission: workspace member.

`cycles.py`:

1. `cycles.list` — List cycles in a project. Params: `project_id` (string, required). Returns list of cycle dicts (id, name, start_date, end_date, owned_by). Permission: project member. Query: `Cycle.objects.filter(project_id=project_id, workspace=context.workspace, archived_at__isnull=True)`.

2. `cycles.get` — Get a single cycle. Params: `cycle_id` (string, required), `project_id` (string, required). Returns cycle dict. Permission: project member.

3. `cycles.add_issues` — Add issues to a cycle. Params: `cycle_id` (string, required), `project_id` (string, required), `issue_ids` (array of strings, required). Permission: project member with role >= 15. Create `CycleIssue` records. Skip duplicates (use `get_or_create` or `bulk_create(ignore_conflicts=True)`).

`modules.py`:

1. `modules.list` — List modules in a project. Params: `project_id` (string, required). Returns list of module dicts (id, name, status, start_date, target_date). Permission: project member. Query: `Module.objects.filter(project_id=project_id, workspace=context.workspace, archived_at__isnull=True)`.

2. `modules.get` — Get a single module. Params: `module_id` (string, required), `project_id` (string, required). Returns module dict. Permission: project member.

3. `modules.add_issues` — Add issues to a module. Params: `module_id` (string, required), `project_id` (string, required), `issue_ids` (array of strings, required). Permission: project member with role >= 15. Create `ModuleIssue` records. Skip duplicates.

Update `tools/__init__.py` imports.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

**Commit:** `feat(hw): add project, cycle, and module agent tools`

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->

### Task 6: User, label, and state tools

**Verifies:** agent-ux.AC4.4 (partial)

**Files:**

- Create: `apps/api/plane/hw/agent_tools/tools/users.py`
- Create: `apps/api/plane/hw/agent_tools/tools/labels.py`
- Create: `apps/api/plane/hw/agent_tools/tools/states.py`

**Implementation:**

`users.py`:

1. `users.list` — List workspace members. No params. Returns list of user dicts (id, display_name, email, avatar). Permission: workspace member. Query: active `WorkspaceMember` records for `context.workspace`, select related user, exclude bot users.

2. `users.search` — Search users by name or email. Params: `query` (string, required). Returns matching users. Permission: workspace member. Filter via `Q(member__display_name__icontains=query) | Q(member__email__icontains=query)`.

`labels.py`:

1. `labels.list` — List labels. Params: `project_id` (string, optional). If project_id provided, returns project labels + workspace labels. If omitted, returns workspace-level labels only. Permission: workspace member (or project member if project_id given). Query: `Label.objects.filter(workspace=context.workspace)` with optional project filter.

`states.py`:

1. `states.list` — List states for a project. Params: `project_id` (string, required). Returns list of state dicts (id, name, color, group). Permission: project member. Query: `State.objects.filter(project_id=project_id, workspace=context.workspace)` — the default manager already excludes triage states.

Update `tools/__init__.py` imports.

**Verification:**

Run: `python apps/api/manage.py check`
Expected: System check identifies no issues.

Run: `python -c "from plane.hw.agent_tools.tools import *; from plane.hw.agent_tools.registry import ToolRegistry; print(len(ToolRegistry.list_tools()), 'tools registered')"`
Expected: ~18 tools registered.

**Commit:** `feat(hw): add user, label, and state agent tools`

<!-- END_TASK_6 -->

<!-- END_SUBCOMPONENT_B -->

<!-- START_SUBCOMPONENT_C (tasks 7-8) -->

<!-- START_TASK_7 -->

### Task 7: Tests for MVP tools

**Verifies:** agent-ux.AC4.4, agent-ux.AC4.6

**Files:**

- Create: `apps/api/plane/tests/unit/hw/test_agent_tools.py`

**Testing:**

Tests must verify:

- **agent-ux.AC4.4 (tools):** After importing all tool modules, `ToolRegistry.list_tools()` returns ~18 tools. `generate_docs()` includes each tool name and its parameters. `generate_types()` produces valid TypeScript declarations for each tool.
- **agent-ux.AC4.6 (permissions on tools):** Calling `issues.create` via the registry with a user who is not a project member (or is a guest) returns a permission error, not a crash. Calling `issues.create` with a workspace admin who is not a project member succeeds (workspace admin override).
- **Functional tests for key tools:**
  - `issues.create` creates an Issue in the database with correct fields.
  - `issues.list` returns issues filtered by project.
  - `issues.search` returns matching issues.
  - `comments.create` creates an IssueComment linked to the issue.
  - `cycles.add_issues` creates `CycleIssue` records; duplicate calls don't crash.
  - `modules.add_issues` creates `ModuleIssue` records; duplicate calls don't crash.
  - `users.list` returns workspace members excluding bots.
  - `states.list` returns states for a project excluding triage.

Use `@pytest.mark.django_db` and existing fixtures. Create a `ToolContext` with the test user, workspace, and a test `AgentRun`. Create projects, issues, cycles, modules as needed using the ORM directly or factories.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass.

**Commit:** `test(hw): add tests for MVP agent tools`

<!-- END_TASK_7 -->

<!-- START_TASK_8 -->

### Task 8: Test doc and type generation output

**Verifies:** agent-ux.AC4.4

**Files:**

- Modify: `apps/api/plane/tests/unit/hw/test_tool_registry.py` (add to existing)

**Testing:**

Tests must verify:

- **agent-ux.AC4.4 (doc generation):** `generate_docs()` output is valid markdown. Each registered tool appears in the output with its name, description, and parameter details. The markdown is suitable for inclusion in an LLM system prompt (structured, readable).
- **agent-ux.AC4.4 (type generation):** `generate_types()` output contains TypeScript `declare function` statements for each tool. Parameter types map correctly (string → string, integer → number, boolean → boolean, array → Array<type>). Return types are documented.

These tests should import all real tool modules (not test-only stubs) and validate the full output shape.

**Verification:**

Run: `python apps/api/run_tests.py -u`
Expected: All unit tests pass.

**Commit:** `test(hw): add tests for tool doc and type generation`

<!-- END_TASK_8 -->

<!-- END_SUBCOMPONENT_C -->
