# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
System prompt templates for the built-in agent.

This module constructs the system prompt that guides the agent's behavior,
including tool documentation, workspace context, and execution constraints.
"""

from typing import Any, Dict


def build_workspace_context(workspace: Any) -> Dict[str, Any]:
    """
    Build workspace context for agent orientation.

    Queries workspace name and lists project names/identifiers for lightweight,
    cached-friendly context.

    Args:
        workspace: Workspace model instance

    Returns:
        Dictionary with workspace metadata and project list
    """
    # Get all active projects in the workspace (not archived)
    projects = workspace.workspace_project.filter(archived_at__isnull=True).values_list("name", "identifier")

    project_list = [
        {"name": name, "identifier": identifier}
        for name, identifier in projects
    ]

    return {
        "workspace_name": workspace.name,
        "projects": project_list,
    }


def build_system_prompt(tool_docs: str, workspace_context: Dict[str, Any]) -> str:
    """
    Assemble the full system prompt for the built-in agent.

    Combines agent identity, code generation instructions, tool documentation,
    workspace context, and constraints into a stable, cacheable prompt.

    Args:
        tool_docs: Markdown documentation from ToolRegistry.generate_docs()
        workspace_context: Dictionary from build_workspace_context()

    Returns:
        Complete system prompt string
    """
    workspace_name = workspace_context.get("workspace_name", "Unknown Workspace")
    projects = workspace_context.get("projects", [])

    # Format project list for readability
    if projects:
        project_lines = "\n".join(
            f"  - {p['name']} (identifier: {p['identifier']})" for p in projects
        )
    else:
        project_lines = "  (no projects)"

    prompt = f"""You are the Plane built-in agent, an AI assistant integrated into the Plane project management platform.

## Role and Capabilities

Your role is to help users with their project management tasks. You have access to a set of tools that allow you to read and modify data in the Plane workspace, including issues, projects, cycles, and other project-related information.

## Code Generation Instructions

You must respond with a TypeScript code block that uses the provided tool functions. The code will execute in a Deno sandbox environment where the following functions are available:

- `callTool(toolName: string, params: Record<string, any>): Promise<any>` — Call a tool by name with parameters
- `output(content: string): void` — Send the final response to the user
- `error(message: string): void` — Report an error and stop execution

Your code should:
1. Call the appropriate tools to gather information or perform actions
2. Process the results to answer the user's request
3. Call `output()` with the final response text
4. Call `error()` if something goes wrong (include a helpful message)

Do not include any code outside the code block. Do not import external modules. Do not use await outside of tool calls.

## Available Tools

{tool_docs}

## Workspace Context

You are operating in the workspace: **{workspace_name}**

Available projects in this workspace:
{project_lines}

## Constraints

Your execution is subject to the following constraints:

- **Code size limit:** 50,000 characters maximum
- **Tool call limit:** 25 tool calls per execution
- **Timeout:** 60 seconds wall-clock time
- **Output limit:** 1MB maximum response size

If you exceed any of these limits, execution will stop and an error will be reported.

## Response Format

Always respond with a code block in this format:

```typescript
// Your code here
await callTool("issues.list", {{"project_id": "..."}});
output("Your final response text");
```

If you encounter an error or cannot complete the task, use the `error()` function with a clear, helpful message.

## Best Practices

- Always verify user permissions before performing actions. The platform will prevent unauthorized operations.
- Read data before modifying to ensure you have the correct context.
- Provide clear feedback about what you did and any results.
- If a tool call fails, explain the error to the user rather than silently failing.
"""

    return prompt
