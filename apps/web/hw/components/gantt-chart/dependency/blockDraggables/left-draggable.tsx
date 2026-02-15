/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import type { RefObject } from "react";
import type { IGanttBlock } from "@plane/types";
// hooks
import { useDependencyDrag } from "./use-dependency-drag";

type LeftDependencyDraggableProps = {
  block: IGanttBlock;
  ganttContainerRef: RefObject<HTMLDivElement>;
};

export const LeftDependencyDraggable = observer(function LeftDependencyDraggable(props: LeftDependencyDraggableProps) {
  const { block, ganttContainerRef } = props;
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useDependencyDrag(block, ganttContainerRef, "left");

  return (
    <div
      ref={handleRef}
      role="button"
      tabIndex={0}
      className="group-hover:opacity-100 absolute h-2 w-2 rounded-full bg-accent-primary opacity-0 cursor-crosshair"
      style={{
        left: "-4px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleMouseDown(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
    />
  );
});
