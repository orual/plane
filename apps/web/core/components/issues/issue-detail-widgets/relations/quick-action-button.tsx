/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
// plane imports
import type { TIssueServiceType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// Plane-web
import { useTimeLineRelationOptions, RELATION_GROUPS } from "@/plane-web/components/relations";
import type { TIssueRelationTypes } from "@/plane-web/types";

type Props = {
  issueId: string;
  customButton?: React.ReactNode;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const RelationActionButton = observer(function RelationActionButton(props: Props) {
  const { customButton, issueId, disabled = false, issueServiceType } = props;
  const { t } = useTranslation();
  // store hooks
  const { toggleRelationModal, setRelationKey } = useIssueDetail(issueServiceType);

  const ISSUE_RELATION_OPTIONS = useTimeLineRelationOptions();

  // handlers
  const handleOnClick = (relationKey: TIssueRelationTypes) => {
    setRelationKey(relationKey);
    toggleRelationModal(issueId, relationKey);
  };

  // button element
  const customButtonElement = customButton ? <>{customButton}</> : <PlusIcon className="h-4 w-4" />;

  return (
    <CustomMenu
      customButton={customButtonElement}
      placement="bottom-start"
      disabled={disabled}
      maxHeight="lg"
      closeOnSelect
    >
      {RELATION_GROUPS.map((group) => (
        <div key={group.key}>
          <CustomMenu.MenuItem className="cursor-default" disabled>
            <div className="text-xs font-semibold text-secondary">{t(group.i18n_label)}</div>
          </CustomMenu.MenuItem>
          {group.types.map((type) => {
            const item = ISSUE_RELATION_OPTIONS[type];
            if (!item) return null;

            return (
              <CustomMenu.MenuItem
                key={type}
                onClick={() => {
                  handleOnClick(item.key);
                }}
              >
                <div className="flex items-center gap-2">
                  {item.icon(12)}
                  <span>{t(item.i18n_label)}</span>
                </div>
              </CustomMenu.MenuItem>
            );
          })}
        </div>
      ))}
    </CustomMenu>
  );
});
