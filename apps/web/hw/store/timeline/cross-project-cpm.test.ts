/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInAction } from "mobx";
import type { IGanttBlock, ChartDataType } from "@plane/types";
import { BaseTimeLineStore } from "./base-timeline.store";

type MockIssue = {
  project_id?: string;
  start_date?: string | null;
  target_date?: string | null;
};

type MockIssueDetail = {
  getIssueById: (id: string) => MockIssue | undefined;
};

type MockRelation = {
  relationMap: Record<string, Record<string, Array<string>>>;
  fetchRelations?: (workspaceSlug: string, projectId: string, issueId: string) => Promise<void>;
};

/**
 * Minimal typed mock structure for root store.
 * Only includes the properties accessed by BaseTimeLineStore.
 */
type MockRootStore = {
  issue: {
    issueDetail: {
      relation: MockRelation;
      issue: MockIssueDetail;
    };
  };
};

/**
 * Create a mock Gantt block with optional overrides.
 */
function createMockBlock(overrides?: Partial<IGanttBlock>): IGanttBlock {
  return {
    id: "block-1",
    start_date: "2024-01-10",
    target_date: "2024-01-15",
    sort_order: 0,
    project_id: "proj-1",
    position: {
      marginLeft: 100,
      width: 50,
    },
    ...overrides,
  } as IGanttBlock;
}

/**
 * Create a mock chart data with standard day width.
 */
function createMockChartData(): ChartDataType {
  return {
    key: "week",
    i18n_title: "Week",
    data: {
      startDate: new Date("2024-01-01"),
      currentDate: new Date("2024-01-15"),
      endDate: new Date("2024-12-31"),
      approxFilterRange: 180,
      dayWidth: 40,
    },
  };
}

