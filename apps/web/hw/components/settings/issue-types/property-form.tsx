/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { X } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/propel/button";
// ui
import { Input } from "@plane/ui";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { IIssuePropertyDefinition, TPropertyType } from "@/plane-web/types/issue-property-definitions";

const PROPERTY_TYPES: TPropertyType[] = ["text", "number", "select", "multi_select", "url", "date", "boolean"];

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
  data?: IIssuePropertyDefinition | null;
  onSave: () => void;
  onCancel: () => void;
};

export const PropertyForm = observer(function PropertyForm(props: Props) {
  const { workspaceSlug, issueTypeId, data, onSave, onCancel } = props;
  // store hooks
  const { issuePropertyStore } = useRootStore();
  // i18n
  const { t } = useTranslation();
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    property_type: "text" as TPropertyType,
    is_required: false,
    options: [] as string[],
  });

  // Initialize form data when data prop changes
  useEffect(() => {
    if (data) {
      setFormData({
        name: data.name,
        property_type: data.property_type,
        is_required: data.is_required,
        options: [...data.options],
      });
    } else {
      setFormData({
        name: "",
        property_type: "text",
        is_required: false,
        options: [],
      });
    }
  }, [data]);

  const handleAddOption = () => {
    setFormData({
      ...formData,
      options: [...formData.options, ""],
    });
  };

  const handleRemoveOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  const handleUpdateOption = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({
      ...formData,
      options: newOptions,
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_settings.settings.issue_types.property_name_required"),
      });
      return;
    }

    // Validate options for select/multi_select
    if (
      (formData.property_type === "select" || formData.property_type === "multi_select") &&
      formData.options.length === 0
    ) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_settings.settings.issue_types.property_options_required"),
      });
      return;
    }

    // Filter out empty options
    const cleanedOptions = formData.options.filter((opt) => opt.trim() !== "");

    setIsSubmitting(true);

    const performSubmit = async () => {
      try {
        if (data?.id) {
          // Edit mode
          await issuePropertyStore.updateDefinition(workspaceSlug, data.id, {
            name: formData.name,
            property_type: formData.property_type,
            is_required: formData.is_required,
            options: cleanedOptions,
          });
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("workspace_settings.settings.issue_types.property_updated"),
            message: "",
          });
        } else {
          // Create mode
          await issuePropertyStore.createDefinition(workspaceSlug, {
            name: formData.name,
            property_type: formData.property_type,
            is_required: formData.is_required,
            options: cleanedOptions,
            issue_type_id: issueTypeId,
          });
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("workspace_settings.settings.issue_types.property_created"),
            message: "",
          });
        }
        onSave();
      } catch (error) {
        setIsSubmitting(false);
        const errorMessage =
          error instanceof Error ? error.message : t("workspace_settings.settings.issue_types.property_save_error");
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: errorMessage,
        });
      }
    };

    void performSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-test="property-form"
      className="space-y-4 p-4 bg-surface-1 rounded-lg border border-subtle"
    >
      {/* Name input */}
      <div>
        <label htmlFor="property-name" className="mb-2 block text-secondary text-sm">
          {t("name")} <span className="text-red-500">*</span>
        </label>
        <Input
          id="property-name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter property name"
          disabled={isSubmitting}
          data-test="property-name-input"
          required
        />
      </div>

      {/* Property type dropdown */}
      <div>
        <label htmlFor="property-type" className="mb-2 block text-secondary text-sm">
          {t("workspace_settings.settings.issue_types.type")} <span className="text-red-500">*</span>
        </label>
        <select
          id="property-type"
          value={formData.property_type}
          onChange={(e) =>
            setFormData({
              ...formData,
              property_type: e.target.value as TPropertyType,
              options: [], // Reset options when type changes
            })
          }
          disabled={isSubmitting}
          data-test="property-type-select"
          className="w-full px-3 py-2 border border-subtle rounded-md bg-surface-0 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary"
        >
          {PROPERTY_TYPES.map((type) => (
            <option key={type} value={type}>
              {PROPERTY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      {/* Is required checkbox */}
      <div className="flex items-center gap-2">
        <input
          id="is-required"
          type="checkbox"
          checked={formData.is_required}
          onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
          disabled={isSubmitting}
          className="cursor-pointer"
        />
        <label htmlFor="is-required" className="text-secondary text-sm">
          {t("workspace_settings.settings.issue_types.required")}
        </label>
      </div>

      {/* Options section (conditional for select/multi_select) */}
      {(formData.property_type === "select" || formData.property_type === "multi_select") && (
        <div>
          <div className="mb-2 block text-secondary text-sm">
            {t("workspace_settings.settings.issue_types.options")} <span className="text-red-500">*</span>
          </div>
          <div className="space-y-2">
            {formData.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  id={`option-${index}`}
                  type="text"
                  value={option}
                  onChange={(e) => handleUpdateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  disabled={isSubmitting}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(index)}
                  disabled={isSubmitting}
                  className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors"
                  aria-label="Remove option"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddOption}
              disabled={isSubmitting}
              className="mt-2 text-sm text-accent-primary hover:text-accent-primary/80 font-medium"
            >
              + {t("workspace_settings.settings.issue_types.add_option")}
            </button>
          </div>
        </div>
      )}

      {/* Button row */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting} size="sm">
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          type="submit"
          disabled={isSubmitting}
          loading={isSubmitting}
          data-test="property-form-submit"
          size="sm"
        >
          {isSubmitting
            ? t("saving")
            : data?.id
              ? t("workspace_settings.settings.issue_types.update_property")
              : t("workspace_settings.settings.issue_types.create_property")}
        </Button>
      </div>
    </form>
  );
});
