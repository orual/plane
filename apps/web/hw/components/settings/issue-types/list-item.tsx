/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { EllipsisVertical } from "lucide-react";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";
// ui
import { cn } from "@plane/utils";

type Props = {
  issueType: TIssueType;
  isSelected: boolean;
  isAdmin: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export const IssueTypeListItem = function IssueTypeListItem(props: Props) {
  const { issueType, isSelected, isAdmin, onClick, onEdit, onDelete } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  return (
    <button
      data-test="issue-type-item"
      className={cn(
        "group relative flex w-full items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-none bg-transparent text-left",
        isSelected
          ? "bg-surface-2 border-l-2 border-accent-primary"
          : "border-l-2 border-transparent hover:bg-surface-1"
      )}
      onClick={onClick}
      type="button"
    >
      {/* Color dot */}
      <div
        className="h-3 w-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: issueType.logo_props?.color ?? "#6366f1" }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm text-primary truncate">{issueType.name}</h4>
        {issueType.description && <p className="text-xs text-tertiary truncate">{issueType.description}</p>}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {issueType.is_default && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary">Default</span>
        )}

        {/* Kebab menu */}
        {isAdmin && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="p-1.5 hover:bg-surface-2 rounded transition-colors opacity-0 group-hover:opacity-100"
              title="Actions"
              aria-label="Issue type actions"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              <EllipsisVertical className="h-4 w-4 text-secondary" />
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 mt-1 bg-surface-0 border border-subtle rounded-md shadow-lg z-10"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsMenuOpen(false);
                  }
                }}
                role="menu"
                tabIndex={-1}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onEdit();
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-surface-1 transition-colors first:rounded-t-md"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors last:rounded-b-md"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
};
