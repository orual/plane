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

/**
 * ElicitationCard: Renders an elicitation activity as an interactive card.
 * Supports text input and select (multiple choice) input types.
 * Shows the agent's question and allows the user to respond.
 */
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

  // After submission, show the submitted response
  if (isSubmitted) {
    return (
      <div className={cn("border rounded-lg p-4", "bg-custom-background-90 border-custom-border-200")}>
        <p className="text-sm font-medium text-custom-text-100 mb-2">{question}</p>
        <div className="bg-custom-background-80 border border-custom-border-200 rounded px-3 py-2">
          <p className="text-sm text-custom-text-200">{response}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg p-4", "bg-custom-background-90 border-custom-border-200")}>
      <p className="text-sm font-medium text-custom-text-100 mb-3">{question}</p>

      {inputType === "select" && options.length > 0 ? (
        // Select input: render option buttons
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
                  "px-3 py-2 rounded text-sm font-medium transition-colors",
                  response === option
                    ? "bg-custom-primary-100 text-custom-background-100"
                    : "bg-custom-background-80 text-custom-text-200 hover:bg-custom-background-70",
                  isSubmitting && "opacity-50 cursor-not-allowed"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>
      ) : (
        // Text input: render text field with submit button
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
                "bg-custom-background-80 border-custom-border-200",
                "text-sm text-custom-text-100 placeholder-custom-text-400",
                "focus:outline-none focus:ring-1 focus:ring-custom-primary-100",
                isSubmitting && "opacity-50 cursor-not-allowed"
              )}
            />
            <button
              onClick={handleSubmit}
              disabled={!response.trim() || isSubmitting}
              className={cn(
                "px-3 py-2 rounded transition-colors",
                response.trim() && !isSubmitting
                  ? "bg-custom-primary-100 text-custom-background-100 hover:bg-custom-primary-90"
                  : "bg-custom-background-70 text-custom-text-400 cursor-not-allowed"
              )}
            >
              <Send size={16} />
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
