/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import type { TIssueRelationMap } from "@plane/types";
import { detectDependencyConflicts } from "./dependency-conflict";

describe("detectDependencyConflicts", () => {
  // Helper to create relation maps
  const createRelationMap = (
    issueId: string,
    relations: Record<string, Array<string> | undefined>
  ): TIssueRelationMap => {
    const relationRecord: Record<string, Array<string>> = {
      blocking: relations.blocking ?? [],
      blocked_by: relations.blocked_by ?? [],
      duplicate: relations.duplicate ?? [],
      relates_to: relations.relates_to ?? [],
      start_before: relations.start_before ?? [],
      start_after: relations.start_after ?? [],
      finish_before: relations.finish_before ?? [],
      finish_after: relations.finish_after ?? [],
      implemented_by: relations.implemented_by ?? [],
      implements: relations.implements ?? [],
    };
    return {
      [issueId]: relationRecord,
    };
  };

  // Helper to get issue dates
  const getIssueDatesFactory =
    (issueData: Record<string, { start_date: string | null; target_date: string | null }>) => (id: string) =>
      issueData[id];

  it("should return empty array when issue has no dates (AC7.7)", () => {
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-12", target_date: "2025-01-15" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: null, target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should detect FS conflict when issue starts before predecessor finishes (AC7.1)", () => {
    // Issue B has start_date=Jan 10, predecessor A has target_date=Jan 12 via blocked_by
    // B should start on or after Jan 13 (A's target + 1 day) — conflict!
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].predecessorIssueId).toBe("issue-a");
    expect(conflicts[0].relationType).toBe("blocked_by");
    expect(conflicts[0].message).toContain("Start date is before issue-a finishes");
  });

  it("should not detect FS conflict when issue starts after predecessor finishes", () => {
    // Issue B has start_date=Jan 14, predecessor A has target_date=Jan 12 via blocked_by
    // B starts after A finishes (Jan 13) — no conflict
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-14", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should detect SS conflict when issue starts before predecessor starts", () => {
    // Issue B has start_date=Jan 5, predecessor A has start_date=Jan 8 via start_after
    // B should start on or after Jan 8 — conflict!
    const relationMap = createRelationMap("issue-b", {
      start_after: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-05", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].predecessorIssueId).toBe("issue-a");
    expect(conflicts[0].relationType).toBe("start_after");
    expect(conflicts[0].message).toContain("Start date is before issue-a starts");
  });

  it("should not detect SS conflict when issue starts after or equal to predecessor", () => {
    const relationMap = createRelationMap("issue-b", {
      start_after: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-08", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should detect FF conflict when issue finishes before predecessor finishes", () => {
    // Issue B has target_date=Jan 10, predecessor A has target_date=Jan 12 via finish_after
    // B should finish on or after Jan 12 — conflict!
    const relationMap = createRelationMap("issue-b", {
      finish_after: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-05", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: null, target_date: "2025-01-10" },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].predecessorIssueId).toBe("issue-a");
    expect(conflicts[0].relationType).toBe("finish_after");
    expect(conflicts[0].message).toContain("End date is before issue-a ends");
  });

  it("should not detect FF conflict when issue finishes after or equal to predecessor", () => {
    const relationMap = createRelationMap("issue-b", {
      finish_after: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-05", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: null, target_date: "2025-01-12" },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should not report conflict if predecessor has no dates", () => {
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: null, target_date: null },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should handle multiple predecessors with mixed conflict status", () => {
    // Issue C depends on A (FS, conflict) and B (FS, no conflict)
    const relationMap = createRelationMap("issue-c", {
      blocked_by: ["issue-a", "issue-b"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
      "issue-b": { start_date: "2025-01-01", target_date: "2025-01-05" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-c",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].predecessorIssueId).toBe("issue-a");
  });

  it("should report only relevant conflicts for each relation type", () => {
    // Issue D has FS, SS, and FF relations with different predecessors
    // All predecessors finish/start on 2025-01-12
    const relationMap = createRelationMap("issue-d", {
      blocked_by: ["issue-a"],
      start_after: ["issue-b"],
      finish_after: ["issue-c"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
      "issue-b": { start_date: "2025-01-12", target_date: "2025-01-15" },
      "issue-c": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-d",
      { start_date: "2025-01-10", target_date: "2025-01-10" },
      relationMap,
      getIssueDates
    );

    // Issue-d: start=2025-01-10, target=2025-01-10
    // blocked_by issue-a (target=2025-01-12): start (2025-01-10) < target+1 (2025-01-13) = conflict
    // start_after issue-b (start=2025-01-12): start (2025-01-10) < start (2025-01-12) = conflict
    // finish_after issue-c (target=2025-01-12): target (2025-01-10) < target (2025-01-12) = conflict
    expect(conflicts).toHaveLength(3);
    expect(conflicts.map((c) => c.relationType)).toEqual(
      expect.arrayContaining(["blocked_by", "start_after", "finish_after"])
    );
  });

  it("should not block issue updates — conflicts are advisory only (AC7.5)", () => {
    // This test verifies the function returns conflicts without rejecting or throwing
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflictingDates = { start_date: "2025-01-10", target_date: null };

    // Should not throw
    const conflicts = detectDependencyConflicts("issue-b", conflictingDates, relationMap, getIssueDates);

    // Should return conflicts array
    expect(Array.isArray(conflicts)).toBe(true);
    expect(conflicts.length).toBeGreaterThan(0);

    // Function does not block or reject — purely advisory
    expect(() => {
      detectDependencyConflicts("issue-b", conflictingDates, relationMap, getIssueDates);
    }).not.toThrow();
  });

  it("should return empty array when issue has no relations", () => {
    const relationMap = createRelationMap("issue-b", {});
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should return empty array when issue not in relation map", () => {
    const relationMap: TIssueRelationMap = {};
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts).toEqual([]);
  });

  it("should include predecessor issue ID and relation type in conflict messages", () => {
    const relationMap = createRelationMap("issue-b", {
      blocked_by: ["issue-a"],
    });
    const getIssueDates = getIssueDatesFactory({
      "issue-a": { start_date: "2025-01-08", target_date: "2025-01-12" },
    });

    const conflicts = detectDependencyConflicts(
      "issue-b",
      { start_date: "2025-01-10", target_date: null },
      relationMap,
      getIssueDates
    );

    expect(conflicts[0].message).toContain("issue-a");
    expect(conflicts[0].message).toContain("blocking");
  });
});
