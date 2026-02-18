from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.utils.issue_search import search_issues
from plane.db.models import Issue, IssueAssignee, IssueLabel  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="issues.list",
    description="List issues in a project",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
        ToolParam(name="state_id", type="string", description="Filter by state ID", required=False),
        ToolParam(name="priority", type="string", description="Filter by priority", required=False),
        ToolParam(name="assignee_id", type="string", description="Filter by assignee ID", required=False),
    ],
    return_type="List of issue objects",
    requires_project=True
)
def list_issues(params: dict, context: ToolContext) -> list:
    """List issues in a project with optional filters."""
    project_id = UUID(params["project_id"])

    # Check permissions
    check_project_member(context, project_id, min_role=ROLE.GUEST)

    # Build queryset
    issues_qs = Issue.issue_objects.filter(
        workspace=context.workspace,
        project_id=project_id
    )

    # Apply filters
    if "state_id" in params:
        issues_qs = issues_qs.filter(state_id=params["state_id"])
    if "priority" in params:
        issues_qs = issues_qs.filter(priority=params["priority"])
    if "assignee_id" in params:
        issues_qs = issues_qs.filter(assignees__user_id=params["assignee_id"])

    # Execute query and format results
    issues = issues_qs.select_related("state", "project").prefetch_related("assignees", "labels").all()

    result = []
    for issue in issues:
        assignees = [
            {
                "id": str(assignee.user_id),
                "display_name": assignee.user.display_name
            }
            for assignee in issue.assignees.all()
        ]

        labels = [
            {
                "id": str(label.label_id),
                "name": label.label.name,
                "color": label.label.color
            }
            for label in issue.labels.all()
        ]

        result.append({
            "id": str(issue.id),
            "name": issue.name,
            "state_id": str(issue.state_id),
            "priority": issue.priority,
            "sequence_id": issue.sequence_id,
            "assignees": assignees,
            "labels": labels,
            "project_id": str(issue.project_id)
        })

    return result


@tool(
    name="issues.get",
    description="Get a single issue by ID",
    params=[
        ToolParam(name="issue_id", type="string", description="Issue ID", required=True),
    ],
    return_type="Issue object with full detail",
    requires_project=True
)
def get_issue(params: dict, context: ToolContext) -> dict:
    """Get a single issue by ID."""
    issue_id = UUID(params["issue_id"])

    # Get issue and check workspace
    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    # Check permissions (project member check will happen via project_id)
    check_project_member(context, issue.project_id, min_role=ROLE.GUEST)

    # Get assignees and labels
    assignees = [
        {
            "id": str(assignee.user_id),
            "display_name": assignee.user.display_name,
            "email": assignee.user.email
        }
        for assignee in issue.assignees.all()
    ]

    labels = [
        {
            "id": str(label.label_id),
            "name": label.label.name,
            "color": label.label.color
        }
        for label in issue.labels.all()
    ]

    return {
        "id": str(issue.id),
        "name": issue.name,
        "description_html": issue.description_html,
        "state_id": str(issue.state_id),
        "priority": issue.priority,
        "sequence_id": issue.sequence_id,
        "assignees": assignees,
        "labels": labels,
        "project_id": str(issue.project_id),
        "created_at": issue.created_at.isoformat(),
        "updated_at": issue.updated_at.isoformat()
    }


@tool(
    name="issues.create",
    description="Create a new issue",
    params=[
        ToolParam(name="project_id", type="string", description="Project ID", required=True),
        ToolParam(name="name", type="string", description="Issue name", required=True),
        ToolParam(name="description_html", type="string", description="Issue description in HTML", required=False),
        ToolParam(name="priority", type="string", description="Issue priority", required=False),
        ToolParam(name="state_id", type="string", description="State ID", required=False),
        ToolParam(
            name="assignee_ids", type="array",
            description="Array of assignee user IDs",
            required=False, items_type="string"
        ),
        ToolParam(
            name="label_ids", type="array",
            description="Array of label IDs",
            required=False, items_type="string"
        ),
    ],
    return_type="Created issue object",
    requires_project=True
)
def create_issue(params: dict, context: ToolContext) -> dict:
    """Create a new issue."""
    project_id = UUID(params["project_id"])

    # Check permissions (must be member or higher to create)
    check_project_member(context, project_id, min_role=ROLE.MEMBER)

    # Create the issue
    issue = Issue.objects.create(
        project_id=project_id,
        name=params["name"],
        description_html=params.get("description_html", ""),
        priority=params.get("priority"),
        state_id=params.get("state_id"),
        created_by=context.user,
        updated_by=context.user
    )

    # Add assignees if provided
    if "assignee_ids" in params:
        for assignee_id in params["assignee_ids"]:
            IssueAssignee.objects.create(
                issue=issue,
                user_id=UUID(assignee_id),
                created_by=context.user,
                updated_by=context.user
            )

    # Add labels if provided
    if "label_ids" in params:
        for label_id in params["label_ids"]:
            IssueLabel.objects.create(
                issue=issue,
                label_id=UUID(label_id),
                created_by=context.user,
                updated_by=context.user
            )

    return get_issue({"issue_id": str(issue.id)}, context)


