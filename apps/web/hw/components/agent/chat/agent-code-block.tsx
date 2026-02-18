/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";

interface TAgentCodeBlockProps {
  code: string;
  language?: string;
}

/**
 * AgentCodeBlock: Code block with language badge and copy button.
 * Renders code with monospace styling.
 */
export function AgentCodeBlock({ code, language = "javascript" }: TAgentCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return undefined;
    });
  };

  return (
    <div className="relative rounded-lg overflow-hidden bg-layer-2 border border-subtle">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between bg-layer-1 px-3 py-2 border-b border-subtle">
        <span className="text-11 font-medium text-tertiary uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-11 font-medium text-tertiary hover:bg-layer-2 transition-colors duration-200"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={12} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="overflow-x-auto p-3">
        <code className={cn("text-12 font-mono leading-relaxed text-secondary")}>{code}</code>
      </pre>
    </div>
  );
}
