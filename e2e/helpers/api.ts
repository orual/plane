// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import { APIRequestContext } from "@playwright/test";

interface WorkspaceCreatePayload {
  name: string;
  slug: string;
}

interface ProjectCreatePayload {
  name: string;
  identifier: string;
}

interface IssueTypeCreatePayload {
  name: string;
  description?: string;
  logo_props?: {
    color: string;
  };
}

interface PropertyDefinitionCreatePayload {
  name: string;
  property_type: string;
  issue_type_id?: string;
  is_required?: boolean;
  options?: string[];
}

export const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

/**
 * Create a workspace via the API.
 */
export async function createWorkspace(request: APIRequestContext, token: string, payload: WorkspaceCreatePayload) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create workspace: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Create a project via the API.
 */
export async function createProject(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  payload: ProjectCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: {
      ...payload,
      is_issue_type_enabled: true,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create project: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Create an issue type via the API.
 */
export async function createIssueType(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  payload: IssueTypeCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/issue-types/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: {
      ...payload,
      is_default: false,
      is_active: true,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create issue type: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Create a property definition via the API.
 * Property definitions are workspace-scoped at /api/workspaces/{slug}/property-definitions/.
 */
export async function createPropertyDefinition(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  payload: PropertyDefinitionCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/property-definitions/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create property definition: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data;
}

/**
 * List workspace issue types via the API (for verification).
 * Returns a flat array, handling both paginated and non-paginated responses.
 */
export async function getWorkspaceIssueTypes(request: APIRequestContext, token: string, workspaceSlug: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/issue-types/`, {
    headers: {
      Cookie: `session-id=${token}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch issue types: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

/**
 * List property definitions via the API (for verification).
 * Returns a flat array, handling both paginated and non-paginated responses.
 */
export async function getPropertyDefinitions(request: APIRequestContext, token: string, workspaceSlug: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/property-definitions/`, {
    headers: {
      Cookie: `session-id=${token}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch property definitions: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

interface IssueCreatePayload {
  name: string;
  start_date?: string;
  target_date?: string;
}

/**
 * Create an issue via the API.
 */
export async function createIssue(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  payload: IssueCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, {
    headers: {
      Cookie: `session-id=${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Create an issue relation (dependency) via the API.
 */
export async function createIssueRelation(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  payload: { relation_type: string; related_list: string[] }
) {
  const response = await request.post(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-relations/`,
    {
      headers: {
        Cookie: `session-id=${token}`,
        "Content-Type": "application/json",
      },
      data: payload,
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create issue relation: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Get an issue by ID via the API.
 */
export async function getIssue(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  issueId: string
) {
  const response = await request.get(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    {
      headers: {
        Cookie: `session-id=${token}`,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to get issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
