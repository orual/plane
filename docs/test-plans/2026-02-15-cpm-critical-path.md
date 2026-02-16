# CPM critical path — human test plan

## Prerequisites

- Infrastructure containers running: `docker compose -f docker-compose-local.yml up -d`
- Dev servers running: `pnpm dev` (API on port 8000, web on port 3000)
- All unit/integration tests passing:
  ```bash
  cd apps/web && pnpm exec vitest run \
    hw/helpers/cpm-calculator.test.ts \
    hw/helpers/slack-bar-position.test.ts \
    hw/store/timeline/cpm-store.test.ts \
    hw/store/timeline/cpm-virtual-dates.test.ts \
    hw/store/timeline/cross-project-cpm.test.ts \
    hw/components/gantt-chart/cpm/cpm-visualization.test.ts \
    hw/components/gantt-chart/cpm/slack-tooltip.test.ts
  ```
- A workspace with at least two projects, each containing 5+ issues with blocking dependencies forming at least one chain of 3+ issues and one shorter parallel branch.

## Phase 1: CPM toggle and critical path visualization

| Step | Action                                                                          | Expected                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Navigate to `/{workspace}/projects/{project}/issues/?type=gantt`                | Gantt chart loads. No CPM-related visual elements are visible. Blocks use their default colour palette.                                                                 |
| 1.2  | Look for a CPM toggle button in the gantt toolbar area                          | A toggle button labelled "Critical path" (or with a CPM icon) is present. It should be in the "off" state.                                                              |
| 1.3  | Click the CPM toggle to enable it                                               | Toggle switches to "on" state. Blocks on the longest dependency chain turn red/coral (rgb(239 68 68)). Blocks on shorter parallel branches retain their default colour. |
| 1.4  | Verify the red background is clearly distinguishable from default block colours | The red/coral fill is distinct, not confused with orange conflict indicators. Block text remains legible against the red background.                                    |
| 1.5  | Verify dependency connectors between critical path blocks are red               | Lines connecting red blocks to each other are rendered in red. Lines connecting a critical block to a non-critical block remain the default colour.                     |
| 1.6  | Click the CPM toggle to disable it                                              | All blocks and connectors revert to their default appearance. No red colouring remains.                                                                                 |
| 1.7  | Repeat steps 1.3–1.6 three times rapidly                                        | State toggles cleanly without visual glitches, lingering red blocks, or console errors.                                                                                 |

## Phase 2: Virtual date injection (computed blocks)

| Step | Action                                                                                                                                                                          | Expected                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | Create an issue "Alpha" with start_date 2025-01-06 and target_date 2025-01-08. Create a dateless issue "Beta" (no start or target date). Create a blocking relation Alpha→Beta. | Both issues are created. Beta does not appear on the gantt timeline (no dates).                                                                                                                  |
| 2.2  | Enable CPM via the toggle                                                                                                                                                       | Beta appears on the gantt at a position immediately after Alpha's target date (2025-01-09), with a dashed border and reduced opacity (~80%).                                                     |
| 2.3  | Inspect Beta's block closely                                                                                                                                                    | There should be a small "auto" badge or indicator on the block showing it has computed dates. The dashed border and reduced opacity should be visible at all zoom levels (week, month, quarter). |
| 2.4  | Attempt to resize Beta by dragging its left or right edge                                                                                                                       | The block should NOT be resizable. No resize cursor appears. Drag handles for resizing should be absent.                                                                                         |
| 2.5  | Drag Beta horizontally (the entire block, not an edge)                                                                                                                          | Beta moves along the timeline. After releasing, Beta should now have real (manual) dates. The dashed border and "auto" badge should disappear. The block should now look like a normal block.    |
| 2.6  | Disable CPM via the toggle                                                                                                                                                      | Beta remains visible on the gantt (it now has manual dates that persist).                                                                                                                        |
| 2.7  | Create another dateless issue "Gamma" with NO dependency relations. Enable CPM.                                                                                                 | Gamma does NOT appear on the gantt. Only dateless issues that are part of a dependency chain receive computed dates.                                                                             |

## Phase 3: Slack visualization and tooltips

