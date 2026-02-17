# CPM Critical Path -- Test Requirements

Generated from acceptance criteria in the design plan and implementation phases 1--7.

Every acceptance criterion maps to either an automated test or a documented human verification entry. Test file paths reflect the decisions made in the implementation plans (colocated Vitest tests for unit/integration, Playwright under `e2e/tests/` for E2E).

---

## Automated Test Coverage

### cpm-critical-path.AC1: CPM calculation engine

| Criterion                | Type | Test File                                    | Description                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cpm-critical-path.AC1.1  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Forward pass computes ES and EF for a linear FS chain (A->B->C) with correct date cascading. Tested in both the `forwardPass` describe block (isolated forward pass) and the `computeCpm` integration block (full pipeline). Verifies that when a predecessor constraint is earlier than the successor's explicit start date, the explicit date acts as a minimum. |
| cpm-critical-path.AC1.2  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Forward pass handles SS dependencies: successor ES matches predecessor ES. Tests an SS chain where A `start_before` B and verifies B.ES = A.ES.                                                                                                                                                                                                                    |
| cpm-critical-path.AC1.3  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Forward pass handles FF dependencies: successor EF matches predecessor EF. Tests an FF chain where A `finish_before` B and verifies B.EF = A.EF, with B.ES back-calculated from duration.                                                                                                                                                                          |
| cpm-critical-path.AC1.4  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Multi-predecessor resolution takes latest (max) constraint when multiple predecessors feed one successor. Tests two predecessors A and B both blocking C; verifies C.ES = max(A.EF + 1, B.EF + 1).                                                                                                                                                                 |
| cpm-critical-path.AC1.5  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Backward pass computes LS and LF with anchor derived from max(EF) across all leaf nodes. Tested in the `backwardPass` describe block with a linear chain, verifying backward propagation from the project deadline anchor.                                                                                                                                         |
| cpm-critical-path.AC1.6  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Slack calculation returns zero for tasks on the critical path and positive values for non-critical tasks. Tested in the `computeCpm` integration block with a linear critical path (A->B->C) plus a shorter parallel branch (A->D). Verifies A, B, C have slack=0 and isCritical=true; D has slack>0 and isCritical=false.                                         |
| cpm-critical-path.AC1.7  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Dateless tasks in dependency chains receive 1-day duration in forward/backward pass. Tests a dateless block D with a blocking predecessor A; verifies D gets duration=1, ES=A.EF+1, EF=ES.                                                                                                                                                                         |
| cpm-critical-path.AC1.8  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Graph with no dependencies returns empty CpmResultMap. Tests both `buildAdjacencyList` with an empty relation map (returns empty adjacency list) and `computeCpm` with no relations (returns Map of size 0).                                                                                                                                                       |
| cpm-critical-path.AC1.9  | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Graph traversal stops at MAX_PROPAGATION_DEPTH (100 levels). Tests `topologicalSort` with a chain of 101+ issues; verifies only the first 100 levels are processed.                                                                                                                                                                                                |
| cpm-critical-path.AC1.10 | unit | `apps/web/hw/helpers/cpm-calculator.test.ts` | Issues with only one date (start or target, not both) use the available date and compute the other from duration or default to 1 day. Tests both start-only (start_date present, no target_date -> duration=1, EF=start_date) and target-only (target_date present, no start_date -> duration=1, ES=target_date) scenarios.                                        |

**Rationalization:** Phase 1 implements `cpm-calculator.ts` as pure functions with zero side effects, making unit testing straightforward. The implementation plan specifies colocated Vitest tests with factory functions for test data, matching the existing `dependency-conflict.test.ts` pattern. Tests cover both isolated function tests (`buildAdjacencyList`, `topologicalSort`, `forwardPass`, `backwardPass`) and full integration via `computeCpm`.

---

### cpm-critical-path.AC2: CPM store integration

