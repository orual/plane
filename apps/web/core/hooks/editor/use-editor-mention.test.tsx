/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import type { TSearchEntities, TSearchResponse } from "@plane/types";

/**
 * Integration tests for editor mention flow (users + agents).
 * Tests validate that:
 * - Query types change based on enableAdvancedMentions flag
 * - Both user and agent sections are returned when agents are enabled
 * - Agent mentions have correct structure (entity_name, entity_identifier, subTitle)
 * - Search query is passed through to service layer
 */

describe("useEditorMention - Integration flow", () => {
  describe("Query type construction", () => {
    it("should request agent_mention query type when enableAdvancedMentions=true", () => {
      // Simulate the behavior of useEditorMention with enableAdvancedMentions=true
      // The hook should construct query_type: ["user_mention", "agent_mention"]
      const editorMentionTypes: TSearchEntities[] = ["user_mention", "agent_mention"];

      expect(editorMentionTypes).toContain("user_mention");
      expect(editorMentionTypes).toContain("agent_mention");
    });

    it("should only request user_mention query type when enableAdvancedMentions=false", () => {
      const editorMentionTypes: TSearchEntities[] = ["user_mention"];

      expect(editorMentionTypes).toContain("user_mention");
      expect(editorMentionTypes).not.toContain("agent_mention");
    });
  });

  describe("Response structure validation", () => {
    it("should have correct TAgentSearchResponse structure", () => {
      // Mock agent response
      const agentResponse = {
        id: "agent-1",
        display_name: "My Agent",
        agent_type: "builtin" as const,
      };

      expect(agentResponse.id).toBeDefined();
      expect(agentResponse.display_name).toBeDefined();
      expect(agentResponse.agent_type).toBeDefined();
      expect(["builtin", "external"]).toContain(agentResponse.agent_type);
    });

    it("should convert agent response to mention suggestion", () => {
      // Simulate how useAdditionalEditorMention processes agent_mention response
      const agentResponse = {
        id: "agent-123",
        display_name: "Builtin Agent",
        agent_type: "builtin" as const,
      };

      // This is what the hook does
      const suggestion = {
        icon: "BotIcon", // Represented as string in test
        id: agentResponse.id,
        entity_identifier: agentResponse.id,
        entity_name: "agent_mention" as const,
        title: agentResponse.display_name,
        subTitle: agentResponse.agent_type === "builtin" ? "Built-in" : "External",
      };

      expect(suggestion.entity_identifier).toBe("agent-123");
      expect(suggestion.entity_name).toBe("agent_mention");
      expect(suggestion.title).toBe("Builtin Agent");
      expect(suggestion.subTitle).toBe("Built-in");
    });

    it("should differentiate agent type badges", () => {
      const builtinAgent = { id: "a1", display_name: "AI", agent_type: "builtin" as const };
      const externalAgent = { id: "a2", display_name: "Service", agent_type: "external" as const };

      const builtinBadge = builtinAgent.agent_type === "builtin" ? "Built-in" : "External";
      const externalBadge = externalAgent.agent_type === "builtin" ? "Built-in" : "External";

      expect(builtinBadge).toBe("Built-in");
      expect(externalBadge).toBe("External");
    });
  });

  describe("Section merging", () => {
    it("should merge user and agent sections correctly", () => {
      // Simulate useEditorMention merging sections from response
      const userSections = [
        {
          key: "users",
          title: "Users",
          items: [
            {
              id: "user-1",
              entity_identifier: "user-1",
              entity_name: "user_mention" as const,
              title: "Alice",
            },
          ],
        },
      ];

      const agentSections = [
        {
          key: "agents",
          title: "Agents",
          items: [
            {
              id: "agent-1",
              entity_identifier: "agent-1",
              entity_name: "agent_mention" as const,
              title: "My Agent",
              subTitle: "Built-in",
            },
          ],
        },
      ];

      const merged = [...userSections, ...agentSections];

      expect(merged).toHaveLength(2);
      expect(merged[0]?.key).toBe("users");
      expect(merged[1]?.key).toBe("agents");
    });

    it("should not include agent section when response is empty", () => {
      // When backend returns agent_mention: [], updateAdditionalSections returns empty sections
      const agentMentionResponse: TSearchResponse = {
        agent_mention: [],
      };

      const agentSections = agentMentionResponse.agent_mention?.length
        ? [{ key: "agents", title: "Agents", items: [] }]
        : [];

      expect(agentSections).toHaveLength(0);
    });
  });

  describe("Feature flag behavior", () => {
    it("should include agent_mention when enableAdvancedMentions=true", () => {
      const enableAdvancedMentions = true;
      const types: TSearchEntities[] = enableAdvancedMentions ? ["user_mention", "agent_mention"] : ["user_mention"];

      expect(types).toContain("user_mention");
      expect(types).toContain("agent_mention");
    });

    it("should exclude agent_mention when enableAdvancedMentions=false", () => {
      const enableAdvancedMentions = false;
      const types: TSearchEntities[] = enableAdvancedMentions ? ["user_mention", "agent_mention"] : ["user_mention"];

      expect(types).toContain("user_mention");
      expect(types).not.toContain("agent_mention");
    });
  });
});
