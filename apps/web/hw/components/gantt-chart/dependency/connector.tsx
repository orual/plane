/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import type { IGanttBlock, TIssueRelationTypes } from "@plane/types";
import { BLOCK_HEIGHT } from "@/components/gantt-chart/constants";
import {
  calculateConnectorPath,
  getConnectorEndpoints,
  getConnectorStyle,
  getRelationLabel,
} from "@/plane-web/helpers/dependency-path-calculator";
import type { BlockRect } from "@/plane-web/helpers/dependency-path-calculator";

type ConnectorProps = {
  sourceBlock: IGanttBlock;
  targetBlock: IGanttBlock;
  sourceRowIndex: number;
  targetRowIndex: number;
  relationType: TIssueRelationTypes;
};

const TOOLTIP_PAD_X = 8;
const TOOLTIP_PAD_Y = 5;
const CURSOR_OFFSET_X = 8;
const CURSOR_OFFSET_Y = -22;
const TOOLTIP_FONT_SIZE = 11;
const TOOLTIP_LINE_HEIGHT = 14;
const TOOLTIP_FONT_BOLD = `600 ${TOOLTIP_FONT_SIZE}px system-ui, sans-serif`;
const TOOLTIP_FONT_MEDIUM = `500 ${TOOLTIP_FONT_SIZE}px system-ui, sans-serif`;
const TSPAN_GAP = 4;

let measureCtx: CanvasRenderingContext2D | null = null;

function getTextWidth(text: string, font: string): number {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/**
 * Individual dependency connector with hover tooltip.
 *
 * Renders:
 * - A transparent wide stroke for mouse hit detection
 * - The visible styled path with arrowhead marker
 * - A tooltip following the cursor showing "source · relation · target"
 *
 * Text width is measured synchronously via canvas to avoid a two-pass
 * render cycle (getBBox approach caused noticeable lag).
 *
 * Returns null if either block lacks position data.
 */
export const Connector = observer(function Connector({
  sourceBlock,
  targetBlock,
  sourceRowIndex,
  targetRowIndex,
  relationType,
}: ConnectorProps) {
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, viewRight: Infinity });

  if (!sourceBlock.position || !targetBlock.position) {
    return null;
  }

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

  const { sourceEndpoint, targetEndpoint } = getConnectorEndpoints(relationType);
  const connectorStyle = getConnectorStyle(relationType);
  const connectorPath = calculateConnectorPath(sourceBlockRect, targetBlockRect, sourceEndpoint, targetEndpoint);

  const sourceName = sourceBlock.name || sourceBlock.id;
  const targetName = targetBlock.name || targetBlock.id;
  const label = getRelationLabel(relationType);

  const handleMouseMove = (e: React.MouseEvent<SVGGElement>) => {
    const svg = e.currentTarget.closest("svg");
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(inv);

    // Visible right edge in SVG coordinates
    const rPt = svg.createSVGPoint();
    rPt.x = window.innerWidth;
    rPt.y = 0;
    const svgViewRight = rPt.matrixTransform(inv).x;

    setMousePos({ x: svgPt.x, y: svgPt.y, viewRight: svgViewRight });
  };

  // Measure text width synchronously via canvas (no second render pass)
  const sourceW = getTextWidth(sourceName, TOOLTIP_FONT_MEDIUM);
  const labelW = getTextWidth(label, TOOLTIP_FONT_BOLD);
  const targetW = getTextWidth(targetName, TOOLTIP_FONT_MEDIUM);
  const textWidth = sourceW + TSPAN_GAP + labelW + TSPAN_GAP + targetW;
  const boxW = textWidth + TOOLTIP_PAD_X * 2;
  const boxH = TOOLTIP_LINE_HEIGHT + TOOLTIP_PAD_Y * 2;

  // Tooltip above-right of cursor, flipped if it would overflow viewport
  let tooltipX = mousePos.x + CURSOR_OFFSET_X;
  let tooltipY = mousePos.y + CURSOR_OFFSET_Y;

  if (tooltipX + boxW > mousePos.viewRight) {
    tooltipX = mousePos.x - CURSOR_OFFSET_X - boxW;
  }
  if (tooltipY < 0) {
    tooltipY = mousePos.y + 14;
  }

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
      style={{ pointerEvents: "auto" }}
    >
      {/* Wide transparent stroke for hover hit detection */}
      <path d={connectorPath.d} stroke="transparent" strokeWidth="12" fill="none" style={{ cursor: "default" }} />
      {/* Visible connector path */}
      <path
        d={connectorPath.d}
        stroke={hovered ? "var(--text-color-primary)" : connectorStyle.stroke}
        strokeDasharray={connectorStyle.strokeDasharray}
        strokeWidth={hovered ? "2" : "1.5"}
        fill="none"
        markerEnd="url(#dep-arrowhead)"
      />
      {hovered && (
        <g>
          <rect
            x={tooltipX}
            y={tooltipY}
            width={boxW}
            height={boxH}
            rx={6}
            fill="var(--background-surface-primary)"
            stroke={connectorStyle.stroke}
            strokeWidth="1"
            filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))"
          />
          <text
            x={tooltipX + TOOLTIP_PAD_X}
            y={tooltipY + TOOLTIP_PAD_Y + TOOLTIP_LINE_HEIGHT * 0.78}
            fontSize={TOOLTIP_FONT_SIZE}
            fontFamily="system-ui, sans-serif"
          >
            <tspan fill="var(--text-color-primary)" fontWeight="500">
              {sourceName}
            </tspan>
            <tspan dx={TSPAN_GAP} fill={connectorStyle.stroke} fontWeight="600">
              {label}
            </tspan>
            <tspan dx={TSPAN_GAP} fill="var(--text-color-primary)" fontWeight="500">
              {targetName}
            </tspan>
          </text>
        </g>
      )}
    </g>
  );
});
