from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.db.models import Cycle, CycleIssue, Project, User
from plane.app.permissions.base import ROLE


@tool(
    name="cycles.list",
    description="List cycles in a project",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="List of cycle objects",
    requires_project=True
)
def list_cycles(params: dict, context: ToolContext) -> list:
    """List cycles in a project."""
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Get cycles
    cycles = Cycle.objects.filter(
        project_id=project_id,
        workspace=context.workspace,
        archived_at__isnull=True
    ).select_related("project", "owned_by").order_by("start_date")

    result = []
    for cycle in cycles:
        owned_by = None
        if cycle.owned_by:
            owned_by = {
                "id": str(cycle.owned_by.id),
                "display_name": cycle.owned_by.display_name
            }

        result.append({
            "id": str(cycle.id),
            "name": cycle.name,
            "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
            "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
            "owned_by": owned_by,
            "project_id": str(cycle.project_id)
        })

    return result


@tool(
    name="cycles.get",
    description="Get a single cycle by ID",
    params=[
        ToolParam(name="cycle_id", type="string", description="Cycle ID", required=True),
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="Cycle object with full detail",
    requires_project=True
)
def get_cycle(params: dict, context: ToolContext) -> dict:
    """Get a single cycle by ID."""
    cycle_id = UUID(params["cycle_id"])
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Get cycle
    cycle = Cycle.objects.get(
        id=cycle_id,
        project_id=project_id,
        workspace=context.workspace
    )

    # Get associated issues
    cycle_issues = CycleIssue.objects.filter(
        cycle_id=cycle_id,
        workspace=context.workspace
    ).select_related("issue")

    issues = [
        {
            "id": str(cycle_issue.issue.id),
            "name": cycle_issue.issue.name,
            "sequence_id": cycle_issue.issue.sequence_id
        }
        for cycle_issue in cycle_issues
    ]

    owned_by = None
    if cycle.owned_by:
        owned_by = {
            "id": str(cycle.owned_by.id),
            "display_name": cycle.owned_by.display_name
        }

    return {
        "id": str(cycle.id),
        "name": cycle.name,
        "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
        "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
        "owned_by": owned_by,
        "project_id": str(cycle.project_id),
        "issues": issues
    }


@tool(
    name="cycles.add_issues",
    description="Add issues to a cycle",
    params=[
        ToolParam(name="cycle_id", type="string", description="Cycle ID", required=True),
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
        ToolParam(name="issue_ids", type="array", description="Array of issue IDs to add", required=True, items_type="string"),
    ],
    return_type="List of added issue IDs",
    requires_project=True
)
def add_issues_to_cycle(params: dict, context: ToolContext) -> list:
    """Add issues to a cycle."""
    cycle_id = UUID(params["cycle_id"])
    project_id = UUID(params["project_id"])

    # Check permissions (must be member or higher)
    check_project_member(context, project_id, min_role=ROLE.MEMBER)

    # Use bulk_create with ignore_conflicts to handle duplicates
    cycle_issues_to_create = []
    for issue_id in params["issue_ids"]:
        cycle_issues_to_create.append(CycleIssue(
            cycle_id=cycle_id,
            issue_id=UUID(issue_id),
            workspace=context.workspace,
            created_by=context.user,
            updated_by=context.user
        ))

    # Bulk create, ignoring conflicts for duplicates
    created = CycleIssue.objects.bulk_create(
        cycle_issues_to_create,
        ignore_conflicts=True
    )

    # Return the IDs of issues that were actually added
    added_ids = [str(issue.issue_id) for issue in created]
    return added_ids