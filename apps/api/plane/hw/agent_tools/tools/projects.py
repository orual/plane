from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_workspace_member
from plane.hw.agent_tools.tools.resolve import resolve_project_id
from plane.db.models import Project
from plane.app.permissions.base import ROLE


@tool(
    name="projects.list",
    description="List projects in the workspace",
    params=[],
    return_type="Array of {id, name, identifier, description}",
    requires_project=False
)
def list_projects(params: dict, context: ToolContext) -> list:
    """List projects in the workspace."""
    check_workspace_member(context, min_role=ROLE.GUEST.value)

    projects = Project.objects.filter(
        workspace=context.workspace,
        archived_at__isnull=True
    ).order_by("name")

    return [
        {
            "id": str(project.id),
            "name": project.name,
            "identifier": project.identifier,
            "description": project.description,
        }
        for project in projects
    ]


@tool(
    name="projects.get",
    description="Get a single project by ID or identifier",
    params=[
        ToolParam(
            name="project_id",
            type="string",
            description="Project UUID or identifier (e.g. 'TP')",
            required=True,
        ),
    ],
    return_type="{id, name, identifier, description, workspace_id, created_at, updated_at}",
    requires_project=False
)
def get_project(params: dict, context: ToolContext) -> dict:
    """Get a single project by ID or identifier."""
    check_workspace_member(context, min_role=ROLE.GUEST.value)

    project_id = resolve_project_id(params["project_id"], context.workspace)
    project = Project.objects.get(id=project_id, workspace=context.workspace)

    return {
        "id": str(project.id),
        "name": project.name,
        "identifier": project.identifier,
        "description": project.description,
        "workspace_id": str(project.workspace_id),
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
    }
