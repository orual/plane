/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { memo } from "react";
import type { IGanttBlock, TIssueRelationTypes } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import {
  calculateConnectorPath,
  getConnectorEndpoints,
  getConnectorStyle
  
} from "@/plane-web/helpers/dependency-path-calculator";
import type {BlockRect} from "@/plane-web/helpers/dependency-path-calculator";

type ConnectorProps = {
  sourceBlock: IGanttBlock;
  targetBlock: IGanttBlock;
  sourceRowIndex: number;
  targetRowIndex: number;
  relationType: TIssueRelationTypes;
};

/**
 * Individual dependency connector component that renders a single SVG path element.
 *
 * Renders a right-angle connector line between two gantt blocks with appropriate
 * styling (solid for blocking, dashed for temporal) and an arrowhead marker.
 *
 * Returns null if either block lacks position data (no dates).
 */
export const Connector = memo(function Connector({
  sourceBlock,
  targetBlock,
  sourceRowIndex,
  targetRowIndex,
  relationType,
}: ConnectorProps) {
  // Verify both blocks have position data
  if (!sourceBlock.position || !targetBlock.position) {
    return null;
  }

  // Build BlockRect objects from block positions and row indices
  const sourceBlockRect: BlockRect = {
    left: sourceBlock.position.marginLeft,
    width: sourceBlock.position.width,
    top: sourceRowIndex * BLOCK_HEIGHT,
    height: BLOCK_HEIGHT,
  };

  const targetBlockRect: BlockRect = {
    left: targetBlock.position.marginLeft,
    width: targetBlock.position.width,
    top: targetRowIndex * BLOCK_HEIGHT,
    height: BLOCK_HEIGHT,
  };

  // Get connector endpoints and style for this relation type
  const { sourceEndpoint, targetEndpoint } = getConnectorEndpoints(relationType);
  const connectorStyle = getConnectorStyle(relationType);

  // Calculate the SVG path
  const connectorPath = calculateConnectorPath(sourceBlockRect, targetBlockRect, sourceEndpoint, targetEndpoint);

  return (
    <path
      d={connectorPath.d}
      stroke={connectorStyle.stroke}
      strokeDasharray={connectorStyle.strokeDasharray}
      strokeWidth="1.5"
      fill="none"
      markerEnd="url(#dep-arrowhead)"
    />
  );
});
