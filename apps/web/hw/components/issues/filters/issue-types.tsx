/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useMemo } from "react";
import { observer } from "mobx-react";
// store hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// plane imports
import { Checkbox } from "@plane/ui";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string) => void;
  searchQuery: string;
};

export const FilterIssueTypes = observer(function FilterIssueTypes(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;

  // store
  const {
    workspaceRoot: { currentWorkspace },
    issueTypeStore,
  } = useRootStore();

  // state
  const [previewEnabled, setPreviewEnabled] = useState(true);

  // derived values
  const workspaceSlug = currentWorkspace?.slug;
  const issueTypes = useMemo(
    () => (workspaceSlug ? issueTypeStore.getWorkspaceIssueTypes(workspaceSlug) : []),
    [issueTypeStore, workspaceSlug]
  );

  const filteredIssueTypes = useMemo(
    () =>
      issueTypes.filter((issueType: (typeof issueTypes)[number]) =>
        issueType.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [issueTypes, searchQuery]
  );

  if (!previewEnabled) {
    return (
      <div className="flex items-center justify-center h-20 px-4">
        <button
          onClick={() => setPreviewEnabled(true)}
          className="text-sm text-blue-500 hover:text-blue-600"
          type="button"
        >
          Show filters
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-gray-900">Issue types</h4>
        <button
          onClick={() => setPreviewEnabled(false)}
          className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          type="button"
        >
          Hide
        </button>
      </div>

      {filteredIssueTypes.length === 0 ? (
        <p className="text-xs text-gray-500">No issue types found</p>
      ) : (
        <div className="space-y-2">
          {filteredIssueTypes.map((issueType) => (
            <div key={issueType.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
              <Checkbox
                checked={appliedFilters?.includes(issueType.id) ?? false}
                onChange={() => handleUpdate(issueType.id)}
              />
              <div className="flex items-center gap-2 flex-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: issueType.logo_props.color }} />
                <span className="text-sm text-gray-700">{issueType.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