| Step | Action                                                                                          | Expected                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Set up a gantt with: A→B→C (critical chain) and A→D where D has a shorter duration. Enable CPM. | A, B, C are highlighted red. D remains default colour.                                                                                                                                            |
| 3.2  | Examine block D                                                                                 | A light-coloured extension bar appears extending from D's end position (EF) to the right, ending at D's latest finish position (LF). This "slack bar" represents available float.                 |
| 3.3  | Verify the slack bar's visual properties                                                        | The bar should be ~30% opacity, the same height as D's task bar, and should not obscure dependency connector lines. The bar should extend past D's right edge.                                    |
| 3.4  | Verify blocks A, B, C have NO slack bars                                                        | No extension bars appear for critical path tasks.                                                                                                                                                 |
| 3.5  | Hover over block D with CPM enabled                                                             | A tooltip appears containing: Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish (LF), and "Total float: X days" where X is a positive number. All dates are in YYYY-MM-DD format. |
| 3.6  | Hover over block A (critical) with CPM enabled                                                  | A tooltip appears showing ES, EF, LS, LF values and the text "On critical path — zero slack" in a red-tinted section.                                                                             |
| 3.7  | Verify tooltip positioning                                                                      | Tooltips should appear promptly on hover, should not overflow the viewport, and should not clip at gantt edges.                                                                                   |
| 3.8  | Disable CPM                                                                                     | All slack bars disappear. Tooltips revert to their default (non-CPM) content.                                                                                                                     |

## Phase 4: Cross-project CPM

| Step | Action                                                                              | Expected                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | With CPM enabled, look for a "Cross-project" sub-toggle near the CPM toggle         | A secondary toggle labelled "Cross-project" (or similar) appears. It is only visible when CPM is enabled.                                                         |
| 4.2  | Create a cross-project dependency: Issue X in Project 2 blocks Issue Y in Project 1 | The relation is created successfully.                                                                                                                             |
| 4.3  | Navigate to Project 1's gantt. Enable CPM, then enable the cross-project toggle.    | The CPM calculation now includes Issue X from Project 2 in its graph. A "phantom anchor" appears at the left edge of the timeline for Issue X (as a predecessor). |
| 4.4  | Inspect the phantom anchor                                                          | It should be a small visual marker (dot with ring or similar) positioned at the timeline edge. It should not overlap with existing block bars.                    |
| 4.5  | Hover over the phantom anchor                                                       | A tooltip displays: the external issue's project identifier and sequence ID (e.g., "PROJ-123"), the issue name, and its date range.                               |
| 4.6  | Disable the cross-project toggle (keep CPM on)                                      | Phantom anchors disappear. CPM calculation reverts to per-project mode, using the external issue's actual dates as fixed inputs.                                  |

## Phase 5: Performance verification

| Step | Action                                                                           | Expected                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Open a project with 100+ issues with dependencies. Enable CPM.                   | CPM results appear without perceptible delay. No browser freeze or long computation blocking the UI.                                                                                          |
| 5.2  | Drag a block on the gantt with CPM enabled                                       | Drag is smooth at 60fps. CPM highlights do NOT flicker during the drag. After drop, CPM values update correctly.                                                                              |
| 5.3  | If available, repeat with 500 issues                                             | The computation should remain sub-second. Verify using browser DevTools Performance tab if needed.                                                                                            |
| 5.4  | With CPM toggled OFF, open React DevTools Profiler on a project with 500+ issues | No CPM-related computed values appear in the profiler trace. Render times should be identical to baseline (before CPM code was added). No network requests for relation data when CPM is off. |

## Phase 6: Interaction with conflict detection

| Step | Action                                                                                                                   | Expected                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Create an issue that has both a dependency conflict (dates violate constraints) AND is on the critical path. Enable CPM. | The block shows the red/coral critical path background. The orange conflict warning icon is ALSO visible and not obscured. |
| 6.2  | Hover over the block                                                                                                     | The tooltip shows both conflict information and CPM data (ES, EF, LS, LF, slack).                                          |

## End-to-end: Full CPM lifecycle

1. Navigate to a project gantt with a dependency graph containing: 4 dated issues (A→B→C critical chain, A→D shorter branch), 1 dateless issue E where C→E.
2. CPM toggle is off. Verify no CPM visuals.
3. Enable CPM. Verify: A, B, C turn red. D retains default colour with a slack extension bar. E appears with dashed border at computed position after C.
4. Hover A: tooltip shows "On critical path — zero slack". Hover D: tooltip shows positive slack value.
5. Drag E to a new position. Verify E converts to manual dates (dashed border disappears), stays visible.
6. Disable CPM. Verify: all red highlighting gone, slack bars gone, E remains visible with its new manual dates. Dateless issues without dependencies remain hidden.
7. Re-enable CPM. Verify: the state is correctly recalculated. E is now a regular dated block (not computed), so it should show as critical or non-critical based on its new dates.

## End-to-end: Cross-project dependency chain

