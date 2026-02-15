/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueRelationTypes, IGanttBlock } from "@plane/types";

/**
 * A dependency relationship that is visible (both endpoints have position data and are in the visible block list).
 */
export interface VisibleDependency {
  sourceBlockId: string;
  targetBlockId: string;
  sourceRowIndex: number;
  targetRowIndex: number;
  relationType: TIssueRelationTypes;
}

/**
 * Forward scheduling relation types that should render as connectors.
 * Only the "forward" direction of each pair is included to avoid
 * rendering duplicate paths. The relation store keeps both sides
 * (e.g., A.blocking=[B] and B.blocked_by=[A]), so we only render
 * from the predecessor's perspective.
 */
const FORWARD_SCHEDULING_TYPES: TIssueRelationTypes[] = [
  "blocking", // FS: source blocks target
  "start_before", // SS: source starts before target
  "finish_before", // FF: source finishes before target
  "implements", // structural FS: source implements target
];

/**
 * Filters dependencies to only those that should be rendered as connectors.
 *
 * Criteria for inclusion:
 * - Relation type is a scheduling type (not relates_to or duplicate)
 * - Both source and target blocks are in the visible block list (blockIds)
 * - Both blocks have position data (i.e., have start_date and target_date)
 *
 * @param blockIds - Array of visible block IDs in the current view
 * @param blocksMap - Map of block ID to block data (includes position info)
 * @param relationMap - Map of issue ID to its relations (by type)
 * @returns Array of visible dependencies that should be rendered
 */
export function filterVisibleDependencies(
  blockIds: string[],
  blocksMap: Record<string, IGanttBlock>,
  relationMap: Record<string, Record<TIssueRelationTypes, string[]>>
): VisibleDependency[] {
  const visibleDependencies: VisibleDependency[] = [];

  // Pre-compute a map from blockId to its row index for O(1) lookup (fixes issue I1)
  const blockIdToRowIndex = new Map<string, number>();
  for (let i = 0; i < blockIds.length; i++) {
    blockIdToRowIndex.set(blockIds[i], i);
  }

  // Iterate through all blocks to find scheduling relations
  for (let i = 0; i < blockIds.length; i++) {
    const blockId = blockIds[i];
    const sourceRowIndex = i;
    const blockRelations = relationMap[blockId];
    if (!blockRelations) continue;

    for (const relationType of FORWARD_SCHEDULING_TYPES) {
      const relatedBlockIds = blockRelations[relationType];
      if (!relatedBlockIds || relatedBlockIds.length === 0) continue;

      for (const relatedBlockId of relatedBlockIds) {
        // Only render if both source and target blocks are in the visible list
        // Use Map.get() for O(1) lookup instead of Array.indexOf() (was O(n))
        const targetRowIndex = blockIdToRowIndex.get(relatedBlockId);

        // Target must be in visible list; source is guaranteed by outer loop (fixes issue M1)
        if (targetRowIndex === undefined) continue;

        const sourceBlock = blocksMap[blockId];
        const targetBlock = blocksMap[relatedBlockId];

        // Skip if either block is missing or lacks position data
        if (!sourceBlock || !targetBlock || !sourceBlock.position || !targetBlock.position) continue;

        // Add to visible dependencies
        visibleDependencies.push({
          sourceBlockId: blockId,
          targetBlockId: relatedBlockId,
          sourceRowIndex,
          targetRowIndex,
          relationType,
        });
      }
    }
  }

  return visibleDependencies;
}
