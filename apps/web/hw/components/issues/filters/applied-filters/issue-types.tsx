/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// store hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// icons
import { CloseIcon } from "@plane/propel/icons";

type Props = {
  handleRemove: (val: string) => void;
  values: string[];
  editable: boolean | undefined;
};

export const AppliedIssueTypeFilters = observer(function AppliedIssueTypeFilters(props: Props) {
  const { values, handleRemove, editable } = props;

  // store
  const { issueTypeStore } = useRootStore();

  return (
    <>
      {values.map((issueTypeId) => {
        const issueType = issueTypeStore.getIssueTypeById(issueTypeId);

        if (!issueType) return null;

        return (
          <div key={issueTypeId} className="flex items-center gap-1 rounded-sm bg-layer-1 p-1 text-11">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: issueType.logo_props.color,
              }}
            />
            <span className="normal-case">{issueType.name}</span>
            {editable && (
              <button
                type="button"
                className="grid place-items-center text-tertiary hover:text-secondary"
                onClick={() => handleRemove(issueTypeId)}
              >
                <CloseIcon height={10} width={10} strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
});