| Criterion               | Type        | Test File                                      | Description                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm-critical-path.AC2.1 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | `cpmResults` recomputes when a block's dates change. Sets up a store with `cpmEnabled=true`, populated `blocksMap`, and dependency relations. Changes a block's `start_date` and verifies `cpmResults` reflects the updated dates.                                                                                      |
| cpm-critical-path.AC2.2 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | `cpmResults` recomputes when a relation is added or removed. With CPM enabled, adds a new relation to the relation map and verifies `cpmResults` includes the new dependency in its calculation.                                                                                                                        |
| cpm-critical-path.AC2.3 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | `isCritical(blockId)` returns true for zero-slack blocks and false otherwise. Builds a graph where A->B->C is the critical path and A->D is a shorter branch. Verifies `isCritical("A")` returns true and `isCritical("D")` returns false.                                                                              |
| cpm-critical-path.AC2.4 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | `getSlack(blockId)` returns correct float in days. Same graph as AC2.3. Verifies `getSlack("A")` returns 0 and `getSlack("D")` returns the expected positive float value.                                                                                                                                               |
| cpm-critical-path.AC2.5 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | When `cpmEnabled` is false, `cpmResults` returns empty map without computing. Verifies `cpmResults` has size 0 regardless of blocks and relations, `isCritical` returns false, and `getSlack` returns 0.                                                                                                                |
| cpm-critical-path.AC2.6 | integration | `apps/web/hw/store/timeline/cpm-store.test.ts` | Changing a single block only re-renders blocks whose CPM values actually changed (memoization). Verified structurally by confirming `isCritical` and `getSlack` use `computedFn` (per-argument memoization). Test calls `isCritical(blockId)` twice without changes and verifies identical return without re-execution. |

**Rationalization:** Phase 2 wires `computeCpm` into MobX as computed values. Tests require a mock `rootStore` providing `issue.issueDetail.relation.relationMap` and populating `blocksMap`. The implementation plan specifies a lightweight mock store approach since no existing store test patterns are established. MobX reactivity (AC2.1, AC2.2) is tested by mutating observables and reading computed values. Memoization (AC2.6) is tested structurally since `computedFn` behavior is a MobX-utils guarantee.

---

### cpm-critical-path.AC3: Virtual date injection

| Criterion               | Type        | Test File                                              | Description                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm-critical-path.AC3.1 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Dateless task with FS predecessor appears on gantt at computed position when CPM is enabled. Sets up store with `cpmEnabled=true`, a dated block A, and a dateless block B where A->B (FS). After `updateBlocks()`, verifies block B has position values (marginLeft, width) matching CPM-computed dates. |
| cpm-critical-path.AC3.2 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Injected block has `dateSource: 'computed'` flag. Same setup as AC3.1. After `updateBlocks()`, verifies block B has `dateSource: "computed"` and block A has `dateSource` as `undefined`.                                                                                                                 |
| cpm-critical-path.AC3.3 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Computed-date blocks render with dashed border and reduced opacity. Structural test verifying that a block with `dateSource: "computed"` carries the properties that the `IssueGanttBlock` component uses for conditional styling (dashed border class, opacity class).                                   |
| cpm-critical-path.AC3.4 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Dragging a computed-date block sets real dates, converting `dateSource` to `'manual'`. After a computed block exists, calls `getUpdatedPositionAfterDrag` and verifies the returned payload includes both `start_date` and `target_date`.                                                                 |
| cpm-critical-path.AC3.5 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Computed-date blocks cannot be resized (no drag handles for resize). Verifies that the resize guard in `use-gantt-resizable.ts` returns early for blocks with `dateSource === "computed"` when `dragDirection` is `"left"` or `"right"`.                                                                  |
| cpm-critical-path.AC3.6 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Dateless tasks with no dependency chain membership remain hidden (no virtual date assigned). Sets up a dateless block C with no dependencies. After `updateBlocks()`, verifies block C has no `start_date`, no `target_date`, and no `dateSource`.                                                        |
| cpm-critical-path.AC3.7 | integration | `apps/web/hw/store/timeline/cpm-virtual-dates.test.ts` | Toggling CPM off removes computed-date blocks from the gantt (they return to hidden state). With CPM enabled, verifies computed blocks exist. Toggles `cpmEnabled=false`, calls `updateBlocks()` again, and verifies the previously computed block now has no dates and no position.                      |

