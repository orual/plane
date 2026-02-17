/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Send } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// types
import type { TAgentRunActivity } from "@/plane-web/types/agent";

export type TElicitationCardProps = {
  activity: TAgentRunActivity;
  onSubmit: (response: string) => Promise<void>;
};

export function ElicitationCard({ activity, onSubmit }: TElicitationCardProps) {
  const [response, setResponse] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metadata = activity.metadata;
  const question = (metadata?.question as string | undefined) || "Agent question";
  const inputType = (metadata?.input_type as string | undefined) || "text";
  const options = (metadata?.options as string[] | undefined) || [];

  const handleSubmit = () => {
    if (!response.trim()) return;

    setIsSubmitting(true);
    setError(null);
    void onSubmit(response)
      .then(() => {
        setIsSubmitted(true);
        return undefined;
      })
      .catch((err) => {
        console.error("Failed to submit elicitation response:", err);
        setError("Failed to submit response. Please try again.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleSelectOption = (option: string) => {
    setResponse(option);
    setError(null);
    setIsSubmitting(true);
    void onSubmit(option)
      .then(() => {
        setIsSubmitted(true);
        return undefined;
      })
      .catch((err) => {
        console.error("Failed to submit elicitation response:", err);
        setError("Failed to submit response. Please try again.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  if (isSubmitted) {
    return (
      <div className="border border-subtle rounded-lg p-4 bg-surface-1">
        <p className="text-13 font-medium text-primary mb-2">{question}</p>
        <div className="bg-layer-1 border border-subtle rounded px-3 py-2">
          <p className="text-13 text-secondary">{response}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-subtle rounded-lg p-4 bg-surface-1">
      <p className="text-13 font-medium text-primary mb-3">{question}</p>

      {inputType === "select" && options.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {options.map((option, index) => (
              <button
                key={`${index}-${option}`}
                onClick={() => {
                  handleSelectOption(option);
                }}
                disabled={isSubmitting}
                className={cn(
                  "px-3 py-1.5 rounded text-13 font-medium transition-colors",
                  response === option ? "bg-accent-primary text-white" : "bg-layer-1 text-secondary hover:bg-layer-2",
                  isSubmitting && "opacity-50 cursor-not-allowed"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {error && <p className="text-red-500 text-11 mt-2">{error}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={response}
              onChange={(e) => {
                setResponse(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
              placeholder="Type your response..."
              className={cn(
                "flex-1 px-3 py-2 rounded border",
                "bg-layer-1 border-subtle",
                "text-13 text-primary placeholder-tertiary",
                "focus:outline-none focus:ring-1 focus:ring-accent-primary",
                isSubmitting && "opacity-50 cursor-not-allowed"
              )}
            />
            <button
              onClick={handleSubmit}
              disabled={!response.trim() || isSubmitting}
              className={cn(
                "px-3 py-2 rounded transition-colors",
                response.trim() && !isSubmitting
                  ? "bg-accent-primary text-white hover:opacity-90"
                  : "bg-layer-2 text-tertiary cursor-not-allowed"
              )}
            >
              <Send size={16} />
            </button>
          </div>
          {error && <p className="text-red-500 text-11 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