1. Create Project A with issues P1, P2 (P1→P2). Create Project B with issue P3.
2. Create cross-project relation: P2 (Project A) blocks P3 (Project B).
3. Navigate to Project B's gantt. Enable CPM and cross-project toggle.
4. Verify phantom anchor appears for P2 (from Project A).
5. Hover phantom anchor: verify tooltip shows Project A's identifier, P2's ID and name, and dates.
6. Disable cross-project toggle: phantom anchor disappears. CPM calculation uses P2's actual dates as fixed input.
7. Re-enable cross-project toggle: phantom anchor reappears. Verify calculation is consistent.

## Human verification required

These aspects require manual visual assessment that automated tests cannot cover:

| Criterion                              | Why manual                                                                                                                                           | What to verify                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC3.3 (visual fidelity)                | Automated tests verify dateSource property and CSS classes but cannot assess whether the dashed border and 80% opacity are visually distinguishable. | Enable CPM on a project with mixed dated and dateless dependency-linked issues. Visually confirm: (1) dashed border is visible, (2) reduced opacity is noticeable vs. manual blocks, (3) distinction holds at week/month/quarter zoom. |
| AC4.2 (colour appropriateness)         | Automated tests verify the rgb value but cannot assess contrast, accessibility, or palette harmony.                                                  | Enable CPM on a project with critical tasks. Confirm: (1) red is clearly distinguishable from defaults, (2) text is readable, (3) not confused with orange conflict indicator. Check with Chrome DevTools colourblindness simulator.   |
| AC4.5 (combined styling)               | Two independent style systems overlap; automated tests verify individual properties but not the combined result.                                     | Create a dateless issue in a critical chain. Enable CPM. Confirm the block shows red fill with dashed border and reduced opacity simultaneously, and the combination is coherent.                                                      |
| AC5.2 (slack bar visual)               | Automated tests verify opacity value and height but cannot assess the visual impression in context.                                                  | Enable CPM with non-critical tasks. Confirm: (1) slack bars are lighter than task bars, (2) they align vertically, (3) colour conveys "extra time", (4) they do not obscure connectors.                                                |
| AC5.3 (tooltip interaction)            | Automated tests verify text content but not timing, positioning, or layout.                                                                          | Hover over various blocks. Verify: (1) tooltip appears promptly, (2) ES/EF/LS/LF are understandable, (3) float precision is appropriate, (4) no overflow/clipping, (5) critical shows "On critical path".                              |
| AC6.4 (phantom anchor visual)          | E2E tests check data-test presence but not visual noticeability or overlap.                                                                          | Enable cross-project CPM. Confirm: (1) anchors are visible at correct edges, (2) no overlap with blocks, (3) design is recognisable as "external constraint".                                                                          |
| AC6.5 (phantom anchor tooltip content) | Automated tests verify tooltip text but not formatting and readability.                                                                              | Hover phantom anchors. Verify: (1) shows project identifier + sequence ID, (2) issue name displayed, (3) date format matches rest of UI.                                                                                               |
| Performance (drag debouncing)          | Automated tests verify the isDraggingBlock flag but not actual drag smoothness at 60fps.                                                             | Open gantt with 100+ issues. Enable CPM. Drag a block. Confirm smooth drag with no flicker. Repeat with 500 issues.                                                                                                                    |
| Performance (toggle off = zero cost)   | Store short-circuits, but zero observable impact needs profiling.                                                                                    | With CPM off, use React DevTools Profiler. Confirm no CPM compute, identical render times, no network requests.                                                                                                                        |
| Conflict detection interaction         | Two independent styling systems must coexist.                                                                                                        | Create issue with both dependency conflict and critical path membership. Enable CPM. Verify red background AND orange conflict icon both visible.                                                                                      |

## Traceability