**Rationalization:** Phase 3 extends `updateBlocks` in the timeline store and modifies the drag handler. Tests reuse the mock store from Phase 2 and exercise the store's block update pipeline. AC3.3 is tested structurally (the property exists on the block object) rather than by rendering React components, since the visual styling is applied by Tailwind classes that are best verified visually or via E2E. AC3.5 tests the resize guard logic, which depends on how `use-gantt-resizable.ts` exposes resize vs. move.

---

### cpm-critical-path.AC4: Critical path visualization

| Criterion               | Type | Test File                                                          | Description                                                                                                                                                                                                                                      |
| ----------------------- | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cpm-critical-path.AC4.1 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Toggle button appears in gantt toolbar and controls CPM state. Unit test with mock store verifying that `CpmToggle` calls `setCpmEnabled` when clicked.                                                                                          |
| cpm-critical-path.AC4.2 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Zero-slack tasks display red/coral background when CPM is active. With `isCritical(id)` returning true and `cpmEnabled` true, verifies `CriticalBlockStyle` applies red background color (rgb(239 68 68)).                                       |
| cpm-critical-path.AC4.3 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Dependency connectors between critical path tasks render in red. Verifies that when both source and target blocks are critical and `cpmEnabled` is true, the `isCriticalPath` boolean evaluates to true, causing the connector stroke to be red. |
| cpm-critical-path.AC4.4 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Non-critical tasks retain their default colour. With `isCritical(id)` returning false and `cpmEnabled` true, verifies `CriticalBlockStyle` passes through the base style unchanged.                                                              |
| cpm-critical-path.AC4.5 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Critical + computed blocks show red fill with dashed border. With `isCritical(id)` true AND `getComputedDates(id)` returning non-null, verifies `CriticalBlockStyle` applies both red fill and dashed border style.                              |
| cpm-critical-path.AC4.6 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Toggling CPM off restores all blocks and connectors to default appearance. With `cpmEnabled` false, verifies `CriticalBlockStyle` passes through base style unchanged regardless of `isCritical` result.                                         |
| cpm-critical-path.AC4.7 | unit | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | CPM toggle is off by default on page load. Verifies `cpmEnabled` defaults to false in a fresh store instance (this is a store-level assertion, not a component test).                                                                            |

**Rationalization:** Phase 4 creates React components (`CpmToggle`, `CriticalBlockStyle`) and modifies the `Connector` component. Tests focus on the styling logic and state interactions rather than full React rendering, since the components are thin wrappers around store values. AC4.3 is tested as a unit test on the boolean expression that determines connector criticality, matching the implementation plan's approach. AC4.7 is a store-level default verification.

---

### cpm-critical-path.AC5: Slack visualization and tooltips

| Criterion               | Type | Test File                                                      | Description                                                                                                                                                                                                                                                                 |
| ----------------------- | ---- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm-critical-path.AC5.1 | unit | `apps/web/hw/helpers/slack-bar-position.test.ts`               | Non-critical tasks show light-coloured extension bar from EF to LF. Given a non-critical `CpmResult` with known EF and LF dates and chart data with a known day width, verifies `getSlackBarPosition` returns `{ left, width }` where width equals the expected pixel span. |
| cpm-critical-path.AC5.1 | unit | `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts` | When `cpmEnabled` is true and a block has positive slack, the `GanttAdditionalLayers` component renders a slack bar div with correct left/width positioning.                                                                                                                |
| cpm-critical-path.AC5.2 | unit | `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts` | Slack bar renders at ~30% opacity, same height as task bar. Verifies the rendered slack bar div has `backgroundColor` with 0.3 opacity and height derived from `BLOCK_HEIGHT - 8`.                                                                                          |
| cpm-critical-path.AC5.3 | unit | `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts` | Hovering a block with CPM active shows ES, EF, LS, LF, and total float in tooltip. Verifies `CpmTooltipContent` with a non-critical `CpmResult` renders text content containing ES, EF, LS, LF, and "Total float: X days".                                                  |
| cpm-critical-path.AC5.4 | unit | `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts` | Critical tasks show "On critical path -- zero slack" in tooltip. Verifies `CpmTooltipContent` with a critical `CpmResult` (isCritical=true) renders "On critical path -- zero slack".                                                                                       |
| cpm-critical-path.AC5.5 | unit | `apps/web/hw/components/gantt-chart/cpm/slack-tooltip.test.ts` | Slack bars only render when CPM is enabled. When `cpmEnabled` is false, verifies `GanttAdditionalLayers` returns null.                                                                                                                                                      |
| cpm-critical-path.AC5.6 | unit | `apps/web/hw/helpers/slack-bar-position.test.ts`               | Tasks with zero slack show no extension bar (critical path, no slack to display). Given a critical `CpmResult` (isCritical=true, slack=0), verifies `getSlackBarPosition` returns null.                                                                                     |

