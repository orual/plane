"""Render KiCad files using configurable commands and auto-detect renderers."""

import glob
import logging
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

from plane_preview.config import Config, RendererConfig
from plane_preview.types import RenderFile

logger = logging.getLogger(__name__)

MIME_TYPES = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
}


class Renderer:
    """Executes configurable render commands for KiCad files.

    Matches changed files against renderer configs, interpolates command templates,
    executes via subprocess, and collects output files by format.

    When no explicit renderer config exists, auto-detects available renderers:
    first kicad-cli (built into KiCad), then KiBot (requires config file).
    """

    def __init__(self, config: Config) -> None:
        """Initialize Renderer with config and auto-detect if needed.

        Args:
            config: Configuration object containing renderer specs.

        If config.renderers is None, attempts to auto-detect available renderers
        by checking for kicad-cli or kibot on PATH.
        """
        self.config = config
        self._renderer_missing = False
        self._renderers: tuple[RendererConfig, ...]

        if config.renderers is None:
            self._renderers = self._build_default_renderers()
        else:
            self._renderers = config.renderers

    def _build_default_renderers(self) -> tuple[RendererConfig, ...]:
        """Build default renderers using auto-detection priority.

        Priority 1: kicad-cli (built into KiCad, no config file needed)
        Priority 2: KiBot (requires generated config file)

        Returns:
            Tuple of RendererConfig for detected renderers. Empty tuple if neither found.
        """
        renderers = []

        # Check for kicad-cli first
        if shutil.which("kicad-cli"):
            renderers.extend(self._create_kicad_cli_renderers())
            return tuple(renderers)

        # Fall back to KiBot
        if shutil.which("kibot"):
            renderers.extend(self._create_kibot_renderers())
            return tuple(renderers)

        # Neither found
        self._renderer_missing = True
        return tuple(renderers)

    def _create_kicad_cli_renderers(self) -> list[RendererConfig]:
        """Create default renderers for kicad-cli.

        Returns:
            List of two RendererConfig entries for .kicad_sch and .kicad_pcb.
        """
        return [
            RendererConfig(
                match="**/*.kicad_sch",
                command="kicad-cli sch export svg -o {output_dir} {file}",
                config="",
                formats=("svg",),
            ),
            RendererConfig(
                match="**/*.kicad_pcb",
                command="kicad-cli pcb export svg -o {output_dir}/{file_stem}-pcb.svg --layers F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts --page-size-mode 2 {file}",
                config="",
                formats=("svg",),
            ),
        ]

    def _create_kibot_renderers(self) -> list[RendererConfig]:
        """Create default renderers for KiBot with bundled template configs.

        Returns:
            List of two RendererConfig entries for .kicad_sch and .kicad_pcb.
        """
        templates_dir = Path(__file__).parent / "templates"
        sch_config = str(templates_dir / "kibot-sch-preview.yaml")
        pcb_config = str(templates_dir / "kibot-pcb-preview.yaml")

        return [
            RendererConfig(
                match="**/*.kicad_sch",
                command="kibot -c {config} -d {output_dir} -b {file}",
                config=sch_config,
                formats=("svg",),
            ),
            RendererConfig(
                match="**/*.kicad_pcb",
                command="kibot -c {config} -d {output_dir} -b {file}",
                config=pcb_config,
                formats=("svg",),
            ),
        ]

    def render(self, changed_files: list[str]) -> list[RenderFile]:
        """Render changed files matching configured renderer rules.

        Args:
            changed_files: List of file paths (relative or absolute) to render.

        Returns:
            List of RenderFile objects for successfully rendered outputs.
            Failed renders are logged and skipped; processing continues.
        """
        render_files = []

        for file_path in changed_files:
            abs_path = Path(file_path).resolve()

            # Find matching renderer config
            renderer_config = self._find_matching_renderer(file_path)
            if renderer_config is None:
                # Check if this is a KiCad file we should have rendered
                if self._is_kicad_file(file_path) and self._renderer_missing:
                    logger.error(
                        "No KiCad renderer found. Install KiCad (for kicad-cli) or KiBot, "
                        "or configure a custom renderer in .plane-preview.yml"
                    )
                continue

            # Create temporary output directory
            output_dir = tempfile.mkdtemp()

            # Interpolate command template
            file_stem = abs_path.stem
            cmd_str = renderer_config.command.format(
                file=str(abs_path),
                output_dir=output_dir,
                config=renderer_config.config,
                file_stem=file_stem,
            )

            # Split and execute command
            cmd_args = shlex.split(cmd_str)
            try:
                result = subprocess.run(cmd_args, capture_output=True, timeout=120)
            except subprocess.TimeoutExpired:
                logger.error(f"render command timed out for {file_path}")
                continue
            except Exception as e:
                logger.error(f"failed to execute render command for {file_path}: {e}")
                continue

            if result.returncode != 0:
                logger.error(
                    f"render command failed for {file_path}: {result.stderr.decode('utf-8', errors='replace')}"
                )
                continue

            # Collect output files by format
            collected = self._collect_output_files(output_dir, file_path, renderer_config.formats)
            render_files.extend(collected)

        return render_files

    def _find_matching_renderer(self, file_path: str) -> RendererConfig | None:
        """Find the first renderer config matching the given file.

        Args:
            file_path: File path to match against renderer patterns.

        Returns:
            Matching RendererConfig, or None if no match found.
        """
        import fnmatch

        for renderer in self._renderers:
            if fnmatch.fnmatch(file_path, renderer.match):
                return renderer
        return None

    def _is_kicad_file(self, file_path: str) -> bool:
        """Check if file is a KiCad file that requires a renderer.

        Args:
            file_path: File path to check.

        Returns:
            True if file is .kicad_sch or .kicad_pcb.
        """
        return file_path.endswith(".kicad_sch") or file_path.endswith(".kicad_pcb")

    def _collect_output_files(
        self, output_dir: str, source_path: str, formats: tuple[str, ...]
    ) -> list[RenderFile]:
        """Collect output files from render directory by configured format.

        Args:
            output_dir: Temporary directory where render command wrote output.
            source_path: Relative path of the original KiCad file.
            formats: Tuple of file formats to collect (e.g., ("svg", "png")).

        Returns:
            List of RenderFile objects for collected output files.
        """
        render_files = []

        for fmt in formats:
            # Search recursively for files matching the format
            pattern = str(Path(output_dir) / f"**/*.{fmt}")
            for output_path in glob.glob(pattern, recursive=True):
                mime_type = MIME_TYPES.get(fmt, f"application/{fmt}")
                render_files.append(
                    RenderFile(
                        source_path=source_path,
                        render_path=Path(output_path),
                        mime_type=mime_type,
                    )
                )

        return render_files
