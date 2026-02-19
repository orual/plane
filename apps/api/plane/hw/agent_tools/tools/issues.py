from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.hw.agent_tools.tools.resolve import resolve_project_id
from plane.utils.issue_search import search_issues
from plane.db.models import Issue, IssueAssignee, IssueLabel
from plane.app.permissions.base import ROLE


@tool(
    name="issues.list",
    description="List issues in a project",
    params=[
        ToolParam(
            name="project_id", type="string",
            description="Project UUID or identifier (e.g. 'TP')", required=True,
        ),
        ToolParam(name="state_id", type="string", description="Filter by state ID", required=False),
        ToolParam(name="priority", type="string", description="Filter by priority", required=False),
        ToolParam(name="assignee_id", type="string", description="Filter by assignee ID", required=False),
        ToolParam(
            name="limit", type="integer",
            description="Max results to return (default 50, max 200)", required=False,
        ),
        ToolParam(
            name="offset", type="integer",
            description="Number of results to skip for pagination (default 0)", required=False,
        ),
    ],
    return_type="Array of {id, name, state_id, priority, sequence_id, assignees, labels, project_id}",
    requires_project=True
)
def list_issues(params: dict, context: ToolContext) -> list:
    """List issues in a project with optional filters."""
    project_id = resolve_project_id(params["project_id"], context.workspace)

    check_project_member(context, project_id, min_role=ROLE.GUEST.value)

    issues_qs = Issue.issue_objects.filter(
        workspace=context.workspace,
        project_id=project_id
    )

    if "state_id" in params:
        issues_qs = issues_qs.filter(state_id=params["state_id"])
    if "priority" in params:
        issues_qs = issues_qs.filter(priority=params["priority"])
    if "assignee_id" in params:
        issues_qs = issues_qs.filter(assignees__id=params["assignee_id"])

    limit = min(int(params.get("limit", 50)), 200)
    offset = int(params.get("offset", 0))
    issues = issues_qs.select_related(
        "state", "project"
    ).prefetch_related("assignees", "labels").order_by("-created_at")[offset:offset + limit]

    result = []
    for issue in issues:
        assignees = [
            {"id": str(user.id), "display_name": user.display_name}
            for user in issue.assignees.all()
        ]
        labels = [
            {"id": str(label.id), "name": label.name, "color": label.color}
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
    description=(
        "Get a single issue by ID. The description is windowed: by default "
        "returns the first 2000 characters. Use description_offset and "
        "description_limit to page through longer descriptions."
    ),
    params=[
        ToolParam(name="issue_id", type="string", description="Issue ID", required=True),
        ToolParam(
            name="description_offset", type="integer",
            description="Character offset into description_html (default 0)",
            required=False,
        ),
        ToolParam(
            name="description_limit", type="integer",
            description="Max characters of description_html to return (default 2000, max 10000)",
            required=False,
        ),
    ],
    return_type=(
        "{id, name, description_html, description_total_length, "
        "description_truncated, state_id, priority, sequence_id, "
        "assignees, labels, project_id, created_at, updated_at}"
    ),
    requires_project=True
)
def get_issue(params: dict, context: ToolContext) -> dict:
    """Get a single issue by ID with windowed description."""
    issue_id = UUID(params["issue_id"])

    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    check_project_member(context, issue.project_id, min_role=ROLE.GUEST.value)

    assignees = [
        {
            "id": str(user.id),
            "display_name": user.display_name,
            "email": user.email
        }
        for user in issue.assignees.all()
    ]

    labels = [
        {"id": str(label.id), "name": label.name, "color": label.color}
        for label in issue.labels.all()
    ]

    full_desc = issue.description_html or ""
    desc_offset = int(params.get("description_offset", 0))
    desc_limit = min(int(params.get("description_limit", 2000)), 10000)
    windowed_desc = full_desc[desc_offset:desc_offset + desc_limit]

    return {
        "id": str(issue.id),
        "name": issue.name,
        "description_html": windowed_desc,
        "description_total_length": len(full_desc),
        "description_truncated": len(full_desc) > desc_offset + desc_limit,
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
        ToolParam(
            name="project_id", type="string",
            description="Project UUID or identifier (e.g. 'TP')", required=True,
        ),
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
    return_type="Same as issues.get return type",
    requires_project=True
)
def create_issue(params: dict, context: ToolContext) -> dict:
    """Create a new issue."""
    project_id = resolve_project_id(params["project_id"], context.workspace)

    check_project_member(context, project_id, min_role=ROLE.MEMBER.value)

    issue = Issue.objects.create(
        project_id=project_id,
        workspace=context.workspace,
        name=params["name"],
        description_html=params.get("description_html", ""),
        priority=params.get("priority"),
        state_id=params.get("state_id"),
        created_by=context.actor,
        updated_by=context.actor
    )

    if "assignee_ids" in params:
        for aid in params["assignee_ids"]:
            IssueAssignee.objects.create(
                issue=issue,
                project_id=project_id,
                workspace=context.workspace,
                assignee_id=UUID(aid),
                created_by=context.actor,
                updated_by=context.actor
            )

    if "label_ids" in params:
        for lid in params["label_ids"]:
            IssueLabel.objects.create(
                issue=issue,
                project_id=project_id,
                workspace=context.workspace,
                label_id=UUID(lid),
                created_by=context.actor,
                updated_by=context.actor
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
    return_type="Same as issues.get return type",
    requires_project=True
)
def update_issue(params: dict, context: ToolContext) -> dict:
    """Update an existing issue."""
    issue_id = UUID(params["issue_id"])

    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    check_project_member(context, issue.project_id, min_role=ROLE.MEMBER.value)

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

    issue.updated_by = context.actor
    issue.save(update_fields=update_fields)

    if "assignee_ids" in params:
        IssueAssignee.objects.filter(issue=issue).delete()
        for aid in params["assignee_ids"]:
            IssueAssignee.objects.create(
                issue=issue,
                project_id=issue.project_id,
                workspace=context.workspace,
                assignee_id=UUID(aid),
                created_by=context.actor,
                updated_by=context.actor
            )

    if "label_ids" in params:
        IssueLabel.objects.filter(issue=issue).delete()
        for lid in params["label_ids"]:
            IssueLabel.objects.create(
                issue=issue,
                project_id=issue.project_id,
                workspace=context.workspace,
                label_id=UUID(lid),
                created_by=context.actor,
                updated_by=context.actor
            )

    return get_issue({"issue_id": str(issue.id)}, context)


@tool(
    name="issues.search",
    description="Search issues by text",
    params=[
        ToolParam(name="query", type="string", description="Search query text", required=True),
        ToolParam(
            name="project_id", type="string",
            description="Project UUID or identifier to search within (optional)",
            required=False
        ),
    ],
    return_type="Array of {id, name, sequence_id, project_id, priority, state_id}",
    requires_project=False
)
def search_issues_tool(params: dict, context: ToolContext) -> list:
    """Search issues by text query."""
    query = params["query"]
    project_id = params.get("project_id")

    base_qs = Issue.issue_objects.filter(workspace=context.workspace)

    if project_id:
        resolved_pid = resolve_project_id(project_id, context.workspace)
        check_project_member(context, resolved_pid, min_role=ROLE.GUEST.value)
        base_qs = base_qs.filter(project_id=resolved_pid)
    else:
        from plane.hw.agent_tools.permissions import check_workspace_member
        check_workspace_member(context)

    matching_issues = search_issues(query, base_qs)[:50]

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
