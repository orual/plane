/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import { REVERSE_RELATIONS } from "../../../core/constants/gantt-chart";
import { ISSUE_RELATION_OPTIONS, RELATION_GROUPS } from "./index";
import type { TIssueRelationTypes } from "../types";

describe("Relation Type Expansion", () => {
  describe("REVERSE_RELATIONS (AC1.3 - Bidirectional mapping)", () => {
    /**
     * Test AC1.3: Bidirectional mapping of relation types.
     * Verifies that each relation type maps to its correct reverse.
     */
    it("should map blocking to blocked_by and vice versa", () => {
      expect(REVERSE_RELATIONS["blocking"]).toBe("blocked_by");
      expect(REVERSE_RELATIONS["blocked_by"]).toBe("blocking");
    });

    it("should map relates_to to itself", () => {
      expect(REVERSE_RELATIONS["relates_to"]).toBe("relates_to");
    });

    it("should map duplicate to itself", () => {
      expect(REVERSE_RELATIONS["duplicate"]).toBe("duplicate");
    });

    it("should map start_before to start_after and vice versa", () => {
      expect(REVERSE_RELATIONS["start_before"]).toBe("start_after");
      expect(REVERSE_RELATIONS["start_after"]).toBe("start_before");
    });

    it("should map finish_before to finish_after and vice versa", () => {
      expect(REVERSE_RELATIONS["finish_before"]).toBe("finish_after");
      expect(REVERSE_RELATIONS["finish_after"]).toBe("finish_before");
    });

    it("should map implemented_by to implements and vice versa", () => {
      expect(REVERSE_RELATIONS["implemented_by"]).toBe("implements");
      expect(REVERSE_RELATIONS["implements"]).toBe("implemented_by");
    });

    /**
     * Property: Bidirectional relations are symmetric.
     * For any relation type R, REVERSE_RELATIONS[REVERSE_RELATIONS[R]] === R
     */
    it("should be bidirectional (round-trip property)", () => {
      const allRelationTypes: TIssueRelationTypes[] = [
        "blocking",
        "blocked_by",
        "relates_to",
        "duplicate",
        "start_before",
        "start_after",
        "finish_before",
        "finish_after",
        "implemented_by",
        "implements",
      ];

      allRelationTypes.forEach((relType) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const reverse = REVERSE_RELATIONS[relType];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const roundtrip = REVERSE_RELATIONS[reverse as TIssueRelationTypes];
        expect(roundtrip).toBe(relType, `${relType} -> ${reverse} -> ${String(roundtrip)} should equal ${relType}`);
      });
    });
  });

  describe("RELATION_GROUPS (AC1.4 - Grouping)", () => {
    /**
     * Test AC1.4: Relation types are grouped into "Scheduling", "Structural", and "Other".
     */
    it("should have three groups: scheduling, structural, and other", () => {
      expect(RELATION_GROUPS).toHaveLength(3);
      const keys = RELATION_GROUPS.map((group) => group.key);
      expect(keys).toEqual(["scheduling", "structural", "other"]);
    });

    it("should have i18n labels for all groups", () => {
      RELATION_GROUPS.forEach((group) => {
        expect(group.i18n_label).toBeTruthy();
        expect(group.i18n_label).toMatch(/^issue\.relation\.group\./);
      });
    });

    it("should have scheduling group with all scheduling relation types", () => {
      const schedulingGroup = RELATION_GROUPS.find((g) => g.key === "scheduling");
      expect(schedulingGroup).toBeDefined();

      const expectedTypes: TIssueRelationTypes[] = [
        "blocking",
        "blocked_by",
        "start_before",
        "start_after",
        "finish_before",
        "finish_after",
      ];

      expect(schedulingGroup!.types).toEqual(expectedTypes);
    });

    it("should have structural group with implemented_by and implements", () => {
      const structuralGroup = RELATION_GROUPS.find((g) => g.key === "structural");
      expect(structuralGroup).toBeDefined();

      const expectedTypes: TIssueRelationTypes[] = ["implemented_by", "implements"];
      expect(structuralGroup!.types).toEqual(expectedTypes);
    });

    it("should have other group with relates_to and duplicate", () => {
      const otherGroup = RELATION_GROUPS.find((g) => g.key === "other");
      expect(otherGroup).toBeDefined();

      const expectedTypes: TIssueRelationTypes[] = ["relates_to", "duplicate"];
      expect(otherGroup!.types).toEqual(expectedTypes);
    });

    /**
     * Property: All 10 relation types are present across all groups.
     */
    it("should include all 10 relation types across all groups", () => {
      const allGroupTypes = RELATION_GROUPS.flatMap((group) => group.types);

      const expectedAll: TIssueRelationTypes[] = [
        "blocking",
        "blocked_by",
        "relates_to",
        "duplicate",
        "start_before",
        "start_after",
        "finish_before",
        "finish_after",
        "implemented_by",
        "implements",
      ];

      expect(allGroupTypes.sort()).toEqual(expectedAll.sort());
    });

    /**
     * Property: No duplicate types in groups.
     */
    it("should not have duplicate types across groups", () => {
      const allGroupTypes = RELATION_GROUPS.flatMap((group) => group.types);
      const uniqueTypes = new Set(allGroupTypes);
      expect(uniqueTypes.size).toBe(allGroupTypes.length);
    });
  });

  describe("ISSUE_RELATION_OPTIONS (AC1.7 - Completeness)", () => {
    /**
     * Test AC1.7: ISSUE_RELATION_OPTIONS has entries for all 10 relation types
     * with required properties (key, i18n_label, className, icon, placeholder).
     */
    it("should have entries for all 10 relation types", () => {
      const expectedTypes: TIssueRelationTypes[] = [
        "blocking",
        "blocked_by",
        "relates_to",
        "duplicate",
        "start_before",
        "start_after",
        "finish_before",
        "finish_after",
        "implemented_by",
        "implements",
      ];

      expectedTypes.forEach((relType) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(ISSUE_RELATION_OPTIONS[relType]).toBeDefined();
      });
    });

    it("should have entries only for the 10 relation types", () => {
      const keys = Object.keys(ISSUE_RELATION_OPTIONS) as TIssueRelationTypes[];
      expect(keys.length).toBe(10);
    });

    /**
     * Property: Each option has required properties.
     */
    it("should have key property matching the relation type", () => {
      Object.entries(ISSUE_RELATION_OPTIONS).forEach(([relType, option]) => {
         
        expect(option.key).toBe(relType as TIssueRelationTypes);
      });
    });

    it("should have i18n_label property for all options", () => {
      Object.values(ISSUE_RELATION_OPTIONS).forEach((option) => {
        expect(option.i18n_label).toBeTruthy();
        expect(option.i18n_label).toMatch(/^issue\.relation\./);
      });
    });

    it("should have className property for all options", () => {
      Object.values(ISSUE_RELATION_OPTIONS).forEach((option) => {
        expect(option.className).toBeTruthy();
        expect(typeof option.className).toBe("string");
      });
    });

    it("should have icon function for all options", () => {
      Object.values(ISSUE_RELATION_OPTIONS).forEach((option) => {
        expect(option.icon).toBeTruthy();
        expect(typeof option.icon).toBe("function");
      });
    });

    it("should have placeholder property for all options", () => {
      Object.values(ISSUE_RELATION_OPTIONS).forEach((option) => {
        expect(option.placeholder).toBeTruthy();
        expect(typeof option.placeholder).toBe("string");
      });
    });

    /**
     * Property: Icon function is callable and returns a React element (JSX.Element).
     * For simplicity, we just verify it doesn't throw.
     */
    it("should have callable icon functions", () => {
      Object.values(ISSUE_RELATION_OPTIONS).forEach((option) => {
        expect(() => option.icon(16)).not.toThrow();
      });
    });

    /**
     * Test AC1.1, AC1.2: start_before and finish_before are available.
     */
    it("should have start_before option", () => {
      const option = ISSUE_RELATION_OPTIONS["start_before"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.start_before");
    });

    it("should have finish_before option", () => {
      const option = ISSUE_RELATION_OPTIONS["finish_before"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.finish_before");
    });

    /**
     * Test AC1.5: implemented_by and implements are available (structural types).
     */
    it("should have implemented_by option", () => {
      const option = ISSUE_RELATION_OPTIONS["implemented_by"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.implemented_by");
    });

    it("should have implements option", () => {
      const option = ISSUE_RELATION_OPTIONS["implements"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.implements");
    });

    /**
     * Test AC1.7: Existing relations (blocking, blocked_by, relates_to, duplicate) still exist.
     */
    it("should preserve existing blocking relation", () => {
      const option = ISSUE_RELATION_OPTIONS["blocking"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.blocking");
    });

    it("should preserve existing blocked_by relation", () => {
      const option = ISSUE_RELATION_OPTIONS["blocked_by"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.blocked_by");
    });

    it("should preserve existing relates_to relation", () => {
      const option = ISSUE_RELATION_OPTIONS["relates_to"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.relates_to");
    });

    it("should preserve existing duplicate relation", () => {
      const option = ISSUE_RELATION_OPTIONS["duplicate"];
      expect(option).toBeDefined();
      expect(option.i18n_label).toBe("issue.relation.duplicate");
    });
  });
});
