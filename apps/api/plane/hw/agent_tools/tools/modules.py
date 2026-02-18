from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.db.models import Module, ModuleIssue, Project  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="modules.list",
    description="List modules in a project",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="List of module objects",
    requires_project=True
)
def list_modules(params: dict, context: ToolContext) -> list:
    """List modules in a project."""
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Get modules
    modules = Module.objects.filter(
        project_id=project_id,
        workspace=context.workspace,
        archived_at__isnull=True
    ).select_related("project", "owned_by").order_by("start_date")

    result = []
    for module in modules:
        owned_by = None
        if module.owned_by:
            owned_by = {
                "id": str(module.owned_by.id),
                "display_name": module.owned_by.display_name
            }

        result.append({
            "id": str(module.id),
            "name": module.name,
            "status": module.status,
            "start_date": module.start_date.isoformat() if module.start_date else None,
            "target_date": module.target_date.isoformat() if module.target_date else None,
            "owned_by": owned_by,
            "project_id": str(module.project_id)
        })

    return result


@tool(
    name="modules.get",
    description="Get a single module by ID",
    params=[
        ToolParam(name="module_id", type="string", description="Module ID", required=True),
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
    ],
    return_type="Module object with full detail",
    requires_project=True
)
def get_module(params: dict, context: ToolContext) -> dict:
    """Get a single module by ID."""
    module_id = UUID(params["module_id"])
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Get module
    module = Module.objects.get(
        id=module_id,
        project_id=project_id,
        workspace=context.workspace
    )

    # Get associated issues
    module_issues = ModuleIssue.objects.filter(
        module_id=module_id,
        workspace=context.workspace
    ).select_related("issue")

    issues = [
        {
            "id": str(module_issue.issue.id),
            "name": module_issue.issue.name,
            "sequence_id": module_issue.issue.sequence_id
        }
        for module_issue in module_issues
    ]

    owned_by = None
    if module.owned_by:
        owned_by = {
            "id": str(module.owned_by.id),
            "display_name": module.owned_by.display_name
        }

    return {
        "id": str(module.id),
        "name": module.name,
        "status": module.status,
        "start_date": module.start_date.isoformat() if module.start_date else None,
        "target_date": module.target_date.isoformat() if module.target_date else None,
        "owned_by": owned_by,
        "project_id": str(module.project_id),
        "issues": issues
    }


@tool(
    name="modules.add_issues",
    description="Add issues to a module",
    params=[
        ToolParam(name="module_id", type="string", description="Module ID", required=True),
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
        ToolParam(
            name="issue_ids",
            type="array",
            description="Array of issue IDs to add",
            required=True,
            items_type="string"
        ),
    ],
    return_type="List of added issue IDs",
    requires_project=True
)
def add_issues_to_module(params: dict, context: ToolContext) -> list:
    """Add issues to a module."""
    module_id = UUID(params["module_id"])
    project_id = UUID(params["project_id"])

    # Check permissions (must be member or higher)
    check_project_member(context, project_id, min_role=ROLE.MEMBER)

    # Use bulk_create with ignore_conflicts to handle duplicates
    module_issues_to_create = []
    for issue_id in params["issue_ids"]:
        module_issues_to_create.append(ModuleIssue(
            module_id=module_id,
            issue_id=UUID(issue_id),
            workspace=context.workspace,
            created_by=context.user,
            updated_by=context.user
        ))

    # Bulk create, ignoring conflicts for duplicates
    created = ModuleIssue.objects.bulk_create(
        module_issues_to_create,
        ignore_conflicts=True
    )

    # Return the IDs of issues that were actually added
    added_ids = [str(issue.issue_id) for issue in created]
    return added_ids