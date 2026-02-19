/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
// lucide icons
import { Bot } from "lucide-react";
// plane editor
import type { TMentionSection, TMentionSuggestion } from "@plane/editor";
// plane types
import type { TSearchEntities, TSearchResponse } from "@plane/types";

export type TUseAdditionalEditorMentionArgs = {
  enableAdvancedMentions: boolean;
};

export type TAdditionalEditorMentionHandlerArgs = {
  response: TSearchResponse;
};

export type TAdditionalEditorMentionHandlerReturnType = {
  sections: TMentionSection[];
};

export type TAdditionalParseEditorContentArgs = {
  id: string;
  entityType: TSearchEntities;
};

export type TAdditionalParseEditorContentReturnType =
  | {
      redirectionPath: string;
      textContent: string;
    }
  | undefined;

export const useAdditionalEditorMention = (args: TUseAdditionalEditorMentionArgs) => {
  const { enableAdvancedMentions } = args;

  const updateAdditionalSections = useCallback(
    (args: TAdditionalEditorMentionHandlerArgs): TAdditionalEditorMentionHandlerReturnType => {
      if (!enableAdvancedMentions) {
        return { sections: [] };
      }

      const { response } = args;
      const sections: TMentionSection[] = [];

      // Process agent_mention results
      if (response.agent_mention && response.agent_mention.length > 0) {
        const items: TMentionSuggestion[] = response.agent_mention.map((agent) => ({
          icon: <Bot className="h-4 w-4 flex-shrink-0" />,
          id: agent.id,
          entity_identifier: agent.id,
          entity_name: "agent_mention",
          title: agent.display_name,
          subTitle: agent.agent_type === "builtin" ? "Built-in" : "External",
        }));
        sections.push({
          key: "agents",
          title: "Agents",
          items,
        });
      }

      return { sections };
    },
    [enableAdvancedMentions]
  );

  const parseAdditionalEditorContent = useCallback(
    (args: TAdditionalParseEditorContentArgs): TAdditionalParseEditorContentReturnType => {
      const { entityType, id } = args;

      if (entityType === "agent_mention") {
        return {
          redirectionPath: "/settings/agents",
          textContent: id,
        };
      }

      return undefined;
    },
    []
  );

  const editorMentionTypes: TSearchEntities[] = useMemo(
    () => (enableAdvancedMentions ? ["user_mention", "agent_mention"] : ["user_mention"]),
    [enableAdvancedMentions]
  );

  return {
    updateAdditionalSections,
    parseAdditionalEditorContent,
    editorMentionTypes,
  };
};
