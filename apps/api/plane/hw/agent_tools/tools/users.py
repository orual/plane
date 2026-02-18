from uuid import UUID
from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_workspace_member
from plane.db.models import User, WorkspaceMember
from plane.app.permissions.base import ROLE


@tool(
    name="users.list",
    description="List workspace members",
    params=[
        # No params - lists all active members
    ],
    return_type="List of workspace member objects",
    requires_project=False
)
def list_users(params: dict, context: ToolContext) -> list:
    """List workspace members."""
    # Check workspace membership
    check_workspace_member(context, min_role=ROLE.GUEST)

    # Get active workspace members
    members = WorkspaceMember.objects.filter(
        workspace=context.workspace,
        active=True
    ).select_related("user").order_by("user__display_name")

    result = []
    for member in members:
        # Exclude bot users
        if member.user.bot_type is None:
            result.append({
                "id": str(member.user.id),
                "display_name": member.user.display_name,
                "email": member.user.email,
                "avatar": member.user.avatar,
                "role": member.role,
                "workspace_id": str(member.workspace_id)
            })

    return result


@tool(
    name="users.search",
    description="Search users by name or email",
    params=[
        ToolParam(name="query", type="string", description="Search query text", required=True),
    ],
    return_type="List of matching user objects",
    requires_project=False
)
def search_users(params: dict, context: ToolContext) -> list:
    """Search users by name or email."""
    query = params["query"]

    # Check workspace membership
    check_workspace_member(context, min_role=ROLE.GUEST)

    # Search for matching users
    members = WorkspaceMember.objects.filter(
        workspace=context.workspace,
        active=True,
        user__display_name__icontains=query
    ).select_related("user")

    # Also search by email
    from django.db.models import Q
    members = members.union(
        WorkspaceMember.objects.filter(
            workspace=context.workspace,
            active=True,
            user__email__icontains=query
        ).select_related("user")
    )

    result = []
    seen_ids = set()
    for member in members:
        user_id = str(member.user.id)
        if user_id not in seen_ids:
            # Exclude bot users
            if member.user.bot_type is None:
                result.append({
                    "id": user_id,
                    "display_name": member.user.display_name,
                    "email": member.user.email,
                    "avatar": member.user.avatar,
                    "role": member.role,
                    "workspace_id": str(member.workspace_id)
                })
            seen_ids.add(user_id)

    return result