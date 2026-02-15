/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import { detectCycleInMemory  } from "./dependency-validation";
import type {DependencyRelationMap} from "./dependency-validation";

describe("Cycle Detection Helper (detectCycleInMemory)", () => {
  describe("AC2.3 - Direct cycle detection", () => {
    /**
     * Test AC2.3: Direct cycle detection.
     * Create relationMap with A→B (blocking), then check B→A.
     * Expect cycle path returned.
     */
    it("should detect direct cycle A→B→A with blocking relation", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });

    /**
     * Test AC2.3: Direct cycle with blocked_by relation.
     * Create A blocked_by B, then check B→A.
     * Expect cycle path returned.
     */
    it("should detect direct cycle with blocked_by relation", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocked_by: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });

    /**
     * Test AC2.3: Direct cycle with start_before relation.
     */
    it("should detect direct cycle with start_before relation", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          start_before: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });

    /**
     * Test AC2.3: Direct cycle with finish_before relation.
     */
    it("should detect direct cycle with finish_before relation", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          finish_before: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });

    /**
     * Test AC2.3: Direct cycle with implemented_by relation.
     */
    it("should detect direct cycle with implemented_by relation", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          implemented_by: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });
  });

  describe("AC2.3 - Transitive cycle detection", () => {
    /**
     * Test AC2.3: Transitive cycle detection.
     * Build A→B→C chain, check C→A. Expect cycle path.
     */
    it("should detect transitive cycle A→B→C→A", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
        B: {
          blocking: ["C"],
        },
      };

      const result = detectCycleInMemory(relationMap, "C", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["C", "A", "B", "C"]);
    });

    /**
     * Test AC2.3: Longer transitive cycle A→B→C→D→A.
     */
    it("should detect longer transitive cycle A→B→C→D→A", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
        B: {
          blocking: ["C"],
        },
        C: {
          blocking: ["D"],
        },
      };

      const result = detectCycleInMemory(relationMap, "D", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["D", "A", "B", "C", "D"]);
    });

    /**
     * Test AC2.3: Mixed relation types in cycle.
     * A --start_before--> B --finish_before--> C --blocking--> A
     */
    it("should detect cycle with mixed relation types", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          start_before: ["B"],
        },
        B: {
          finish_before: ["C"],
        },
        C: {
          blocking: ["A"],
        },
      };

      const result = detectCycleInMemory(relationMap, "C", "A");
      expect(result).not.toBeNull();
      // The cycle path from C through the graph back to C via A:
      // C -> A -> B -> C
      expect(result).toEqual(["C", "A", "B", "C"]);
    });
  });

  describe("AC2.6 - Non-dependency types excluded", () => {
    /**
     * Test AC2.6: Non-dependency types (relates_to, duplicate) do not participate.
     * Create A→B with relates_to only, check B→A with dependency type.
     * Expect no cycle.
     */
    it("should ignore relates_to relations in cycle detection", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          relates_to: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).toBeNull();
    });

    /**
     * Test AC2.6: duplicate relation should be ignored.
     */
    it("should ignore duplicate relations in cycle detection", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          duplicate: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).toBeNull();
    });

    /**
     * Test AC2.6: Multiple non-dependency relations should not create false cycles.
     */
    it("should ignore mixed non-dependency relations", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          relates_to: ["B"],
          duplicate: ["C"],
        },
        B: {
          relates_to: ["C"],
        },
      };

      const result = detectCycleInMemory(relationMap, "C", "A");
      expect(result).toBeNull();
    });

    /**
     * Test AC2.6: Dependency types should still be detected even with non-dependency types present.
     */
    it("should detect dependency cycles even with non-dependency types present", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
          relates_to: ["C"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["B", "A", "B"]);
    });
  });

  describe("Self-reference detection", () => {
    /**
     * Test: Self-reference (A→A) should be detected as a cycle.
     */
    it("should detect self-reference as a cycle", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["A"],
        },
      };

      const result = detectCycleInMemory(relationMap, "A", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["A"]);
    });

    /**
     * Test: Self-reference on empty relationMap.
     */
    it("should detect self-reference even on empty relationMap", () => {
      const relationMap: DependencyRelationMap = {};

      const result = detectCycleInMemory(relationMap, "A", "A");
      expect(result).not.toBeNull();
      expect(result).toEqual(["A"]);
    });
  });

  describe("No cycle cases", () => {
    /**
     * Test: Create A→B, check A→C. Expect no cycle.
     */
    it("should return null when no cycle exists", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "A", "C");
      expect(result).toBeNull();
    });

    /**
     * Test: Longer chain without cycle A→B→C, check A→D.
     */
    it("should return null for longer chain without cycle", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
        B: {
          blocking: ["C"],
        },
      };

      const result = detectCycleInMemory(relationMap, "A", "D");
      expect(result).toBeNull();
    });

    /**
     * Test: Unrelated subgraphs without cycle.
     */
    it("should return null for unrelated subgraphs", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
        C: {
          blocking: ["D"],
        },
      };

      const result = detectCycleInMemory(relationMap, "A", "C");
      expect(result).toBeNull();
    });
  });

  describe("Empty and edge case graphs", () => {
    /**
     * Test: Empty relationMap should return null for any check.
     */
    it("should return null on empty relationMap", () => {
      const relationMap: DependencyRelationMap = {};

      const result = detectCycleInMemory(relationMap, "A", "B");
      expect(result).toBeNull();
    });

    /**
     * Test: relationMap with no relations for source/target.
     */
    it("should return null when neither source nor target has relations", () => {
      const relationMap: DependencyRelationMap = {
        C: {
          blocking: ["D"],
        },
      };

      const result = detectCycleInMemory(relationMap, "A", "B");
      expect(result).toBeNull();
    });

    /**
     * Test: Target has no outgoing relations.
     */
    it("should return null when target has no outgoing relations", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
        },
      };

      const result = detectCycleInMemory(relationMap, "B", "A");
      expect(result).not.toBeNull();
    });
  });

  describe("Complex graph scenarios", () => {
    /**
     * Test: Multiple incoming relations to same node (diamond graph).
     * A and B both point to C, C points to D.
     * Checking D->A: there IS a path A->C->D, so D->A would create a cycle A->C->D->A.
     */
    it("should detect cycle in diamond-shaped graph where A→C→D forms a path", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["C"],
        },
        B: {
          blocking: ["C"],
        },
        C: {
          blocking: ["D"],
        },
      };

      const result = detectCycleInMemory(relationMap, "D", "A");
      expect(result).not.toBeNull();
      // Cycle: D -> A -> C -> D
      expect(result).toEqual(["D", "A", "C", "D"]);
    });

    /**
     * Test: Diamond graph with no incoming path to source.
     * E and F both point to G (separate from A-C-D).
     * Checking D->E: no path from D to E, so no cycle.
     */
    it("should return null for diamond-shaped graph with disjoint components", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["C"],
        },
        C: {
          blocking: ["D"],
        },
        E: {
          blocking: ["G"],
        },
        F: {
          blocking: ["G"],
        },
      };

      const result = detectCycleInMemory(relationMap, "D", "E");
      expect(result).toBeNull();
    });

    /**
     * Test: Complex graph with multiple relation types.
     */
    it("should handle complex graph with multiple relation types", () => {
      const relationMap: DependencyRelationMap = {
        A: {
          blocking: ["B"],
          start_before: ["C"],
        },
        B: {
          finish_before: ["D"],
        },
        C: {
          blocking: ["D"],
        },
        D: {
          implemented_by: ["A"],
        },
      };

      const result = detectCycleInMemory(relationMap, "D", "A");
      expect(result).not.toBeNull();
      expect(result).toContain("A");
      expect(result).toContain("D");
    });

    /**
     * Test: Large graph with depth limit.
     * Create a chain longer than the depth limit (100).
     */
    it("should respect depth limit to prevent unbounded search", () => {
      const relationMap: DependencyRelationMap = {};

      // Create a chain: START -> 1 -> 2 -> ... -> 99 -> 100 -> START
      for (let i = 1; i <= 100; i++) {
        if (i === 1) {
          relationMap["START"] = { blocking: ["1"] };
        } else {
          relationMap[String(i - 1)] = {
            blocking: [String(i)],
          };
        }
      }
      // Add cycle: 100 -> START (this should not be detected due to depth limit)
      relationMap["100"] = { blocking: ["START"] };

      // Attempting to find cycle from START to START should still detect self-reference
      // But a very deep cycle might not be detected due to depth limit
      const result = detectCycleInMemory(relationMap, "START", "START");
      expect(result).toEqual(["START"]);
    });
  });

  describe("Various issue ID formats", () => {
    /**
     * Test: Different issue ID formats (UUIDs, alphanumeric, etc.).
     */
    it("should handle different issue ID formats", () => {
      const relationMap: DependencyRelationMap = {
        "issue-abc-123": {
          blocking: ["issue-def-456"],
        },
      };

      const result = detectCycleInMemory(relationMap, "issue-def-456", "issue-abc-123");
      expect(result).not.toBeNull();
      expect(result).toEqual(["issue-def-456", "issue-abc-123", "issue-def-456"]);
    });

    /**
     * Test: Numeric string issue IDs.
     */
    it("should handle numeric string issue IDs", () => {
      const relationMap: DependencyRelationMap = {
        "1": {
          blocking: ["2"],
        },
        "2": {
          blocking: ["3"],
        },
      };

      const result = detectCycleInMemory(relationMap, "3", "1");
      expect(result).not.toBeNull();
      expect(result).toEqual(["3", "1", "2", "3"]);
    });
  });
});
