from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_workspace_member
from plane.db.models import Project  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="projects.list",
    description="List projects in the workspace",
    params=[
        # No project-level params for listing all projects
    ],
    return_type="List of project objects",
    requires_project=False
)
def list_projects(params: dict, context: ToolContext) -> list:
    """List projects in the workspace."""
    # Check workspace membership
    check_workspace_member(context, min_role=ROLE.GUEST)

    # Get projects
    projects = Project.objects.filter(
        workspace=context.workspace,
        archived_at__isnull=True
    ).select_related("workspace").order_by("name")

    result = []
    for project in projects:
        result.append({
            "id": str(project.id),
            "name": project.name,
            "identifier": project.identifier,
            "description": project.description
        })

    return result


@tool(
    name="projects.get",
    description="Get a single project by ID",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="Project object with full detail",
    requires_project=False
)
def get_project(params: dict, context: ToolContext) -> dict:
    """Get a single project by ID."""
    project_id = UUID(params["project_id"])

    # Get project and check workspace
    project = Project.objects.get(id=project_id, workspace=context.workspace)

    # Check workspace membership
    check_workspace_member(context, min_role=ROLE.GUEST)

    return {
        "id": str(project.id),
        "name": project.name,
        "identifier": project.identifier,
        "description": project.description,
        "workspace_id": str(project.workspace_id),
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat()
    }