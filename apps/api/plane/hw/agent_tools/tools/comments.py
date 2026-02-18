from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_project_member
from plane.db.models import IssueComment, Issue  # noqa: F401
from plane.app.permissions.base import ROLE


@tool(
    name="comments.list",
    description="List comments on an issue",
    params=[
        ToolParam(name="issue_id", type="string", description="Issue ID", required=True),
    ],
    return_type="List of comment objects",
    requires_project=True
)
def list_comments(params: dict, context: ToolContext) -> list:
    """List comments on an issue."""
    issue_id = UUID(params["issue_id"])

    # Get issue and check workspace
    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    # Check permissions (must be project member)
    check_project_member(context, issue.project_id, min_role=ROLE.GUEST)

    # Get comments
    comments = IssueComment.objects.filter(
        issue_id=issue_id,
        workspace=context.workspace
    ).select_related("actor").order_by("created_at")

    result = []
    for comment in comments:
        result.append({
            "id": str(comment.id),
            "comment_html": comment.comment_html,
            "actor": {
                "id": str(comment.actor.id),
                "display_name": comment.actor.display_name
            },
            "created_at": comment.created_at.isoformat()
        })

    return result


@tool(
    name="comments.create",
    description="Create a comment on an issue",
    params=[
        ToolParam(name="issue_id", type="string", description="Issue ID", required=True),
        ToolParam(name="comment_html", type="string", description="Comment content in HTML", required=True),
    ],
    return_type="Created comment object",
    requires_project=True
)
def create_comment(params: dict, context: ToolContext) -> dict:
    """Create a comment on an issue."""
    issue_id = UUID(params["issue_id"])

    # Get issue and check workspace
    issue = Issue.issue_objects.get(id=issue_id, workspace=context.workspace)

    # Check permissions (must be member or higher to comment)
    check_project_member(context, issue.project_id, min_role=ROLE.MEMBER)

    # Create the comment
    comment = IssueComment.objects.create(
        issue_id=issue_id,
        comment_html=params["comment_html"],
        actor=context.user,
        workspace=context.workspace
    )

    return {
        "id": str(comment.id),
        "comment_html": comment.comment_html,
        "actor": {
            "id": str(comment.actor.id),
            "display_name": comment.actor.display_name
        },
        "created_at": comment.created_at.isoformat()
    }