**Rationalization:** Phase 5 creates a pure helper (`slack-bar-position.ts`) and React components (`GanttAdditionalLayers` with slack bars, `CpmTooltipContent`). The helper is tested in isolation with mocked `getPositionFromDate`. Component tests use React Testing Library with a mock store provider or test the pure logic portions. The implementation plan separates the position calculation (pure function, easily unit-tested) from the rendering (component test).

---

### cpm-critical-path.AC6: Cross-project CPM

| Criterion               | Type        | Test File                                                          | Description                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cpm-critical-path.AC6.1 | unit        | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Cross-project toggle appears when CPM is enabled. Extends the Phase 4 visualization tests to verify the cross-project sub-toggle renders when `cpmEnabled` is true and is hidden when `cpmEnabled` is false.                                                                                                                                                                   |
| cpm-critical-path.AC6.2 | integration | `apps/web/hw/store/timeline/cross-project-cpm.test.ts`             | Enabling cross-project mode fetches relations for external issues. Verifies that `fetchCrossProjectRelations` correctly identifies external issue IDs from the relation map (IDs not in `blocksMap`) and populates `crossProjectRelationCache`.                                                                                                                                |
| cpm-critical-path.AC6.3 | integration | `apps/web/hw/store/timeline/cross-project-cpm.test.ts`             | CPM calculation follows dependency chains across project boundaries. With `crossProjectCpmEnabled=true` and `crossProjectRelationCache` populated with external relations, verifies `cpmResults` includes external issues in the CPM graph and correctly propagates dates through cross-project chains.                                                                        |
| cpm-critical-path.AC6.4 | integration | `apps/web/hw/store/timeline/cross-project-cpm.test.ts`             | Phantom anchors render at timeline edges for external constraints. Verifies that when cross-project mode is enabled, the store identifies external issue IDs that should have phantom anchors rendered. (Component rendering verified separately or via E2E.)                                                                                                                  |
| cpm-critical-path.AC6.5 | unit        | `apps/web/hw/components/gantt-chart/cpm/cpm-visualization.test.ts` | Phantom anchor tooltip shows external issue identifier, project name, and dates. Verifies `PhantomAnchor` component renders tooltip content containing the external issue's identifier, project name, and date range.                                                                                                                                                          |
| cpm-critical-path.AC6.6 | integration | `apps/web/hw/store/timeline/cross-project-cpm.test.ts`             | Per-project mode (default) uses cross-project predecessor actual dates as fixed inputs without walking further. With `crossProjectCpmEnabled=false`, verifies `cpmResults` uses only the local relation map. External issue IDs in the relation map use their actual dates from the issue store as fixed inputs (the `getIssueDates` lookup falls through to the issue store). |
| cpm-critical-path.AC6.7 | unit        | `apps/web/hw/helpers/cpm-calculator.test.ts`                       | Cross-project traversal respects MAX_PROPAGATION_DEPTH = 100. This is already covered by AC1.9 since the depth limit is enforced in `topologicalSort` regardless of whether edges are cross-project. The Phase 6 test file adds a supplementary test verifying the limit applies when cross-project relations extend the graph depth.                                          |

**Rationalization:** Phase 6 extends the store with cross-project relation fetching and caching, plus the `PhantomAnchor` component. Store tests mock the relation service and issue store to verify the merging logic. AC6.7 reuses the depth limit test from Phase 1 (AC1.9) since the same `MAX_PROPAGATION_DEPTH` constant applies to all graph traversals. AC6.4 is partially tested at the store level (identifying external issues) and fully verified via E2E (AC7.6).

---

### cpm-critical-path.AC7: E2E tests

