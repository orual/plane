/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ArrowRightToLine, ArrowLeftToLine, CircleDot, XCircle, Wrench, Puzzle } from "lucide-react";
import { RelatedIcon, DuplicatePropertyIcon } from "@plane/propel/icons";
import type { TRelationObject } from "@/components/issues/issue-detail-widgets/relations";
import type { TIssueRelationTypes } from "../../types";

// eslint-disable-next-line react-refresh/only-export-components
export * from "./activity";

export const ISSUE_RELATION_OPTIONS: Record<TIssueRelationTypes, TRelationObject> = {
  relates_to: {
    key: "relates_to",
    i18n_label: "issue.relation.relates_to",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <RelatedIcon height={size} width={size} className="text-secondary" />,
    placeholder: "Add related work items",
  },
  duplicate: {
    key: "duplicate",
    i18n_label: "issue.relation.duplicate",
    className: "bg-layer-1 text-secondary",
    icon: (size) => <DuplicatePropertyIcon width={size} height={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocked_by: {
    key: "blocked_by",
    i18n_label: "issue.relation.blocked_by",
    className: "bg-danger-subtle text-danger-primary",
    icon: (size) => <CircleDot size={size} className="text-secondary" />,
    placeholder: "None",
  },
  blocking: {
    key: "blocking",
    i18n_label: "issue.relation.blocking",
    className: "bg-yellow-500/20 text-yellow-700",
    icon: (size) => <XCircle size={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_before: {
    key: "start_before",
    i18n_label: "issue.relation.start_before",
    className: "bg-blue-500/20 text-blue-700",
    icon: (size) => <ArrowRightToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  start_after: {
    key: "start_after",
    i18n_label: "issue.relation.start_after",
    className: "bg-blue-500/20 text-blue-700",
    icon: (size) => <ArrowLeftToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_before: {
    key: "finish_before",
    i18n_label: "issue.relation.finish_before",
    className: "bg-purple-500/20 text-purple-700",
    icon: (size) => <ArrowRightToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  finish_after: {
    key: "finish_after",
    i18n_label: "issue.relation.finish_after",
    className: "bg-purple-500/20 text-purple-700",
    icon: (size) => <ArrowLeftToLine size={size} className="text-secondary" />,
    placeholder: "None",
  },
  implemented_by: {
    key: "implemented_by",
    i18n_label: "issue.relation.implemented_by",
    className: "bg-green-500/20 text-green-700",
    icon: (size) => <Wrench size={size} className="text-secondary" />,
    placeholder: "None",
  },
  implements: {
    key: "implements",
    i18n_label: "issue.relation.implements",
    className: "bg-green-500/20 text-green-700",
    icon: (size) => <Puzzle size={size} className="text-secondary" />,
    placeholder: "None",
  },
};

export type TRelationGroupKey = "scheduling" | "structural" | "other";

export const RELATION_GROUPS: { key: TRelationGroupKey; i18n_label: string; types: TIssueRelationTypes[] }[] = [
  {
    key: "scheduling",
    i18n_label: "issue.relation.group.scheduling",
    types: ["blocking", "blocked_by", "start_before", "start_after", "finish_before", "finish_after"],
  },
  {
    key: "structural",
    i18n_label: "issue.relation.group.structural",
    types: ["implemented_by", "implements"],
  },
  {
    key: "other",
    i18n_label: "issue.relation.group.other",
    types: ["relates_to", "duplicate"],
  },
];

export const useTimeLineRelationOptions = () => ISSUE_RELATION_OPTIONS;