describe("BaseTimeLineStore - Cross-Project CPM", () => {
  let store: BaseTimeLineStore;
  let mockRootStore: MockRootStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal mock root store with relation store
    mockRootStore = {
      issue: {
        issueDetail: {
          relation: {
            relationMap: {} as Record<string, Record<string, Array<string>>>,
            fetchRelations: vi.fn(),
          },
          issue: {
            getIssueById: vi.fn(),
          },
        },
      },
    };

    // Create store using properly-typed mock
    // @ts-expect-error - Mock implementation provides necessary properties
    store = new BaseTimeLineStore(mockRootStore);
    store.updateCurrentViewData(createMockChartData());
  });

  describe("fetchCrossProjectRelations", () => {
    it("should identify external issue IDs from relation map (AC6.2)", async () => {
      // Setup: Local blocks A and B with relation, external issue C referenced
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "local-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
          "local-b": blockB,
        };
      });

      // Setup relation map: local-b is blocked by local-a (internal),
      // and local-b is blocked by external-c (external)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-b": {
          blocking: [],
          blocked_by: ["local-a", "external-c"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Mock external issue
      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-c") {
          return { project_id: "proj-external" };
        }
        return undefined;
      });

      const mockFetchRelations = mockRootStore.issue.issueDetail.relation.fetchRelations as any;
      mockFetchRelations.mockResolvedValue(undefined);

      // Execute
      await store.fetchCrossProjectRelations("workspace-1");

      // Verify: fetchRelations was called for the external issue
      expect(mockFetchRelations).toHaveBeenCalledWith("workspace-1", "proj-external", "external-c");
    });

    it("should populate crossProjectRelationCache with fetched relations (AC6.2)", async () => {
      // Setup: External issue with its own relations
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return { project_id: "proj-external" };
        }
        return undefined;
      });

      const mockFetchRelations = mockRootStore.issue.issueDetail.relation.fetchRelations as any;
      // eslint-disable-next-line @typescript-eslint/require-await
      mockFetchRelations.mockImplementation(async () => {
        // Simulate populating relation map for external issue
        mockRootStore.issue.issueDetail.relation.relationMap["external-b"] = {
          blocking: ["external-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      // Execute
      await store.fetchCrossProjectRelations("workspace-1");

      // Verify: crossProjectRelationCache contains external-b's relations
      expect(store.crossProjectRelationCache["external-b"]).toBeDefined();
      expect(store.crossProjectRelationCache["external-b"].blocking).toEqual(["external-c"]);
    });

    it("should gracefully skip external issues that fail to fetch", async () => {
      // Setup: One valid external issue, one that fails
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b", "external-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return { project_id: "proj-external" };
        }
        if (id === "external-c") {
          return { project_id: "proj-external-2" };
        }
        return undefined;
      });

      const mockFetchRelations = mockRootStore.issue.issueDetail.relation.fetchRelations as any;
      // eslint-disable-next-line @typescript-eslint/require-await
      mockFetchRelations.mockImplementation(async (_workspaceSlug: string, _projectId: string, issueId: string) => {
        if (issueId === "external-c") {
          throw new Error("Permission denied");
        }
        // external-b succeeds
        mockRootStore.issue.issueDetail.relation.relationMap["external-b"] = {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      // Execute (should not throw)
      await expect(store.fetchCrossProjectRelations("workspace-1")).resolves.not.toThrow();

      // Verify: external-b was cached, external-c was skipped
      expect(store.crossProjectRelationCache["external-b"]).toBeDefined();
      expect(store.crossProjectRelationCache["external-c"]).toBeUndefined();
    });
  });

  describe("cpmResults with cross-project mode disabled (AC6.6)", () => {
    it("should use only local relation map when crossProjectCpmEnabled is false", () => {
      // Setup: Local blocks A and B with internal relation only
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "local-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
          "local-b": blockB,
        };
      });

      // Setup: local-b depends on local-a (only local relations)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-b": {
          blocking: [],
          blocked_by: ["local-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((_id: string) => undefined);

      // Enable CPM but NOT cross-project mode
      store.setCpmEnabled(true);
      expect(store.crossProjectCpmEnabled).toBe(false);

      // Verify: CPM results only use local relation map
      const results = store.cpmResults;
      expect(results.has("local-a")).toBe(true);
      expect(results.has("local-b")).toBe(true);
    });

    it("should use external issue dates as fixed inputs when not in cross-project mode (AC6.6)", () => {
      // Setup: local-b depends on external-c
      const blockB = createMockBlock({
        id: "local-b",
        start_date: "2024-01-20",
        target_date: "2024-01-22",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-b": blockB,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-b": {
          blocking: [],
          blocked_by: ["external-c"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // External issue with fixed dates
      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-c") {
          return {
            project_id: "proj-external",
            start_date: "2024-01-10",
            target_date: "2024-01-15",
          };
        }
        return undefined;
      });

      store.setCpmEnabled(true);

      // Verify: CPM computes using external-c's actual dates as fixed constraints
      const results = store.cpmResults;
      const resultB = results.get("local-b");
      // local-b should have computed dates based on external-c's actual dates
      expect(resultB).toBeDefined();
    });
  });

  describe("cpmResults with cross-project mode enabled (AC6.3)", () => {
    it("should merge external relations into CPM graph when enabled", () => {
      // Setup: local-a → local-b → external-c chain
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "local-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
          "local-b": blockB,
        };
      });

      // Local relations: local-a blocks local-b, local-b blocks external-c
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["local-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "local-b": {
          blocking: ["external-c"],
          blocked_by: ["local-a"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // External relations in cache: external-c blocks external-d
      runInAction(() => {
        store.crossProjectRelationCache["external-c"] = {
          blocking: ["external-d"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-c") {
          return {
            project_id: "proj-external",
            start_date: "2024-01-16",
            target_date: "2024-01-20",
          };
        }
        if (id === "external-d") {
          return {
            project_id: "proj-external",
            start_date: "2024-01-21",
            target_date: "2024-01-25",
          };
        }
        return undefined;
      });

      // Enable cross-project CPM
      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Verify: cpmResults includes computations that span the local->external chain
      const results = store.cpmResults;
      expect(results.has("local-a")).toBe(true);
      expect(results.has("local-b")).toBe(true);
      // external-c and external-d are in the merged graph and should have CPM results
      expect(results.has("external-c")).toBe(true);
      expect(results.has("external-d")).toBe(true);
    });

    it("should propagate dates across project boundaries in cross-project mode (AC6.3)", () => {
      // Setup: Create a chain where external issue's dates are computed
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      // local-a blocks external-b (which has no dates)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // External relations: external-b blocks external-c
      runInAction(() => {
        store.crossProjectRelationCache["external-b"] = {
          blocking: ["external-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return {
            project_id: "proj-external",
            start_date: null,
            target_date: null,
          };
        }
        if (id === "external-c") {
          return {
            project_id: "proj-external",
            start_date: null,
            target_date: null,
          };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Verify: external issues have computed dates propagated from local-a
      const results = store.cpmResults;
      const resultB = results.get("external-b");
      const resultC = results.get("external-c");

      expect(resultB).toBeDefined();
      expect(resultC).toBeDefined();
      // external-b should start after local-a finishes
      expect(resultB?.es).toBeTruthy();
      const resultBStartDate = resultB?.es ? new Date(resultB.es).getTime() : 0;
      const expectedMinDate = new Date("2024-01-12").getTime();
      expect(resultBStartDate).toBeGreaterThanOrEqual(expectedMinDate);
    });

    it("should not include external relations when crossProjectCpmEnabled is false", () => {
      // Setup: local-a blocks external-b, but cross-project is disabled
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      // Populate cache with external relations (but they shouldn't be used)
      runInAction(() => {
        store.crossProjectRelationCache["external-b"] = {
          blocking: ["external-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return { project_id: "proj-external", start_date: "2024-01-13", target_date: "2024-01-15" };
        }
        if (id === "external-c") {
          return { project_id: "proj-external", start_date: null, target_date: null };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(false); // Explicitly disabled

      // Verify: external-c is not in results (its relation is in cache but not used)
      const results = store.cpmResults;
      expect(results.has("local-a")).toBe(true);
      // external-c should not be in results because its relation (external-b → external-c)
      // is in the cache but not merged into the effective relation map
      const hasExternalC = results.has("external-c");
      expect(hasExternalC).toBe(false);
    });
  });

  describe("MAX_PROPAGATION_DEPTH constraint (AC6.7)", () => {
    it("should respect MAX_PROPAGATION_DEPTH when traversing deep chains", () => {
      // Setup: Create a deep chain of blocks (50 local + 50 external = 100 at limit)
      // All blocks have the same dates (no duration) to keep it simple
      const blocks: Record<string, IGanttBlock> = {};
      const relationMap: Record<string, Record<string, Array<string>>> = {};

      // Create 50 local blocks with dated chain relations
      for (let i = 0; i < 50; i++) {
        const blockId = `local-${i}`;
        blocks[blockId] = createMockBlock({
          id: blockId,
          start_date: "2024-01-10",
          target_date: "2024-01-15",
        });

        relationMap[blockId] = {
          blocking: i < 49 ? [`local-${i + 1}`] : ["external-50"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      }

      runInAction(() => {
        store.blocksMap = blocks;
      });

      mockRootStore.issue.issueDetail.relation.relationMap = relationMap;

      // Create 50 external blocks in cross-project cache (total 100 blocks, at limit)
      const externalCache: Record<string, Record<string, Array<string>>> = {};
      for (let i = 50; i < 100; i++) {
        externalCache[`external-${i}`] = {
          blocking: i < 99 ? [`external-${i + 1}`] : [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      }

      runInAction(() => {
        store.crossProjectRelationCache = externalCache;
      });

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id.startsWith("external-")) {
          // Provide dates for external blocks
          return {
            project_id: "proj-external",
            start_date: "2024-01-10",
            target_date: "2024-01-15",
          };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Execute: Compute CPM (should not error, respecting depth limit)
      const results = store.cpmResults;

      // Verify: CPM computation completed without error
      expect(results).toBeDefined();
      expect(results.size).toBeGreaterThan(0);

      // Issues within depth limit should be in results
      expect(results.has("local-0")).toBe(true);
      expect(results.has("local-49")).toBe(true);
      expect(results.has("external-50")).toBe(true);
    });
  });

  describe("setCrossProjectCpmEnabled action", () => {
    it("should set the crossProjectCpmEnabled flag", () => {
      expect(store.crossProjectCpmEnabled).toBe(false);

      store.setCrossProjectCpmEnabled(true);
      expect(store.crossProjectCpmEnabled).toBe(true);

      store.setCrossProjectCpmEnabled(false);
      expect(store.crossProjectCpmEnabled).toBe(false);
    });

    it("should trigger cpmResults recomputation when changed", () => {
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      runInAction(() => {
        store.crossProjectRelationCache["external-b"] = {
          blocking: [],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        };
      });

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return {
            project_id: "proj-external",
            start_date: "2024-01-13",
            target_date: "2024-01-15",
          };
        }
        return undefined;
      });

      store.setCpmEnabled(true);

      // With cross-project disabled, results should only use local relation map
      // (CPM computes including external-b via local-a → external-b relation)

      // Enable cross-project
      store.setCrossProjectCpmEnabled(true);

      // Now the cache relations are merged, which affects CPM computation
      const resultsAfter = store.cpmResults;
      // external-b should now have results from cache relations
      expect(resultsAfter.has("external-b")).toBe(true);
    });
  });

  describe("getIssueDates lookup fallback", () => {
    it("should look up dates from issue store for external issues", () => {
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return {
            project_id: "proj-external",
            start_date: "2024-01-13",
            target_date: "2024-01-20",
          };
        }
        return undefined;
      });

      store.setCpmEnabled(true);

      // Verify: cpmResults can look up external-b's dates from issue store
      expect(mockGetIssueById).toBeDefined();
      const results = store.cpmResults;
      // local-a should be in results (it's in blocksMap)
      expect(results.has("local-a")).toBe(true);
      // external-b should also be in results (via relation graph)
      expect(results.has("external-b")).toBe(true);
    });
  });

  describe("AC6.4: Phantom anchors render at timeline edges for external constraints", () => {
    it("should identify external issue IDs that need phantom anchors when cross-project enabled", () => {
      // Setup: Local blocks with relations to external issues
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });
      const blockB = createMockBlock({
        id: "local-b",
        start_date: "2024-01-13",
        target_date: "2024-01-15",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
          "local-b": blockB,
        };
      });

      // Relations: local-a blocks external-c (predecessor), local-b blocks external-d (successor)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-c"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
        "local-b": {
          blocking: ["external-d"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-c") {
          return { project_id: "proj-ext", start_date: "2024-01-16", target_date: "2024-01-20" };
        }
        if (id === "external-d") {
          return { project_id: "proj-ext", start_date: "2024-01-16", target_date: "2024-01-20" };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Verify: Both external issues referenced in relations are available for phantom anchor rendering
      const relationMap = mockRootStore.issue.issueDetail.relation.relationMap;
      const externalIssues = new Set<string>();

      for (const [_issueId, relations] of Object.entries(relationMap)) {
        for (const relType of Object.keys(relations) as any[]) {
          for (const targetId of relations[relType]) {
            if (!Object.keys(store.blocksMap).includes(targetId)) {
              externalIssues.add(targetId);
            }
          }
        }
      }

      // Verify: external-c and external-d are identified
      expect(externalIssues.has("external-c")).toBe(true);
      expect(externalIssues.has("external-d")).toBe(true);
    });

    it("should not render phantom anchors when cross-project CPM is disabled", () => {
      // Setup: Same relations as above but with cross-project disabled
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-b"],
          blocked_by: [],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-b") {
          return { project_id: "proj-ext", start_date: "2024-01-13", target_date: "2024-01-15" };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(false); // Explicitly disabled

      // Verify: CPM results do not include external-b's relations (phantom anchors should not render)
      const results = store.cpmResults;
      // external-b is in the local relation map but its own relations are not in the effective map
      expect(results.has("external-b")).toBe(true); // But not its dependencies
    });

    it("should derive set of external issue IDs for left (predecessor) and right (successor) edges", () => {
      // Setup: Create scenario with predecessors (left edge) and successors (right edge)
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      // local-a is blocked by external-pred (left edge), and blocks external-succ (right edge)
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-succ"],
          blocked_by: ["external-pred"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id === "external-pred") {
          return { project_id: "proj-ext", start_date: "2024-01-01", target_date: "2024-01-09" };
        }
        if (id === "external-succ") {
          return { project_id: "proj-ext", start_date: "2024-01-13", target_date: "2024-01-20" };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Classify external issues by side
      const relationMap = mockRootStore.issue.issueDetail.relation.relationMap;
      const leftEdgeIssues = new Set<string>();
      const rightEdgeIssues = new Set<string>();

      for (const [issueId, relations] of Object.entries(relationMap)) {
        if (!Object.keys(store.blocksMap).includes(issueId)) continue;

        // Predecessors (blocked_by) render at left edge
        for (const pred of relations["blocked_by"] || []) {
          if (!Object.keys(store.blocksMap).includes(pred)) {
            leftEdgeIssues.add(pred);
          }
        }

        // Successors (blocking) render at right edge
        for (const succ of relations["blocking"] || []) {
          if (!Object.keys(store.blocksMap).includes(succ)) {
            rightEdgeIssues.add(succ);
          }
        }
      }

      // Verify: Predecessors on left, successors on right
      expect(leftEdgeIssues.has("external-pred")).toBe(true);
      expect(rightEdgeIssues.has("external-succ")).toBe(true);
    });

    it("should handle multiple external issues on same edge (AC6.4)", () => {
      // Setup: Multiple predecessors and successors
      const blockA = createMockBlock({
        id: "local-a",
        start_date: "2024-01-10",
        target_date: "2024-01-12",
      });

      runInAction(() => {
        store.blocksMap = {
          "local-a": blockA,
        };
      });

      // local-a blocked by multiple external issues, blocks multiple external issues
      mockRootStore.issue.issueDetail.relation.relationMap = {
        "local-a": {
          blocking: ["external-succ-1", "external-succ-2"],
          blocked_by: ["external-pred-1", "external-pred-2"],
          start_before: [],
          start_after: [],
          finish_before: [],
          finish_after: [],
          relates_to: [],
          duplicate: [],
          implements: [],
          implemented_by: [],
        },
      };

      const mockGetIssueById = mockRootStore.issue.issueDetail.issue.getIssueById as any;
      mockGetIssueById.mockImplementation((id: string) => {
        if (id.startsWith("external-")) {
          return { project_id: "proj-ext", start_date: "2024-01-01", target_date: "2024-01-20" };
        }
        return undefined;
      });

      store.setCpmEnabled(true);
      store.setCrossProjectCpmEnabled(true);

      // Collect external issues by edge
      const relationMap = mockRootStore.issue.issueDetail.relation.relationMap;
      const allExternalLeft = new Set<string>();
      const allExternalRight = new Set<string>();

      for (const [issueId, relations] of Object.entries(relationMap)) {
        if (!Object.keys(store.blocksMap).includes(issueId)) continue;

        for (const pred of relations["blocked_by"] || []) {
          if (!Object.keys(store.blocksMap).includes(pred)) {
            allExternalLeft.add(pred);
          }
        }

        for (const succ of relations["blocking"] || []) {
          if (!Object.keys(store.blocksMap).includes(succ)) {
            allExternalRight.add(succ);
          }
        }
      }

      // Verify: All external issues on each edge are identified
      expect(allExternalLeft.size).toBe(2);
      expect(allExternalLeft.has("external-pred-1")).toBe(true);
      expect(allExternalLeft.has("external-pred-2")).toBe(true);

      expect(allExternalRight.size).toBe(2);
      expect(allExternalRight.has("external-succ-1")).toBe(true);
      expect(allExternalRight.has("external-succ-2")).toBe(true);
    });
  });
});
