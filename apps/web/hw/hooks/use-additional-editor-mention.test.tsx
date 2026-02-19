/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TSearchResponse } from "@plane/types";
import { useAdditionalEditorMention } from "./use-additional-editor-mention";

describe("useAdditionalEditorMention HW Hook", () => {
  describe("editorMentionTypes", () => {
    it("should include agent_mention when enableAdvancedMentions is true", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      expect(result.current.editorMentionTypes).toContain("agent_mention");
      expect(result.current.editorMentionTypes).toContain("user_mention");
      expect(result.current.editorMentionTypes).toHaveLength(2);
    });

    it("should only include user_mention when enableAdvancedMentions is false", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: false }));

      expect(result.current.editorMentionTypes).toEqual(["user_mention"]);
      expect(result.current.editorMentionTypes).not.toContain("agent_mention");
    });
  });

  describe("updateAdditionalSections", () => {
    it("should return empty sections when enableAdvancedMentions is false", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: false }));

      const response: TSearchResponse = {
        agent_mention: [{ id: "agent-1", display_name: "Test Agent", agent_type: "builtin" }],
      };

      const sections = result.current.updateAdditionalSections({ response });

      expect(sections.sections).toHaveLength(0);
    });

    it("should return agents section with correct shape when agents exist", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {
        agent_mention: [
          { id: "agent-1", display_name: "My Builtin Agent", agent_type: "builtin" },
          { id: "agent-2", display_name: "My External Agent", agent_type: "external" },
        ],
      };

      const { sections } = result.current.updateAdditionalSections({ response });

      expect(sections).toHaveLength(1);
      expect(sections[0]?.key).toBe("agents");
      expect(sections[0]?.title).toBe("Agents");
      expect(sections[0]?.items).toHaveLength(2);
    });

    it("should map agent fields to suggestion shape correctly", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {
        agent_mention: [{ id: "agent-1", display_name: "Test Agent", agent_type: "builtin" }],
      };

      const { sections } = result.current.updateAdditionalSections({ response });
      const suggestion = sections[0]?.items[0];

      expect(suggestion?.id).toBe("agent-1");
      expect(suggestion?.entity_identifier).toBe("agent-1");
      expect(suggestion?.entity_name).toBe("agent_mention");
      expect(suggestion?.title).toBe("Test Agent");
    });

    it("should show correct type badge for builtin agents", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {
        agent_mention: [{ id: "agent-1", display_name: "Builtin", agent_type: "builtin" }],
      };

      const { sections } = result.current.updateAdditionalSections({ response });
      const suggestion = sections[0]?.items[0];

      expect(suggestion?.subTitle).toBe("Built-in");
    });

    it("should show correct type badge for external agents", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {
        agent_mention: [{ id: "agent-1", display_name: "External", agent_type: "external" }],
      };

      const { sections } = result.current.updateAdditionalSections({ response });
      const suggestion = sections[0]?.items[0];

      expect(suggestion?.subTitle).toBe("External");
    });

    it("should return empty sections when agent_mention is empty array", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {
        agent_mention: [],
      };

      const { sections } = result.current.updateAdditionalSections({ response });

      expect(sections).toHaveLength(0);
    });

    it("should return empty sections when agent_mention is undefined", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const response: TSearchResponse = {};

      const { sections } = result.current.updateAdditionalSections({ response });

      expect(sections).toHaveLength(0);
    });
  });

  describe("parseAdditionalEditorContent", () => {
    it("should return redirection path for agent_mention entity type", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const parsed = result.current.parseAdditionalEditorContent({
        id: "agent-1",
        entityType: "agent_mention",
      });

      expect(parsed).toEqual({
        redirectionPath: "/settings/agents",
        textContent: "agent-1",
      });
    });

    it("should return undefined for non-agent entity types", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const parsed = result.current.parseAdditionalEditorContent({
        id: "user-1",
        entityType: "user_mention",
      });

      expect(parsed).toBeUndefined();
    });

    it("should return undefined for other entity types", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: true }));

      const parsed = result.current.parseAdditionalEditorContent({
        id: "issue-1",
        entityType: "issue",
      });

      expect(parsed).toBeUndefined();
    });

    it("should return redirection path regardless of enableAdvancedMentions flag", () => {
      const { result } = renderHook(() => useAdditionalEditorMention({ enableAdvancedMentions: false }));

      const parsed = result.current.parseAdditionalEditorContent({
        id: "agent-1",
        entityType: "agent_mention",
      });

      expect(parsed).toEqual({
        redirectionPath: "/settings/agents",
        textContent: "agent-1",
      });
    });
  });
});
