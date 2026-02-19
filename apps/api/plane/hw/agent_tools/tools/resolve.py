"""Shared resolution helpers for agent tools.

Allows tools to accept human-friendly identifiers (e.g. project identifier "TP")
in addition to raw UUIDs, so the LLM doesn't have to list-then-lookup every time.
"""

from uuid import UUID

from plane.db.models import Project


def resolve_project_id(value: str, workspace) -> UUID:
    """Resolve a project reference to its UUID.

    Accepts either a UUID string or a project identifier (e.g. "TP").
    Falls back to case-insensitive identifier match.

    Args:
        value: UUID string or project identifier
        workspace: Workspace to scope the lookup

    Returns:
        Project UUID

    Raises:
        Project.DoesNotExist: If no matching project found
    """
    try:
        project_uuid = UUID(value)
        if Project.objects.filter(id=project_uuid, workspace=workspace).exists():
            return project_uuid
    except ValueError:
        pass

    project = Project.objects.get(
        identifier__iexact=value,
        workspace=workspace,
        archived_at__isnull=True,
    )
    return project.id
