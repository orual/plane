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

interface IssueCreatePayload {
  name: string;
  description?: string;
  type_id?: string;
  priority?: string;
  state_id?: string;
}

interface IssuePropertyCreatePayload {
  name: string;
  field_type: string;
  options?: Array<{
    label: string;
    color: string;
  }>;
}

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

/**
 * Create a workspace via the API.
 */
export async function createWorkspace(
  request: APIRequestContext,
  token: string,
  payload: WorkspaceCreatePayload
) {
  const response = await request.post(`${API_BASE_URL}/api/workspaces/`, {
    headers: {
      Cookie: `sessionid=${token}`,
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
      Cookie: `sessionid=${token}`,
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
      Cookie: `sessionid=${token}`,
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
 * Link an issue type to a project via the API.
 */
export async function linkIssueTypeToProject(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  issueTypeId: string
) {
  const response = await request.post(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`,
    {
      headers: {
        Cookie: `sessionid=${token}`,
        "Content-Type": "application/json",
      },
      data: {
        issue_type_id: issueTypeId,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to link issue type: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Get issue states for a project via the API.
 */
export async function getProjectStates(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string
) {
  const response = await request.get(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
    {
      headers: {
        Cookie: `sessionid=${token}`,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to fetch states: ${response.status()} ${await response.text()}`);
  }

  return response.json();
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
  const response = await request.post(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
    {
      headers: {
        Cookie: `sessionid=${token}`,
        "Content-Type": "application/json",
      },
      data: payload,
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create issue: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Create an issue property (custom field) via the API.
 */
export async function createIssueProperty(
  request: APIRequestContext,
  token: string,
  workspaceSlug: string,
  projectId: string,
  payload: IssuePropertyCreatePayload
) {
  const response = await request.post(
    `${API_BASE_URL}/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-properties/`,
    {
      headers: {
        Cookie: `sessionid=${token}`,
        "Content-Type": "application/json",
      },
      data: payload,
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create issue property: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Get all workspaces for the authenticated user via the API.
 */
export async function getWorkspaces(request: APIRequestContext, token: string) {
  const response = await request.get(`${API_BASE_URL}/api/workspaces/`, {
    headers: {
      Cookie: `sessionid=${token}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch workspaces: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}
