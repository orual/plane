/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const AI_ASSISTANT_NAME = "Brigid";

export enum AI_EDITOR_TASKS {
  ASK_ANYTHING = "ASK_ANYTHING",
}

export const LOADING_TEXTS: {
  [key in AI_EDITOR_TASKS]: string;
} = {
  [AI_EDITOR_TASKS.ASK_ANYTHING]: `${AI_ASSISTANT_NAME} is generating response`,
};
