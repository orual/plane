/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
// components
import { PropertyList } from "./property-list";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";

type Props = {
  workspaceSlug: string;
  issueType: TIssueType;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
};

export const IssueTypeSidePanel = observer(function IssueTypeSidePanel(props: Props) {
  const { workspaceSlug, issueType, isAdmin, onClose, onEdit } = props;
  // store hooks
  const { issuePropertyStore } = useRootStore();
  // states
  const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(false);

  // Fetch property definitions on mount
  useEffect(() => {
    const fetchDefinitions = async () => {
      try {
        setIsLoadingDefinitions(true);
        await issuePropertyStore.fetchDefinitions(workspaceSlug);
      } finally {
        setIsLoadingDefinitions(false);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchDefinitions();
  }, [workspaceSlug, issuePropertyStore]);

  // Filter properties for this issue type
  const properties = issuePropertyStore.getAllDefinitions().filter((def) => def.issue_type_id === issueType.id);

  return (
    <div
      data-test="issue-type-side-panel"
      className="w-[400px] shrink-0 border-l border-subtle bg-surface-0 flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-subtle flex-shrink-0">
        <div className="flex-1 min-w-0">
          {/* Type name with color dot */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="h-4 w-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: issueType.logo_props?.color ?? "#6366f1" }}
            />
            <h3 className="text-h4-medium text-primary truncate">{issueType.name}</h3>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {issueType.is_default && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary">Default</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-secondary">
              {issueType.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-surface-1 rounded transition-colors flex-shrink-0"
          title="Close panel"
          aria-label="Close panel"
        >
          <X className="h-5 w-5 text-secondary" />
        </button>
      </div>

      {/* Description and action */}
      <div className="px-5 py-4 border-b border-subtle flex-shrink-0">
        {issueType.description && <p className="text-sm text-secondary mb-3">{issueType.description}</p>}
        {isAdmin && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit type
          </Button>
        )}
      </div>

      {/* Property list */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoadingDefinitions ? (
          <div className="text-center py-4 text-tertiary text-sm">Loading properties...</div>
        ) : (
          <PropertyList
            workspaceSlug={workspaceSlug}
            issueTypeId={issueType.id}
            properties={properties}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
});
