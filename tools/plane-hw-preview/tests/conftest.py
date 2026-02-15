import pytest
from pathlib import Path
from plane_preview.types import RenderFile, PreviewTarget


@pytest.fixture
def render_file_factory(tmp_path):
    """Factory fixture to create RenderFile instances with real temp files."""
    def _create(source_path="board.kicad_pcb", filename="board-pcb.svg",
                content=b"<svg></svg>", mime_type="image/svg+xml"):
        render_path = tmp_path / filename
        render_path.write_bytes(content)
        return RenderFile(
            source_path=source_path,
            render_path=render_path,
            mime_type=mime_type,
        )
    return _create


@pytest.fixture
def preview_target_factory(render_file_factory):
    """Factory fixture to create PreviewTarget instances."""
    def _create(project_id="proj-uuid", issue_id="issue-uuid", render_files=None):
        if render_files is None:
            render_files = (render_file_factory(),)
        return PreviewTarget(
            project_id=project_id,
            issue_id=issue_id,
            render_files=render_files,
        )
    return _create
