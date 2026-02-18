from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.db.models import State  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="states.list",
    description="List states for a project",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="List of state objects",
    requires_project=True
)
def list_states(params: dict, context: ToolContext) -> list:
    """List states for a project."""
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Get states - the default manager excludes triage states
    states = State.objects.filter(
        project_id=project_id,
        workspace=context.workspace
    ).select_related("project").order_by("group", "sequence_id")

    result = []
    for state in states:
        result.append({
            "id": str(state.id),
            "name": state.name,
            "color": state.color,
            "group": state.group,
            "project_id": str(state.project_id)
        })

    return result