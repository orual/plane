from plane.hw.agent_tools.registry import ToolError

# Import role constants from existing codebase
from plane.app.permissions.base import ROLE


def check_workspace_member(context, min_role: int = ROLE.GUEST) -> None:
    """Verify that the user is an active workspace member with sufficient role.

    Args:
        context: ToolContext containing user, workspace, and run
        min_role: Minimum role required (default: GUEST = 5)

    Raises:
        ToolError: If user is not a workspace member or role is insufficient
    """
    from plane.db.models.workspace import WorkspaceMember

    # Check if user is an active workspace member with sufficient role
    try:
        member = WorkspaceMember.objects.get(
            workspace=context.workspace,
            user=context.user,
            active=True
        )

        if member.role < min_role:
            raise ToolError(f"User role {member.role} is below minimum required {min_role}")

    except WorkspaceMember.DoesNotExist:
        raise ToolError(f"User is not a member of workspace {context.workspace.name}")


def check_project_member(context, project_id, min_role: int = ROLE.GUEST) -> None:
    """Verify that the user is an active project member with sufficient role.

    Workspace admins (role=20) bypass this check.

    Args:
        context: ToolContext containing user, workspace, and run
        project_id: UUID of the project to check
        min_role: Minimum role required (default: GUEST = 5)

    Raises:
        ToolError: If user is not a project member or role is insufficient
    """
    from plane.db.models.project import ProjectMember

    # Check if user is a workspace admin - they bypass project checks
    try:
        workspace_member = WorkspaceMember.objects.get(
            workspace=context.workspace,
            user=context.user,
            active=True
        )

        if workspace_member.role == ROLE.ADMIN:
            # Workspace admin has access to all projects
            return

    except WorkspaceMember.DoesNotExist:
        raise ToolError(f"User is not a member of workspace {context.workspace.name}")

    # Check if user is an active project member with sufficient role
    try:
        member = ProjectMember.objects.get(
            project_id=project_id,
            user=context.user,
            active=True
        )

        if member.role < min_role:
            raise ToolError(f"User role {member.role} is below minimum required {min_role}")

    except ProjectMember.DoesNotExist:
        raise ToolError(f"User is not a member of project {project_id}")