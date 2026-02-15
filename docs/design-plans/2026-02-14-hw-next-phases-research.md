# Plane HW Fork: Next Phases — Research and Decision Archive

**Date:** 2026-02-14
**Status:** Research complete, design docs not yet started
**Context:** Continuation of `docs/plane-hw-implementation.md` after Phases 1-2 shipped.

This document captures all research findings, codebase investigation results, and decisions
made during the design session for the next set of features. It exists so that future design
sessions can pick up where we left off without re-investigating the codebase or re-researching
external tooling.

---

## Table of contents

1. [What's already shipped](#whats-already-shipped)
2. [Planned design docs](#planned-design-docs)
3. [Decisions made](#decisions-made)
4. [Codebase investigation findings](#codebase-investigation-findings)
5. [External research findings](#external-research-findings)
6. [Open questions and deferred items](#open-questions-and-deferred-items)

---

## What's already shipped

Phases 1-2 from `docs/plane-hw-implementation.md` are complete and merged (PR #1):

### Phase 1: Issue types API + frontend

- Backend: `apps/api/plane/hw/` Django app with serializers, views, URLs for IssueType and
  ProjectIssueType CRUD
- Frontend: `apps/web/hw/` overlay with issue type selection in create modal, issue type
  switcher in detail view, filters, applied filters
- Settings UI: workspace-level issue type management (two-column layout with side panel),
  project-level issue type linking
- Seed data: default issue types ("Software", "PCB Design", "Mechanical Assembly",
  "Hardware General") seeded on workspace creation via signals
- Migrations: `0001_seed_issue_types.py`

### Phase 2: Custom properties model + API + frontend

- Backend models: `IssuePropertyDefinition` and `IssuePropertyValue` in
  `apps/api/plane/hw/models/issue_property.py`
- Property types supported: text, number, select, multi_select, url, date, boolean
- Frontend: property field renderers for all types, sidebar properties, modal properties,
  layout properties
- Stores: `IssueTypeStore` and `IssuePropertyStore` in MobX
- Services: `issue-type.service.ts` and `issue-property.service.ts`
- Hooks: `useIssueProperties`, `useIssuePropertyValues`,
  `useWorkspaceIssuePropertiesExtended`
- Seed data: predefined property schemas for PCB Design, Mechanical Assembly, Software
- Migrations: `0002_initial.py`, `0003_seed_properties.py`
- E2E tests: smoke and critical path tests for issue type settings and issue creation

### Also present (from CE overlay copy, not custom-built)

- Gantt chart components with dependency path stubs
- Timeline store infrastructure (`base-timeline.store.ts`)
- Relations components (limited to 4 types in frontend)
- Various other CE stubs overridden in `hw/`

---

## Planned design docs

Four separate design documents, in priority order:

| #   | Feature area                   | Status                                | Notes                                                            |
| --- | ------------------------------ | ------------------------------------- | ---------------------------------------------------------------- |
| 1   | **KiCad preview pipeline**     | Clarification complete, ready for DoD | Contained scope, original spec in Phase 3 of implementation doc  |
| 2   | **Dependency features**        | Clarification partially complete      | Stage 1: viz + date propagation. Stage 2: CPM. PM's primary ask. |
| 3   | **Resource/workload tracking** | Requirements captured, not clarified  | Greenfield. Both estimate points and hours (configurable).       |
| 4   | **AI provider / MCP**          | Deferred                              | Separate concern, waiting for MCP/agents picture to clarify.     |

---

## Decisions made

### Scope and structure

- **Four separate design docs** instead of one monolith
- **Dependency features split into two stages:** Stage 1 is dependency visualization +
  date propagation (useful on its own). Stage 2 is CPM calculation (additive layer).
- **Resource tracking uses both estimate points AND hours/time tracking**, configurable
  per project
- **AI features deferred** to separate design session when MCP/agents picture is clearer
- **KiCad tackled first** — contained scope, quick win before the meatier dependency work

### KiCad pipeline decisions

- **Architecture:** reusable posting script/library with GitHub Action as first consumer,
  sidecar service as future option
- **Git hosting:** design for flexibility (GitHub first, but don't hard-code it — may need
  GitLab/Gitea support later)
- **Issue linking:** commit message convention (`PROJ-42`) AND config-based path-to-project
  mapping (e.g., `hardware/power-stage/**` → specific project/issue)

### Dependency features decisions

- **Two-stage approach:** Stage 1 ships dependency viz + date propagation. Stage 2 adds
  CPM on top.
- **Frontend relation types need expanding:** currently 4 types in frontend
  (`blocking`, `blocked_by`, `duplicate`, `relates_to`), backend has 8 including temporal
  ones (`start_before`, `start_after`, `finish_before`, `finish_after`)

### Resource tracking decisions

- **Effort unit:** both estimate points and hours/time tracking, configurable per project
- **Time tracking:** the Pro-gated worklog feature stubs exist in both `hw/` and `ce/` —
  we'd be implementing what Plane already has the UI stubs for

---

## Codebase investigation findings

### Feature gating mechanism

- **Backend:** `Instance` model in `apps/api/plane/license/models/instance.py` has an
  `edition` field, currently only `PLANE_COMMUNITY` is defined
- **No runtime enforcement** — the edition field exists but nothing checks it to gate
  features. Pro features are just stubbed out (empty components), not actively blocked.
- **Feature comparison lists** in `packages/constants/src/subscription.ts` are purely
  informational for the upgrade modal

### What's gated as "Pro" (per subscription constants)

```
FREE_PLAN_UPGRADE_FEATURES:
- OIDC + SAML for SSO
- Time Tracking and Bulk Ops
- Integrations
- Public Views and Pages

PRO_PLAN_FEATURES:
- Dashboards + Reports
- Full Time Tracking + Bulk Ops
- Teamspaces
- Trigger And Action
- Wikis
- Popular integrations
```

### Issue relations system

**Backend model** (`apps/api/plane/db/models/issue.py:263-312`):

```python
class IssueRelationChoices(models.TextChoices):
    DUPLICATE = "duplicate", "Duplicate"
    RELATES_TO = "relates_to", "Relates To"
    BLOCKED_BY = "blocked_by", "Blocked By"
    START_BEFORE = "start_before", "Start Before"
    FINISH_BEFORE = "finish_before", "Finish Before"
    IMPLEMENTED_BY = "implemented_by", "Implemented By"

# Bidirectional pairs:
# blocked_by ↔ blocking
# relates_to ↔ relates_to (symmetric)
# duplicate ↔ duplicate (symmetric)
# start_before ↔ start_after
# finish_before ↔ finish_after
# implemented_by ↔ implements
```

**Frontend type restriction** (`apps/web/hw/types/gantt-chart.ts`):

```typescript
export type TIssueRelationTypes = "blocking" | "blocked_by" | "duplicate" | "relates_to";
```

**MISMATCH:** Backend supports 6 stored types (with 6 computed reverses = 12 total
relation labels), frontend only exposes 4. The temporal relations (`start_before`,
`finish_before`) and `implemented_by` are not surfaced in the UI.

**Relation store** (`apps/web/core/store/issue/issue-details/relation.store.ts`):

- Fully implemented: fetch, create, remove, bidirectional handling
- Uses `REVERSE_RELATIONS` mapping from `core/constants/gantt-chart.ts`
- Only maps the 4 frontend-exposed types

**API endpoints** (`apps/api/plane/app/views/issue/relation.py`):

- `GET/POST /api/v1/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/relations/`
- `POST .../relations/remove_relation/`
- Full CRUD, supports all backend relation types

### Gantt/timeline infrastructure

**Timeline store** (`apps/web/hw/store/timeline/base-timeline.store.ts`):

- `isDependencyEnabled = false` — hardcoded, never updated
- `getIsCurrentDependencyDragging()` — always returns `false`
- Block position calculation: **fully implemented**
  - `getItemPositionWidth()` — calculates block position from dates
  - `getPositionFromDateOnGantt()` — date → pixel position
  - `getDateFromPositionOnGantt()` — pixel position → date
  - `updateBlockPosition()` — handles drag/resize
  - `getUpdatedPositionAfterDrag()` — dependency-aware drag handling
- Supports week/month views with configurable `dayWidth`

**Dependency path stubs** (BOTH `hw/` and `ce/` are identical):

```typescript
// apps/web/hw/components/gantt-chart/dependency/dependency-paths.tsx
type Props = { isEpic?: boolean };
export function TimelineDependencyPaths(props: Props) {
  const { isEpic = false } = props;
  return <></>;
}
```

**Also stubbed:**

- `TimelineDraggablePath` — empty fragment
- `GanttAdditionalLayers` — returns `null`
- `LeftDependencyDraggable` — empty fragment
- `RightDependencyDraggable` — empty fragment

**Block components** (`apps/web/hw/components/gantt-chart/blocks/blocks-list.tsx`):

```typescript
export type GanttChartBlocksProps = {
  blockIds: string[];
  blockToRender: (data: any) => React.ReactNode;
  enableBlockLeftResize: boolean | ((blockId: string) => boolean);
  enableBlockRightResize: boolean | ((blockId: string) => boolean);
  enableBlockMove: boolean | ((blockId: string) => boolean);
  ganttContainerRef: React.RefObject<HTMLDivElement>;
  showAllBlocks: boolean;
  updateBlockDates?: (updates: IBlockUpdateDependencyData[]) => Promise<void>;
  enableDependency: boolean | ((blockId: string) => boolean);
};
```

**Key finding:** The gantt infrastructure (block positioning, date calculation, drag
handling) is fully implemented. Only the visual dependency rendering layer is stubbed.

### Issue date fields

```python
# apps/api/plane/db/models/issue.py
start_date = models.DateField(null=True, blank=True)
target_date = models.DateField(null=True, blank=True)
```

Both fields are fully wired through to the frontend gantt views.

### Estimate system

```python
# apps/api/plane/db/models/estimate.py
class Estimate(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=255, default="categories")
    last_used = models.BooleanField(default=False)

class EstimatePoint(ProjectBaseModel):
    estimate = models.ForeignKey("db.Estimate", on_delete=models.CASCADE, related_name="points")
    key = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    description = models.TextField(blank=True)
    value = models.CharField(max_length=255)
```

- Issues reference `EstimatePoint` via FK
- Arbitrary point scales (fibonacci, t-shirt sizes, etc.)
- **Not used for capacity planning** — purely an issue property
- `type` field defaults to `"categories"` but is a free-text CharField

### Time tracking stubs

- `Project.is_time_tracking_enabled` boolean field exists
- Worklog UI stubs exist at:
  - `apps/web/hw/components/issues/worklog/property/root.tsx` — returns empty
  - `apps/web/hw/components/issues/worklog/activity/root.tsx` — returns empty
  - `apps/web/ce/components/issues/worklog/property/root.tsx` — returns empty
- Activity tracking for `is_time_tracking_enabled` changes already exists in
  `core/components/common/activity/helper.tsx`

### Files modified by HW fork (conflict surface)

| File                                        | Change                                     |
| ------------------------------------------- | ------------------------------------------ |
| `apps/web/tsconfig.json`                    | `./hw/*` added to path alias               |
| `apps/api/plane/app/urls/__init__.py`       | Import + spread HW URL patterns            |
| `apps/api/plane/settings/common.py`         | `plane.hw` in INSTALLED_APPS               |
| `apps/api/plane/app/views/external/base.py` | LLM provider model lists (not yet changed) |
| `apps/api/requirements/base.txt`            | `anthropic` package (not yet added)        |

---

## External research findings

### Critical Path Method (CPM)

**Standard algorithm:**

1. **Forward pass** (left-to-right): calculate Early Start (ES) and Early Finish (EF)
   - `EF = ES + duration`
   - When multiple predecessors: `ES = max(predecessor EFs)`
2. **Backward pass** (right-to-left): calculate Late Start (LS) and Late Finish (LF)
   - `LS = LF - duration`
   - When multiple successors: `LF = min(successor LSs)`
3. **Slack/Float:** `Slack = LF - EF` (or `LS - ES`)
4. **Critical path:** tasks with zero slack

**Data requirements:** task durations, dependency relationships, project start/end dates

**Tool implementations:**

- Monday.com: automatic when dependencies defined, red highlight on gantt, toggleable
- Wrike: fully automated, color-coded
- MS Project: native scheduling engine, zero-slack = critical

**Computation:** typically server-side in SaaS tools for consistency, with client-side
caching for display

### Dependency date propagation

**Standard dependency types:**
| Type | Rule |
|------|------|
| Finish-to-Start (FS) | Successor begins after predecessor ends (most common) |
| Start-to-Start (SS) | Successor begins when predecessor begins |
| Finish-to-Finish (FF) | Successor finishes when predecessor finishes |
| Start-to-Finish (SF) | Successor must finish before predecessor finishes (rare) |

**Propagation rules:**

- FS: `Successor_ES = Predecessor_EF + 1` (+ optional lag)
- SS: `Successor_ES = Predecessor_ES + lag`
- Cascading: changes ripple forward through all dependent chains

**Circular dependency detection:** topological sort via DFS, prevent cycles at creation time

**Automatic vs manual:** most modern tools default to automatic propagation. Monday.com
offers three modes: flexible (auto), strict (enforced), no action (manual).

### Resource leveling / workload management

**Typical data model:**

- Available hours per person per week
- Effort allocation per task (hours, percentage, or points)
- Utilization = allocated / available × 100%

**Over-allocation detection:**

- Green: 60-80% (optimal)
- Yellow: 80-100% (near capacity)
- Red: >100% (overallocated)

**UI patterns:**

- Monday.com: weekly/daily view with color-coded bubbles
- Asana: 10,000-foot team capacity overview (Business tier)
- Traditional: heatmap tables by week/month

**Key insight:** resource/workload management doesn't exist anywhere in Plane, not even
in Pro. This is completely greenfield.

### KiBot / KiCad automation

**KiBot version:** 1.8.5 (November 2025), actively maintained
**Capabilities:** fully headless, YAML config-driven, Docker support for KiCad 5-9
**Output formats:** SVG, PNG, PDF, Gerber, Excellon, DXF, EPS, 3D renders
**GitHub Action:** `INTI-CMNB/KiBot@v2` (official, on GitHub Marketplace)
**Pre-flight:** automatic DRC/ERC before output generation

**Typical CI workflow:**

```yaml
- uses: INTI-CMNB/KiBot@v2
  with:
    config: hardware/kicad/kibot.yaml
    dir: output
```

### Plane documentation claims vs reality

- Plane docs claim "critical path visualization" exists — codebase shows empty stubs
- Plane docs describe dependency types (FS, SS, FF) — backend model supports temporal
  relations but frontend doesn't expose them
- Timeline/gantt layout is fully in CE, not gated

---

## Open questions and deferred items

### For dependency features design (next session)

- How should we handle the frontend relation type expansion? Extend the existing
  `TIssueRelationTypes` union, or create a new type for temporal relations?
- Should date propagation be server-side (API recalculates on relation/date change) or
  client-side (frontend calculates and pushes updates)?
- What's the UX for propagation conflicts? (e.g., manually set date conflicts with
  calculated date from dependency)
- Should we support lag/lead times on dependencies?

### For resource tracking design (future session)

- How to handle the time tracking unstubbing — is it just filling in the existing worklog
  UI stubs, or does it need a different data model?
- Capacity model: per-project capacity or workspace-wide?
- How does estimate point capacity convert to something meaningful? (e.g., "max 20 points
  per sprint" vs "max 40 hours per week")

### For AI design (future session)

- MCP server integration vs traditional chat flow
- Anthropic agents SDK vs custom agent framework
- Scope: project-level AI assistant, or workspace-level?
- What MCP tools would be most useful? (issue CRUD, search, file preview, etc.)

### General

- Upstream sync strategy: how often to rebase onto upstream releases?
- Testing strategy for new features: unit + contract + E2E coverage targets
