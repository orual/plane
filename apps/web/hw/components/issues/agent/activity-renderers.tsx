/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// components
import { MarkdownRenderer } from "@/components/ui/markdown-to-component";
// types
import type { TAgentRunActivity } from "@/plane-web/types/agent";

interface IActivityRendererProps {
  activity: TAgentRunActivity;
}

/**
 * ThoughtRenderer: Renders thought activities as muted italic text with optional expand toggle.
 * Thoughts are internal reasoning steps — visually subdued relative to other activity types.
 */
export function ThoughtRenderer({ activity }: IActivityRendererProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const maxLength = 150;
  const shouldTruncate = activity.content.length > maxLength;
  const displayText = isExpanded || !shouldTruncate ? activity.content : `${activity.content.slice(0, maxLength)}...`;

  return (
    <div className="pl-3">
      <p className="text-13 text-tertiary italic">{displayText}</p>
      {shouldTruncate && (
        <button onClick={() => setIsExpanded(!isExpanded)} className="text-11 text-accent-primary hover:underline mt-1">
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/**
 * ActionRenderer: Renders action activities as pill-shaped status chips.
 * Mirrors the label-activity-chip pattern used in the issue activity timeline.
 */
export function ActionRenderer({ activity }: IActivityRendererProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full",
        "border border-strong px-2.5 py-0.5",
        "text-11 font-medium text-primary bg-layer-1"
      )}
    >
      {activity.content}
    </span>
  );
}

/**
 * ErrorRenderer: Renders error activities as red alert banners with an icon.
 * Errors are visually prominent to ensure they are not missed.
 */
export function ErrorRenderer({ activity }: IActivityRendererProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger-subtle bg-danger-subtle px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-danger-primary" />
      <p className="text-13 text-danger-primary">{activity.content}</p>
    </div>
  );
}

/**
 * ResponseRenderer: Renders response activities as standard body text.
 */
export function ResponseRenderer({ activity }: IActivityRendererProps) {
  return (
    <div className="pl-3 text-13 text-secondary">
      <MarkdownRenderer markdown={activity.content} />
    </div>
  );
}