| Criterion               | Type | Test File                                       | Description                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm-critical-path.AC7.1 | e2e  | `e2e/tests/cpm-critical-path.spec.ts`           | Toggling CPM on for a project with dependencies shows critical path highlights on the gantt. Creates 3 issues (A, B, C) with dates forming a blocking chain via API. Navigates to gantt view, clicks `[data-test="cpm-toggle"]`, and asserts `[data-test="cpm-critical-block"]` overlays are visible.                        |
| cpm-critical-path.AC7.2 | e2e  | `e2e/tests/cpm-critical-path.spec.ts`           | A dependency chain (A->B->C) correctly identifies and highlights the critical tasks. Same chain plus a shorter branch (A->D with slack). Enables CPM and asserts A, B, C have critical block overlays (via `data-test-issue-id`) while D does not.                                                                           |
| cpm-critical-path.AC7.3 | e2e  | `e2e/tests/cpm-virtual-dates.spec.ts`           | A dateless task with a dependency appears on the gantt at its computed position when CPM is enabled. Creates issue A with dates and issue B with no dates, plus A->B blocking relation. Enables CPM and asserts `[data-test="cpm-computed-block"]` is visible for issue B, positioned after A.                               |
| cpm-critical-path.AC7.4 | e2e  | `e2e/tests/cpm-virtual-dates.spec.ts`           | Dragging a computed-date block converts it to manual dates that persist after CPM is toggled off. Locates the computed block for B, drags it horizontally using Playwright mouse API. Fetches issue B via API and asserts `start_date` and `target_date` are non-null. Toggles CPM off and asserts block B is still visible. |
| cpm-critical-path.AC7.5 | e2e  | `e2e/tests/cpm-slack-and-cross-project.spec.ts` | Slack extension bars appear for non-critical tasks and are absent for critical tasks. Creates a critical chain (A->B->C) and shorter branch (A->D). Enables CPM and asserts D has a `[data-test="cpm-slack-bar"]` element while A, B, C do not.                                                                              |
| cpm-critical-path.AC7.6 | e2e  | `e2e/tests/cpm-slack-and-cross-project.spec.ts` | Enabling cross-project mode shows phantom anchors at timeline edges for external dependencies. Creates a second project with issue X, creates cross-project blocking relation X->Y. Navigates to project 1's gantt, enables CPM and cross-project toggle, and asserts `[data-test="cpm-phantom-anchor"]` is visible.         |

**Rationalization:** Phase 7 is dedicated to E2E tests. Tests use the existing `e2e/fixtures/index.ts` infrastructure for authenticated page, workspace, and project setup. New API helpers (`createIssue`, `createIssueRelation`, `getIssue`) follow the existing `createWorkspace`/`createProject` pattern. All assertions use `data-test` attributes added to CPM components in Phase 7 Task 1. AC7.4 (drag-to-manual) is the most complex scenario and may require Playwright's lower-level mouse API with generous timeouts. AC7.6 (cross-project) depends on the API supporting cross-project relation creation; the implementation plan notes this test should be marked `test.fixme()` if the API does not support it from the test fixture.

---

## Human Verification Required

