from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_workspace_member, check_project_member
from plane.db.models import Label, Workspace, Project
from plane.app.permissions.base import ROLE


@tool(
    name="labels.list",
    description="List labels in workspace or project",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID (optional - if omitted, returns workspace labels only)", required=False),
    ],
    return_type="List of label objects",
    requires_project=False
)
def list_labels(params: dict, context: ToolContext) -> list:
    """List labels in workspace or project."""
    project_id = params.get("project_id")

    if project_id:
        # If project_id provided, check project membership
        check_project_member(context, UUID(project_id), min_role=ROLE.GUEST)

        # Get workspace labels + project-specific labels
        labels = Label.objects.filter(
            workspace=context.workspace
        ).select_related("workspace", "project")

        # Filter for workspace labels or project-specific labels
        workspace_labels = labels.filter(project__isnull=True)
        project_labels = labels.filter(project_id=project_id)

        all_labels = list(workspace_labels) + list(project_labels)
    else:
        # Check workspace membership
        check_workspace_member(context, min_role=ROLE.GUEST)

        # Get only workspace-level labels
        all_labels = Label.objects.filter(
            workspace=context.workspace,
            project__isnull=True
        ).select_related("workspace")

    result = []
    for label in all_labels:
        result.append({
            "id": str(label.id),
            "name": label.name,
            "color": label.color,
            "workspace_id": str(label.workspace_id),
            "project_id": str(label.project_id) if label.project_id else None
        })

    return result