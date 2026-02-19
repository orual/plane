from plane.hw.agent_tools.registry import tool, ToolParam, ToolContext
from plane.hw.agent_tools.permissions import check_workspace_member
from plane.db.models import WorkspaceMember
from plane.app.permissions.base import ROLE


@tool(
    name="users.list",
    description="List workspace members",
    params=[],
    return_type="Array of {id, display_name, email, avatar, role, workspace_id}",
    requires_project=False
)
def list_users(params: dict, context: ToolContext) -> list:
    """List workspace members."""
    check_workspace_member(context, min_role=ROLE.GUEST.value)

    members = WorkspaceMember.objects.filter(
        workspace=context.workspace,
        is_active=True
    ).select_related("member").order_by("member__display_name")

    result = []
    for wm in members:
        if wm.member.bot_type is None:
            result.append({
                "id": str(wm.member.id),
                "display_name": wm.member.display_name,
                "email": wm.member.email,
                "avatar": wm.member.avatar,
                "role": wm.role,
                "workspace_id": str(wm.workspace_id)
            })

    return result


@tool(
    name="users.search",
    description="Search users by name or email",
    params=[
        ToolParam(name="query", type="string", description="Search query text", required=True),
    ],
    return_type="Array of {id, display_name, email, avatar, role, workspace_id}",
    requires_project=False
)
def search_users(params: dict, context: ToolContext) -> list:
    """Search users by name or email."""
    query = params["query"]

    check_workspace_member(context, min_role=ROLE.GUEST.value)

    members = WorkspaceMember.objects.filter(
        workspace=context.workspace,
        is_active=True,
        member__display_name__icontains=query
    ).select_related("member")

    members = members.union(
        WorkspaceMember.objects.filter(
            workspace=context.workspace,
            is_active=True,
            member__email__icontains=query
        ).select_related("member")
    )

    result = []
    seen_ids = set()
    for wm in members:
        user_id = str(wm.member.id)
        if user_id not in seen_ids:
            if wm.member.bot_type is None:
                result.append({
                    "id": user_id,
                    "display_name": wm.member.display_name,
                    "email": wm.member.email,
                    "avatar": wm.member.avatar,
                    "role": wm.role,
                    "workspace_id": str(wm.workspace_id)
                })
            seen_ids.add(user_id)

    return result