@tool(
    name="issues.update",
    description="Update an existing issue",
    params=[
        ToolParam(name="issue_id", type="string", description="Issue ID", required=True),
        ToolParam(name="name", type="string", description="Issue name", required=False),
        ToolParam(name="description_html", type="string", description="Issue description in HTML", required=False),
        ToolParam(name="priority", type="string", description="Issue priority", required=False),
        ToolParam(name="state_id", type="string", description="State ID", required=False),
        ToolParam(
            name="assignee_ids", type="array",
            description="Array of assignee user IDs",
            required=False, items_type="string"
        ),
        ToolParam(
            name="label_ids", type="array",
            description="Array of label IDs",
            required=False, items_type="string"
        ),
    ],
    return_type="Updated issue object",
    requires_project=True
)
def update_issue(params: dict, context: ToolContext) -> dict:
    """Update an existing issue."""
    issue_id = UUID(params["issue_id"])

    # Get issue and check workspace
    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    # Check permissions (must be member or higher to update)
    check_project_member(context, issue.project_id, min_role=ROLE.MEMBER)

    # Update fields
    update_fields = []
    if "name" in params:
        issue.name = params["name"]
        update_fields.append("name")
    if "description_html" in params:
        issue.description_html = params["description_html"]
        update_fields.append("description_html")
    if "priority" in params:
        issue.priority = params["priority"]
        update_fields.append("priority")
    if "state_id" in params:
        issue.state_id = params["state_id"]
        update_fields.append("state_id")

    issue.updated_by = context.user
    issue.save(update_fields=update_fields)

    # Update assignees if provided
    if "assignee_ids" in params:
        # Clear existing assignees
        issue.assignees.all().delete()

        # Add new assignees
        for assignee_id in params["assignee_ids"]:
            IssueAssignee.objects.create(
                issue=issue,
                user_id=UUID(assignee_id),
                created_by=context.user,
                updated_by=context.user
            )

    # Update labels if provided
    if "label_ids" in params:
        # Clear existing labels
        issue.labels.all().delete()

        # Add new labels
        for label_id in params["label_ids"]:
            IssueLabel.objects.create(
                issue=issue,
                label_id=UUID(label_id),
                created_by=context.user,
                updated_by=context.user
            )

    return get_issue({"issue_id": str(issue.id)}, context)


@tool(
    name="issues.search",
    description="Search issues by text",
    params=[
        ToolParam(name="query", type="string", description="Search query text", required=True),
        ToolParam(
            name="project_id", type="string",
            description="Project ID to search within (optional)",
            required=False
        ),
    ],
    return_type="List of matching issues",
    requires_project=False
)
def search_issues_tool(params: dict, context: ToolContext) -> list:
    """Search issues by text query."""
    query = params["query"]
    project_id = params.get("project_id")

    # Check permissions
    if project_id:
        # If project_id is provided, check project membership
        check_project_member(context, UUID(project_id), min_role=ROLE.GUEST)
        search_kwargs = {"workspace": context.workspace, "project_id": project_id}
    else:
        # Otherwise, check workspace membership and search across workspace
        from plane.hw.agent_tools.permissions import check_workspace_member
        check_workspace_member(context)
        search_kwargs = {"workspace": context.workspace}

    # Use the existing search function
    matching_issues = search_issues(query, **search_kwargs)

    # Format results
    result = []
    for issue in matching_issues:
        result.append({
            "id": str(issue.id),
            "name": issue.name,
            "sequence_id": issue.sequence_id,
            "project_id": str(issue.project_id),
            "priority": issue.priority,
            "state_id": str(issue.state_id)
        })

    return result