| AC     | Automated test                                             | Manual step                 |
| ------ | ---------------------------------------------------------- | --------------------------- |
| AC1.1  | cpm-calculator.test.ts: "forward pass FS chain"            | —                           |
| AC1.2  | cpm-calculator.test.ts: "SS dependencies"                  | —                           |
| AC1.3  | cpm-calculator.test.ts: "FF dependencies"                  | —                           |
| AC1.4  | cpm-calculator.test.ts: "multi-predecessor"                | —                           |
| AC1.5  | cpm-calculator.test.ts: "backward pass LS/LF"              | —                           |
| AC1.6  | cpm-calculator.test.ts: "slack calculation"                | —                           |
| AC1.7  | cpm-calculator.test.ts: "dateless tasks"                   | —                           |
| AC1.8  | cpm-calculator.test.ts: "empty graph"                      | —                           |
| AC1.9  | cpm-calculator.test.ts: "MAX_PROPAGATION_DEPTH"            | —                           |
| AC1.10 | cpm-calculator.test.ts: "start-only/target-only"           | —                           |
| AC2.1  | cpm-store.test.ts: "recompute on date change"              | —                           |
| AC2.2  | cpm-store.test.ts: "recompute on relation change"          | —                           |
| AC2.3  | cpm-store.test.ts: "isCritical accessor"                   | —                           |
| AC2.4  | cpm-store.test.ts: "getSlack accessor"                     | —                           |
| AC2.5  | cpm-store.test.ts: "disabled behaviour"                    | —                           |
| AC2.6  | cpm-store.test.ts: "computedFn memoization"                | —                           |
| AC3.1  | cpm-virtual-dates.test.ts: "inject computed dates"         | Phase 2 step 2.2            |
| AC3.2  | cpm-virtual-dates.test.ts: "dateSource property"           | —                           |
| AC3.3  | cpm-virtual-dates.test.ts: "dateSource for styling"        | Phase 2 step 2.3            |
| AC3.4  | cpm-virtual-dates.test.ts: "drag sets both dates"          | Phase 2 step 2.5            |
| AC3.5  | cpm-virtual-dates.test.ts: "resize prevention"             | Phase 2 step 2.4            |
| AC3.6  | cpm-virtual-dates.test.ts: "no deps remain hidden"         | Phase 2 step 2.7            |
| AC3.7  | cpm-virtual-dates.test.ts: "toggle off removes computed"   | Phase 2 step 2.6            |
| AC4.1  | cpm-visualization.test.ts: "toggle control"                | Phase 1 step 1.2            |
| AC4.2  | cpm-visualization.test.ts: "zero slack critical"           | Phase 1 step 1.4            |
| AC4.3  | cpm-visualization.test.ts: "connector criticality"         | Phase 1 step 1.5            |
| AC4.4  | cpm-visualization.test.ts: "non-critical default"          | Phase 1 step 1.3            |
| AC4.5  | cpm-visualization.test.ts: "critical + computed"           | Phase 2 step 2.3 (combined) |
| AC4.6  | cpm-visualization.test.ts: "CPM off restores default"      | Phase 1 step 1.6            |
| AC4.7  | cpm-visualization.test.ts: "default false"                 | Phase 1 step 1.2            |
| AC5.1  | slack-bar-position.test.ts + slack-tooltip.test.ts         | Phase 3 step 3.2            |
| AC5.2  | slack-tooltip.test.ts: "position and opacity"              | Phase 3 step 3.3            |
| AC5.3  | slack-tooltip.test.ts: "tooltip content"                   | Phase 3 step 3.5            |
| AC5.4  | slack-tooltip.test.ts: "critical tooltip"                  | Phase 3 step 3.6            |
| AC5.5  | slack-tooltip.test.ts: "CPM disabled no bars"              | Phase 3 step 3.8            |
| AC5.6  | slack-bar-position.test.ts: "zero slack null"              | Phase 3 step 3.4            |
| AC6.1  | cpm-visualization.test.ts: "cross-project toggle"          | Phase 4 step 4.1            |
| AC6.2  | cross-project-cpm.test.ts: "fetch external"                | —                           |
| AC6.3  | cross-project-cpm.test.ts: "merge cross-project"           | Phase 4 step 4.3            |
| AC6.4  | cross-project-cpm.test.ts: "phantom anchors"               | Phase 4 step 4.4            |
| AC6.5  | cpm-visualization.test.ts: "phantom tooltip"               | Phase 4 step 4.5            |
| AC6.6  | cross-project-cpm.test.ts: "per-project mode"              | Phase 4 step 4.6            |
| AC6.7  | cross-project-cpm.test.ts: "depth limit"                   | —                           |
| AC7.1  | cpm-critical-path.spec.ts: "toggle shows highlights"       | Phase 1 step 1.3            |
| AC7.2  | cpm-critical-path.spec.ts: "identifies critical tasks"     | Phase 1 step 1.3            |
| AC7.3  | cpm-virtual-dates.spec.ts: "dateless at computed position" | Phase 2 step 2.2            |
| AC7.4  | cpm-virtual-dates.spec.ts: "drag converts to manual"       | Phase 2 step 2.5            |
| AC7.5  | cpm-slack-and-cross-project.spec.ts: "slack bars"          | Phase 3 step 3.2            |
| AC7.6  | cpm-slack-and-cross-project.spec.ts: "phantom anchors"     | Phase 4 step 4.3            |
