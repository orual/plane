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
 * Scheduling relation types that should render as connectors.
 * Non-scheduling relations (relates_to, duplicate) are excluded.
 */
const SCHEDULING_TYPES: TIssueRelationTypes[] = [
  "blocking",
  "blocked_by",
  "start_before",
  "start_after",
  "finish_before",
  "finish_after",
  "implemented_by",
  "implements",
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

  // Iterate through all blocks to find scheduling relations
  for (const blockId of blockIds) {
    const blockRelations = relationMap[blockId];
    if (!blockRelations) continue;

    for (const relationType of SCHEDULING_TYPES) {
      const relatedBlockIds = blockRelations[relationType];
      if (!relatedBlockIds || relatedBlockIds.length === 0) continue;

      for (const relatedBlockId of relatedBlockIds) {
        // Only render if both source and target blocks are in the visible list
        const sourceRowIndex = blockIds.indexOf(blockId);
        const targetRowIndex = blockIds.indexOf(relatedBlockId);

        if (sourceRowIndex === -1 || targetRowIndex === -1) continue;

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
