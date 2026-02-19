from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.hw.agent_tools.tools.resolve import resolve_project_id
from plane.db.models import State  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="states.list",
    description="List states for a project",
    params=[
        ToolParam(
            name="project_id", type="string",
            description="Project UUID or identifier (e.g. 'TP')", required=True,
        ),
    ],
    return_type="Array of {id, name, color, group, project_id}",
    requires_project=True
)
def list_states(params: dict, context: ToolContext) -> list:
    """List states for a project."""
    project_id = resolve_project_id(params["project_id"], context.workspace)

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST.value)

    # Get states - the default manager excludes triage states
    states = State.objects.filter(
        project_id=project_id,
        workspace=context.workspace
    ).select_related("project").order_by("group", "sequence")

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