| Criterion                                                | Justification                                                                                                                                                                                                                                                                                                                           | Verification Approach                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cpm-critical-path.AC3.3 (visual fidelity)                | Automated tests verify the `dateSource: "computed"` property and CSS class names are applied, but cannot assess whether the dashed border and 80% opacity look correct and visually distinguishable from manual-date blocks in context. Tailwind class rendering and visual appearance require human judgment.                          | Enable CPM on a project with a mix of dated and dateless dependency-linked issues. Visually confirm: (1) computed-date blocks have a visible dashed border, (2) computed-date blocks appear at reduced opacity compared to manual blocks, (3) the "auto" badge icon is legible and correctly positioned, (4) the visual distinction is clear at different zoom levels (week/month/quarter).       |
| cpm-critical-path.AC4.2 (color appropriateness)          | Automated tests verify that `backgroundColor` is set to the expected red value (`rgb(239 68 68)`) but cannot assess whether this color choice provides sufficient contrast, is accessible to colorblind users, and looks correct alongside the existing gantt color palette.                                                            | Enable CPM on a project with critical path tasks. Visually confirm: (1) red/coral background is clearly visible and distinguishable from default block colors, (2) block text remains readable against the red background, (3) the color is not confused with the existing orange conflict indicator. Check with a colorblindness simulator (e.g., Chrome DevTools rendering emulation).          |
| cpm-critical-path.AC4.5 (combined styling)               | The combination of red fill and dashed border on critical+computed blocks involves overlapping style rules from two independent systems (Phase 3 computed styling and Phase 4 critical styling). Automated tests verify the individual style properties but cannot assess whether the combined visual result is aesthetically coherent. | Create a dateless issue in a dependency chain where the chain is also the critical path. Enable CPM. Visually confirm the block shows red fill with a dashed border and reduced opacity simultaneously, and the combination is visually coherent (not garbled or unreadable).                                                                                                                     |
| cpm-critical-path.AC5.2 (slack bar visual)               | Automated tests verify the opacity value (0.3) and height calculation, but cannot assess whether the 30% opacity produces the correct visual impression of "available float" in context alongside task bars, critical path highlighting, and dependency connectors.                                                                     | Enable CPM on a project with non-critical tasks that have slack. Visually confirm: (1) slack bars are visible but clearly lighter/more transparent than task bars, (2) slack bars align vertically with their corresponding task bars, (3) the color choice clearly conveys "extra time" rather than "task duration", (4) slack bars do not obscure or interfere with dependency connector lines. |
| cpm-critical-path.AC5.3 (tooltip interaction)            | The hover interaction that triggers the tooltip and the specific layout of ES/EF/LS/LF values within the Popover.Panel is a UX concern. Automated tests verify text content is present, but cannot confirm the tooltip appears at the right time, is positioned correctly, and the layout is readable.                                  | Hover over various blocks (critical, non-critical, computed) with CPM enabled. Verify: (1) tooltip appears within a reasonable delay, (2) ES, EF, LS, LF values are displayed in an understandable format, (3) total float is shown with appropriate precision, (4) the tooltip does not overflow or clip, (5) critical tasks show the "On critical path -- zero slack" message clearly.          |
| cpm-critical-path.AC6.4 (phantom anchor visual)          | Phantom anchors are small markers at timeline edges. Automated tests (E2E) verify their presence via `data-test` attributes, but cannot assess whether they are noticeable enough for users, positioned correctly at timeline edges, and do not overlap with other visual elements.                                                     | Enable cross-project CPM mode on a project with external dependencies. Visually confirm: (1) phantom anchors are visible at the correct timeline edges (left for predecessors, right for successors), (2) they do not overlap with block bars or other UI elements, (3) their visual design (small dot with ring) is recognizable as an "external constraint" indicator.                          |
| cpm-critical-path.AC6.5 (phantom anchor tooltip content) | Automated tests verify the PhantomAnchor component renders tooltip text, but whether the tooltip provides enough context (project name, issue identifier, dates) in a readable format requires human review.                                                                                                                            | Hover over phantom anchors in cross-project CPM mode. Verify: (1) tooltip shows the external issue's project identifier and sequence ID (e.g., "PROJ-123"), (2) issue name is displayed, (3) date range is shown and formatted consistently with the rest of the UI.                                                                                                                              |
| Performance (drag debouncing)                            | The design specifies drag debouncing: "compute once at drag start, suppress during drag frames, recompute on drop." The debouncing flag (`isDraggingBlock`) is testable, but actual performance during drag (no janky recomputation, smooth 60fps drag) requires human verification under real browser conditions with realistic data.  | Open a gantt with 100+ issues and dependencies. Enable CPM. Drag a block and observe: (1) drag is smooth without visible lag or stutter, (2) CPM highlights do not flicker during drag, (3) after dropping, CPM values update correctly. Repeat with 500 issues to test the sub-millisecond claim for O(V+E) computation.                                                                         |
| Performance (toggle off = zero cost)                     | The design claims toggling CPM off incurs zero performance cost. The store short-circuits to an empty map, but confirming zero observable impact on render cycles requires profiling.                                                                                                                                                   | With CPM toggled off, use React DevTools Profiler on a large project (500+ issues). Confirm: (1) no CPM-related computed values appear in the profiler trace, (2) render times are identical to baseline (before CPM code was added), (3) no network requests for relation data when CPM is off.                                                                                                  |
| Interaction with conflict detection                      | The design notes: "Critical path styling takes precedence for the background colour; the conflict warning icon remains visible alongside it." This interaction between two independent styling systems requires human verification.                                                                                                     | Create an issue that has both a dependency conflict (dates violate constraints) and is on the critical path. Enable CPM. Verify: (1) the block shows red/coral critical path background, (2) the orange conflict warning icon is still visible and not obscured by the critical path styling, (3) the tooltip shows both conflict and CPM information.                                            |

