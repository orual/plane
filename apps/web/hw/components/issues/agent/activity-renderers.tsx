/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { cn } from "@plane/utils";
// types
import type { TAgentRunActivity } from "@/plane-web/types/agent";

interface IActivityRendererProps {
  activity: TAgentRunActivity;
}

/**
 * ThoughtRenderer: Renders thought activities as muted text with optional expand toggle.
 * Thoughts are typically internal reasoning steps and should be displayed in a collapsed/muted state.
 */
export function ThoughtRenderer({ activity }: IActivityRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const maxLength = 150;
  const shouldTruncate = activity.content.length > maxLength;
  const displayText = isExpanded || !shouldTruncate ? activity.content : `${activity.content.slice(0, maxLength)}...`;

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <p className="text-sm text-custom-text-400 italic">{displayText}</p>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-custom-primary-100 hover:underline mt-1"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ActionRenderer: Renders action activities as status pills.
 * Actions represent agent operations and should be visually distinct.
 */
export function ActionRenderer({ activity }: IActivityRendererProps) {
  return (
    <div className="inline-flex">
      <span
        className={cn("px-3 py-1 text-sm font-medium rounded-full", "bg-custom-primary-100/20 text-custom-primary-100")}
      >
        {activity.content}
      </span>
    </div>
  );
}

/**
 * ErrorRenderer: Renders error activities as red alert banners.
 * Errors should be prominently displayed to alert the user.
 */
export function ErrorRenderer({ activity }: IActivityRendererProps) {
  return (
    <div className={cn("px-4 py-3 rounded-lg", "bg-red-500/10 border border-red-500/20", "text-red-500 text-sm")}>
      {activity.content}
    </div>
  );
}

/**
 * ResponseRenderer: Renders response activities as normal text.
 * Responses typically show agent's outputs and should render as plain text.
 */
export function ResponseRenderer({ activity }: IActivityRendererProps) {
  return <p className="text-sm text-custom-text-200">{activity.content}</p>;
}
