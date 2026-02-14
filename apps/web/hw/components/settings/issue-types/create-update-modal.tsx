/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button } from "@plane/propel/button";
// ui
import { ColorPicker, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useRootStore } from "@/hooks/store/use-root-store";
// types
import type { TIssueType } from "@/plane-web/types/issue-types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  data?: TIssueType | null;
};

export const CreateUpdateIssueTypeModal = observer(function CreateUpdateIssueTypeModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, data } = props;
  // store hooks
  const { issueTypeStore } = useRootStore();
  // states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    logo_props: { color: "#6366f1" },
    is_default: false,
  });

  // Initialize form data when data prop changes
  useEffect(() => {
    if (data) {
      setFormData({
        name: data.name,
        description: data.description,
        logo_props: { color: data.logo_props?.color ?? "#6366f1" },
        is_default: data.is_default,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        logo_props: { color: "#6366f1" },
        is_default: false,
      });
    }
  }, [data, isOpen]);

  const handleClose = () => {
    onClose();
    setIsSubmitting(false);
    setFormData({
      name: "",
      description: "",
      logo_props: { color: "#6366f1" },
      is_default: false,
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Issue type name is required",
      });
      return;
    }

    setIsSubmitting(true);

    const performSubmit = async () => {
      try {
        if (data?.id) {
          // Edit mode
          await issueTypeStore.updateIssueType(workspaceSlug, data.id, formData);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Success",
            message: "Issue type updated successfully",
          });
        } else {
          // Create mode
          await issueTypeStore.createIssueType(workspaceSlug, formData);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Success",
            message: "Issue type created successfully",
          });
        }
        handleClose();
      } catch (error) {
        setIsSubmitting(false);
        const errorMessage = error instanceof Error ? error.message : "Failed to save issue type";
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error",
          message: errorMessage,
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    performSubmit();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose}>
      <form onSubmit={handleSubmit} data-test="issue-type-form">
        <div className="space-y-5 p-5">
          <h3 className="text-h4-medium">{data?.id ? "Update issue type" : "Create issue type"}</h3>

          {/* Name input */}
          <div>
            <label htmlFor="name" className="mb-2 block text-secondary text-sm">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter issue type name"
              disabled={isSubmitting}
              data-test="issue-type-name-input"
              required
            />
          </div>

          {/* Description input */}
          <div>
            <label htmlFor="description" className="mb-2 block text-secondary text-sm">
              Description
            </label>
            <TextArea
              id="description"
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Enter issue type description"
              disabled={isSubmitting}
              data-test="issue-type-description-input"
              rows={3}
            />
          </div>

          {/* Color picker row */}
          <div>
            <label htmlFor="color-picker" className="mb-2 block text-secondary text-sm">
              Color
            </label>
            <div className="flex items-center gap-3">
              <div id="color-picker">
                <ColorPicker
                  value={formData.logo_props.color}
                  onChange={(color) => setFormData({ ...formData, logo_props: { color } })}
                />
              </div>
              <span className="text-sm text-tertiary">{formData.logo_props.color}</span>
            </div>
          </div>

          {/* Is default toggle */}
          <div className="flex items-center gap-3">
            <input
              id="is-default"
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              disabled={isSubmitting}
              className="cursor-pointer"
            />
            <label htmlFor="is-default" className="text-secondary text-sm">
              Make this the default issue type
            </label>
          </div>
        </div>

        {/* Button row */}
        <div className="flex justify-end gap-2 border-t border-subtle px-5 py-4">
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isSubmitting}
            loading={isSubmitting}
            data-test="issue-type-form-submit"
          >
            {isSubmitting ? "Saving..." : data?.id ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
