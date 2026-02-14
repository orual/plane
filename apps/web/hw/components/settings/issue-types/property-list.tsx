/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { EllipsisVertical } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/propel/button";
// components
import { PropertyForm } from "./property-form";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { IIssuePropertyDefinition } from "@/plane-web/types/issue-property-definitions";

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
  // states
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = (propertyId: string) => {
    const performDelete = async () => {
      try {
        await issuePropertyStore.deleteDefinition(workspaceSlug, propertyId);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success",
          message: "Property deleted successfully",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to delete property";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error",
          message: errorMessage,
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    performDelete();
  };

  return (
    <div data-test="property-list" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-h5-medium text-primary">Properties ({properties.length})</h4>
        {isAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setIsCreating(true)} data-test="property-add-btn">
            Add property
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
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-tertiary text-sm">
          {isCreating ? null : "No properties defined for this type."}
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
};

function PropertyRow(props: PropertyRowProps) {
  const { property, isAdmin, onEdit, onDelete } = props;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 text-secondary">{property.property_type}</span>
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
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className="absolute right-0 mt-1 bg-surface-0 border border-subtle rounded-md shadow-lg z-10 min-w-max"
              onClick={(e) => {
                e.stopPropagation();
              }}
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
  );
}
