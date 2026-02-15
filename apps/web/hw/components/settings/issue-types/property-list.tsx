/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { EllipsisVertical } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/propel/button";
// components
import { PropertyForm } from "./property-form";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { IIssuePropertyDefinition, TPropertyType } from "@/plane-web/types/issue-property-definitions";

// Property type label mapping
const PROPERTY_TYPE_LABELS: Record<TPropertyType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi Select",
  url: "URL",
  date: "Date",
  boolean: "Boolean",
};

type Props = {
  workspaceSlug: string;
  issueTypeId: string;
  properties: IIssuePropertyDefinition[];
  isAdmin: boolean;
};

export const PropertyList = observer(function PropertyList(props: Props) {
  const { workspaceSlug, issueTypeId, properties, isAdmin } = props;
  // store hooks
  const { issuePropertyStore } = useRootStore();
  // i18n
  const { t } = useTranslation();
  // states
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = (propertyId: string) => {
    const performDelete = async () => {
      try {
        await issuePropertyStore.deleteDefinition(workspaceSlug, propertyId);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("workspace_settings.settings.issue_types.property_deleted"),
          message: "",
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t("workspace_settings.settings.issue_types.property_delete_error");
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: errorMessage,
        });
      }
    };

    void performDelete();
  };

  return (
    <div data-test="property-list" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-h5-medium text-primary">
          {t("workspace_settings.settings.issue_types.properties")} ({properties.length})
        </h4>
        {isAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setIsCreating(true)} data-test="property-add-btn">
            {t("workspace_settings.settings.issue_types.add_property")}
          </Button>
        )}
      </div>

      {/* Create form */}
      {isCreating && (
        <PropertyForm
          workspaceSlug={workspaceSlug}
          issueTypeId={issueTypeId}
          onSave={() => setIsCreating(false)}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {/* Property list or empty state */}
      {properties.length > 0 ? (
        <div className="space-y-2">
          {properties.map((property) => (
            <div key={property.id}>
              {editingPropertyId === property.id ? (
                <PropertyForm
                  workspaceSlug={workspaceSlug}
                  issueTypeId={issueTypeId}
                  data={property}
                  onSave={() => setEditingPropertyId(null)}
                  onCancel={() => setEditingPropertyId(null)}
                />
              ) : (
                <PropertyRow
                  property={property}
                  isAdmin={isAdmin}
                  onEdit={() => setEditingPropertyId(property.id)}
                  onDelete={() => handleDelete(property.id)}
                  t={t}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-tertiary text-sm">
          {isCreating ? null : t("workspace_settings.settings.issue_types.no_properties")}
        </div>
      )}
    </div>
  );
});

type PropertyRowProps = {
  property: IIssuePropertyDefinition;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string) => string;
};

function PropertyRow(props: PropertyRowProps) {
  const { property, isAdmin, onEdit, onDelete, t } = props;
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
    <div
      data-test="property-item"
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-subtle bg-surface-1 hover:bg-surface-2 transition-colors"
    >
      {/* Property details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-primary truncate">{property.name}</span>
          {property.is_required && <span className="text-xs text-red-500 font-semibold">*</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-secondary">
            {PROPERTY_TYPE_LABELS[property.property_type]}
          </span>
          {property.options.length > 0 && (
            <span className="text-xs text-tertiary">
              {property.options.length} option{property.options.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Kebab menu */}
      {isAdmin && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-1.5 hover:bg-surface-3 rounded transition-colors"
            title="Actions"
            aria-label="Property actions"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <EllipsisVertical className="h-4 w-4 text-secondary" />
          </button>

          {isMenuOpen && (
            <div
              className="absolute right-0 mt-1 bg-surface-0 border border-subtle rounded-md shadow-lg z-10 min-w-max"
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
                {t("edit")}
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
                {t("delete")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