---

## Test Execution Commands

### Unit and integration tests (Vitest)

```bash
# Run all CPM-related tests at once
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run \
    hw/helpers/cpm-calculator.test.ts \
    hw/helpers/slack-bar-position.test.ts \
    hw/store/timeline/cpm-store.test.ts \
    hw/store/timeline/cpm-virtual-dates.test.ts \
    hw/store/timeline/cross-project-cpm.test.ts \
    hw/components/gantt-chart/cpm/cpm-visualization.test.ts \
    hw/components/gantt-chart/cpm/slack-tooltip.test.ts

# Run individual test files by phase
# Phase 1: CPM calculator pure functions
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/helpers/cpm-calculator.test.ts

# Phase 2: CPM store integration
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/store/timeline/cpm-store.test.ts

# Phase 3: Virtual date injection
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/store/timeline/cpm-virtual-dates.test.ts

# Phase 4: Critical path visualization
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/components/gantt-chart/cpm/cpm-visualization.test.ts

# Phase 5: Slack visualization and tooltips
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/helpers/slack-bar-position.test.ts \
    hw/components/gantt-chart/cpm/slack-tooltip.test.ts

# Phase 6: Cross-project CPM
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/store/timeline/cross-project-cpm.test.ts

# Run all HW helper and store tests (includes regression check)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec vitest run hw/helpers/ hw/store/ hw/components/
```

### E2E tests (Playwright)

```bash
# Prerequisite: dev servers must be running (pnpm dev)

# Run all CPM E2E tests
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test tests/cpm-*.spec.ts

# Run individual E2E test files
# Phase 7 - CPM toggle and critical path identification
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test tests/cpm-critical-path.spec.ts

# Phase 7 - Virtual dates and drag-to-manual
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test tests/cpm-virtual-dates.spec.ts

# Phase 7 - Slack visualization and cross-project
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test tests/cpm-slack-and-cross-project.spec.ts

# Run with headed browser for debugging
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test tests/cpm-*.spec.ts --headed

# Run full E2E suite (regression check)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/e2e && \
  pnpm exec playwright test
```

### Type checking

```bash
# Type check the web app (catches interface mismatches between HW and CE)
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path/apps/web && \
  pnpm exec tsc --noEmit --pretty

# Full project checks
cd /home/orual/Projects/plane/.worktrees/cpm-critical-path && \
  pnpm check
```

---

## Coverage Summary

| AC Group                              | Total Criteria | Automated | Human Only | Both             |
| ------------------------------------- | -------------- | --------- | ---------- | ---------------- |
| AC1: CPM calculation engine           | 10             | 10        | 0          | 0                |
| AC2: CPM store integration            | 6              | 6         | 0          | 0                |
| AC3: Virtual date injection           | 7              | 7         | 1          | 1 (AC3.3)        |
| AC4: Critical path visualization      | 7              | 7         | 2          | 2 (AC4.2, AC4.5) |
| AC5: Slack visualization and tooltips | 6              | 6         | 2          | 2 (AC5.2, AC5.3) |
| AC6: Cross-project CPM                | 7              | 7         | 2          | 2 (AC6.4, AC6.5) |
| AC7: E2E tests                        | 6              | 6         | 0          | 0                |
| **Totals**                            | **49**         | **49**    | **7**      | **7**            |

All 49 acceptance criteria have automated test coverage. Seven criteria additionally require human verification for visual fidelity and interaction quality that automated tests cannot fully assess. Three additional human verification items cover performance characteristics and cross-feature interaction (conflict detection overlap) that are design requirements but not tied to individual acceptance criteria.
