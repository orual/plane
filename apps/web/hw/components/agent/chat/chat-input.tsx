/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";

interface TChatInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * ChatInput: A textarea-based input with auto-resize and send button.
 * Features:
 * - Enter to send, Shift+Enter for newline
 * - Auto-resize textarea based on content
 * - Disabled state while agent is processing
 */
export function ChatInput({ onSend, disabled = false, placeholder = "Send a message..." }: TChatInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [content]);

  const handleSend = () => {
    if (!content.trim() || disabled || isSending) {
      return;
    }

    setIsSending(true);
    void onSend(content)
      .then(() => {
        setContent("");
        return undefined;
      })
      .finally(() => {
        setIsSending(false);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isDisabled = disabled || isSending || !content.trim();

  return (
    <div className="border-t border-subtle px-4 py-3">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "flex-1 resize-none rounded-lg border border-subtle bg-layer-1 px-3 py-2",
            "text-13 placeholder-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "max-h-30 min-h-10"
          )}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={isDisabled}
          className={cn(
            "flex items-center justify-center rounded-lg px-3 py-2",
            "transition-colors duration-200",
            isDisabled
              ? "bg-layer-2 text-tertiary cursor-not-allowed"
              : "bg-accent-primary text-white hover:bg-accent-primary/90"
          )}
          title={isDisabled ? "Type a message to send" : "Send message (Shift+Enter for newline)"}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
