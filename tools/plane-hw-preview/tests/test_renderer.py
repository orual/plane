"""Tests for plane_preview.renderer module."""

import subprocess
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from plane_preview.config import Config, RendererConfig
from plane_preview.renderer import Renderer


@pytest.mark.unit
class TestRenderer:
    """Test suite for Renderer class."""

    @pytest.fixture
    def basic_config(self):
        """Create a minimal Config with no renderers for auto-detect testing."""
        return Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=None,
        )

    def test_command_interpolation(self, basic_config, tmp_path):
        """Verify kicad-preview.AC4.1: Command interpolation replaces placeholders.

        Tests that {file}, {output_dir}, {config}, and {file_stem} are correctly
        replaced in the command template, and command is split via shlex.split().
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.kicad_sch",
                    command="echo {file} {output_dir} {config} {file_stem}",
                    config="/path/to/config.yaml",
                    formats=("svg",),
                ),
            ),
        )

        test_file = tmp_path / "test.kicad_sch"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

            renderer.render([str(test_file)])

            # Verify subprocess.run was called
            assert mock_run.called

            # Get the actual command args
            call_args = mock_run.call_args
            cmd_args = call_args[0][0]

            # Verify command was split into a list
            assert isinstance(cmd_args, list)

            # Verify placeholders were replaced (no literal braces remain)
            cmd_str = " ".join(cmd_args)
            assert "{file}" not in cmd_str
            assert "{output_dir}" not in cmd_str
            assert "{config}" not in cmd_str
            assert "{file_stem}" not in cmd_str

            # Verify actual values are present
            assert str(test_file.resolve()) in cmd_str
            assert "/path/to/config.yaml" in cmd_str
            assert "test" in cmd_str  # file_stem

    def test_output_files_collected_by_format(self, basic_config, tmp_path):
        """Verify kicad-preview.AC4.2: Output files matching formats are collected.

        Tests that rendered files matching configured formats are collected
        with correct MIME types.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.test",
                    command="echo test",
                    config="",
                    formats=("svg", "png"),
                ),
            ),
        )

        test_file = tmp_path / "test.test"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            # Create a temporary directory and output files
            with tempfile.TemporaryDirectory() as temp_out:
                out_svg = Path(temp_out) / "output.svg"
                out_svg.write_bytes(b"<svg></svg>")
                out_png = Path(temp_out) / "output.png"
                out_png.write_bytes(b"PNG")

                # Mock glob.glob to return our created files
                def mock_glob_func(pattern, recursive=False):
                    if "*.svg" in pattern:
                        return [str(out_svg)]
                    elif "*.png" in pattern:
                        return [str(out_png)]
                    return []

                mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

                with mock.patch("plane_preview.renderer.glob.glob", side_effect=mock_glob_func):
                    result = renderer.render([str(test_file)])

            # Verify files were collected
            assert len(result) == 2

            # Verify MIME types
            svg_files = [f for f in result if f.mime_type == "image/svg+xml"]
            png_files = [f for f in result if f.mime_type == "image/png"]

            assert len(svg_files) == 1
            assert len(png_files) == 1

    def test_kicad_cli_auto_detect_when_on_path(self, basic_config, tmp_path):
        """Verify kicad-preview.AC4.3: kicad-cli is auto-detected and used.

        Tests that when kicad-cli is on PATH and no explicit renderers are
        configured, default renderers for .kicad_sch and .kicad_pcb are created
        with kicad-cli commands.
        """
        test_file = tmp_path / "test.kicad_sch"
        test_file.write_text("dummy")

        with mock.patch("plane_preview.renderer.shutil.which") as mock_which:
            # kicad-cli exists, kibot does not
            def which_side_effect(cmd):
                if cmd == "kicad-cli":
                    return "/usr/bin/kicad-cli"
                return None

            mock_which.side_effect = which_side_effect

            renderer = Renderer(basic_config)

            # Verify default renderers were created
            assert len(renderer._renderers) > 0

            # Find the .kicad_sch renderer
            sch_renderer = None
            for r in renderer._renderers:
                if "kicad_sch" in r.match:
                    sch_renderer = r
                    break

            assert sch_renderer is not None
            assert "kicad-cli" in sch_renderer.command
            assert "sch export svg" in sch_renderer.command

        # Verify rendering works with mocked subprocess
        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

            with mock.patch("plane_preview.renderer.glob.glob", return_value=[]):
                renderer.render([str(test_file)])

            # Verify kicad-cli command was executed
            assert mock_run.called
            cmd_args = mock_run.call_args[0][0]
            assert "kicad-cli" in cmd_args[0]

    def test_kibot_fallback_when_kicad_cli_missing(self, basic_config, tmp_path):
        """Verify kicad-preview.AC4.3: KiBot is used as fallback when kicad-cli absent.

        Tests that when kicad-cli is not available but kibot is, default renderers
        are created with kibot commands and bundled template config paths.
        """
        test_file = tmp_path / "test.kicad_pcb"
        test_file.write_text("dummy")

        with mock.patch("plane_preview.renderer.shutil.which") as mock_which:
            # kicad-cli missing, kibot exists
            def which_side_effect(cmd):
                if cmd == "kibot":
                    return "/usr/bin/kibot"
                return None

            mock_which.side_effect = which_side_effect

            renderer = Renderer(basic_config)

            # Verify default renderers were created
            assert len(renderer._renderers) > 0

            # Find the .kicad_pcb renderer
            pcb_renderer = None
            for r in renderer._renderers:
                if "kicad_pcb" in r.match:
                    pcb_renderer = r
                    break

            assert pcb_renderer is not None
            assert "kibot" in pcb_renderer.command
            assert "-c {config}" in pcb_renderer.command
            # Config should be absolute path to template file
            assert pcb_renderer.config.endswith("kibot-pcb-preview.yaml")
            assert Path(pcb_renderer.config).is_absolute()

    def test_failed_render_skipped(self, basic_config, tmp_path, caplog):
        """Verify kicad-preview.AC4.4: Failed renders are logged and skipped.

        Tests that when subprocess returns non-zero exit code, the error is
        logged and processing continues with other files.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.test",
                    command="false",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        test_file = tmp_path / "test.test"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=1, stderr=b"render error: something failed")

            with caplog.at_level("ERROR"):
                result = renderer.render([str(test_file)])

            # Verify no files were returned
            assert len(result) == 0

            # Verify error was logged
            assert "render command failed" in caplog.text

    def test_failed_render_skipped_with_other_files(self, basic_config, tmp_path, caplog):
        """Verify failed renders don't prevent other files from rendering.

        Tests that if one file fails, other files continue to be processed.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.test",
                    command="echo test",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        test_file1 = tmp_path / "test1.test"
        test_file1.write_text("dummy")
        test_file2 = tmp_path / "test2.test"
        test_file2.write_text("dummy")

        renderer = Renderer(config)

        call_count = [0]

        def mock_run_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # First file fails
                return mock.Mock(returncode=1, stderr=b"failed")
            else:
                # Second file succeeds
                return mock.Mock(returncode=0, stderr=b"")

        with mock.patch("plane_preview.renderer.subprocess.run", side_effect=mock_run_side_effect):
            with mock.patch("plane_preview.renderer.glob.glob", return_value=[]):
                with caplog.at_level("ERROR"):
                    renderer.render([str(test_file1), str(test_file2)])

            # Verify subprocess was called twice (once for each file)
            assert call_count[0] == 2

    def test_no_renderer_available_shows_error(self, basic_config, tmp_path, caplog):
        """Verify kicad-preview.AC4.5: Error shown when no renderer available.

        Tests that when no renderers are configured and neither kicad-cli nor
        kibot is on PATH, attempting to render a KiCad file logs a clear error.
        """
        test_file = tmp_path / "test.kicad_sch"
        test_file.write_text("dummy")

        with mock.patch("plane_preview.renderer.shutil.which", return_value=None):
            renderer = Renderer(basic_config)

            # Verify no renderers were found
            assert renderer._renderer_missing is True

            with caplog.at_level("ERROR"):
                result = renderer.render([str(test_file)])

            # Verify file was skipped
            assert len(result) == 0

            # Verify helpful error message was logged
            assert "No KiCad renderer found" in caplog.text
            assert "Install KiCad" in caplog.text or "KiBot" in caplog.text

    def test_non_kicad_file_skipped_when_no_match(self, basic_config, tmp_path):
        """Verify that files not matching any renderer are silently skipped."""
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.specific_type",
                    command="echo test",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        # Non-matching file
        test_file = tmp_path / "test.other_type"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            result = renderer.render([str(test_file)])

            # Verify subprocess was not called
            assert not mock_run.called

            # Verify no files were returned
            assert len(result) == 0

    def test_file_stem_interpolation(self, basic_config, tmp_path):
        """Verify {file_stem} is interpolated correctly in commands.

        Tests that {file_stem} is replaced with the filename without extension.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.kicad_pcb",
                    command="echo {file_stem}",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        test_file = tmp_path / "my_board.kicad_pcb"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

            with mock.patch("plane_preview.renderer.glob.glob", return_value=[]):
                renderer.render([str(test_file)])

            # Get command args
            cmd_args = mock_run.call_args[0][0]
            cmd_str = " ".join(cmd_args)

            # Verify file_stem was interpolated
            assert "my_board" in cmd_str

    def test_subprocess_timeout_handled(self, basic_config, tmp_path, caplog):
        """Verify that subprocess timeouts are caught and logged.

        Tests that when a render command exceeds the 120 second timeout,
        the error is logged and processing continues.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.test",
                    command="sleep 1000",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        test_file = tmp_path / "test.test"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired("sleep 1000", 120)

            with caplog.at_level("ERROR"):
                result = renderer.render([str(test_file)])

            # Verify file was skipped
            assert len(result) == 0

            # Verify timeout error was logged
            assert "timed out" in caplog.text

    def test_mime_type_mapping(self, basic_config, tmp_path):
        """Verify all configured MIME types are correctly assigned."""
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.test",
                    command="echo test",
                    config="",
                    formats=("svg", "png", "pdf", "jpg"),
                ),
            ),
        )

        test_file = tmp_path / "test.test"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

            with tempfile.TemporaryDirectory() as temp_out:
                out_svg = Path(temp_out) / "output.svg"
                out_svg.write_bytes(b"<svg></svg>")
                out_png = Path(temp_out) / "output.png"
                out_png.write_bytes(b"PNG")
                out_pdf = Path(temp_out) / "output.pdf"
                out_pdf.write_bytes(b"%PDF")
                out_jpg = Path(temp_out) / "output.jpg"
                out_jpg.write_bytes(b"JPG")

                def mock_glob_func(pattern, recursive=False):
                    if "*.svg" in pattern:
                        return [str(out_svg)]
                    elif "*.png" in pattern:
                        return [str(out_png)]
                    elif "*.pdf" in pattern:
                        return [str(out_pdf)]
                    elif "*.jpg" in pattern:
                        return [str(out_jpg)]
                    return []

                with mock.patch("plane_preview.renderer.glob.glob", side_effect=mock_glob_func):
                    result = renderer.render([str(test_file)])

            # Verify correct MIME types
            assert len(result) == 4
            mime_types = {f.mime_type for f in result}
            assert "image/svg+xml" in mime_types
            assert "image/png" in mime_types
            assert "application/pdf" in mime_types
            assert "image/jpeg" in mime_types

    def test_multiple_renderers_match_same_file(self, basic_config, tmp_path):
        """Verify that all matching renderers run for a single file.

        When multiple renderer configs match the same file pattern, each one
        should execute its command and collect output independently.
        """
        config = Config(
            base_url="http://localhost:8000",
            workspace="test-workspace",
            commit_patterns=(),
            path_mappings=(),
            renderers=(
                RendererConfig(
                    match="**/*.kicad_pcb",
                    command="echo front {file}",
                    config="",
                    formats=("svg",),
                ),
                RendererConfig(
                    match="**/*.kicad_pcb",
                    command="echo back {file}",
                    config="",
                    formats=("svg",),
                ),
            ),
        )

        test_file = tmp_path / "board.kicad_pcb"
        test_file.write_text("dummy")

        renderer = Renderer(config)

        with mock.patch("plane_preview.renderer.subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=0, stderr=b"")

            with mock.patch("plane_preview.renderer.glob.glob", return_value=[]):
                renderer.render([str(test_file)])

            assert mock_run.call_count == 2

    def test_kicad_cli_pcb_defaults_produce_front_back_and_layers(self, basic_config):
        """Verify kicad-cli auto-detect creates front composite, back composite, and per-layer renderers for PCB.

        The default PCB renderers should produce three separate render passes:
        a front composite (F.Cu + F.SilkS + Edge.Cuts), a back composite
        (B.Cu + B.SilkS + Edge.Cuts), and individual copper layers via --mode-multi.
        """
        with mock.patch("plane_preview.renderer.shutil.which") as mock_which:
            mock_which.side_effect = lambda cmd: "/usr/bin/kicad-cli" if cmd == "kicad-cli" else None

            renderer = Renderer(basic_config)

            pcb_renderers = [r for r in renderer._renderers if "kicad_pcb" in r.match]

            assert len(pcb_renderers) == 3

            commands = [r.command for r in pcb_renderers]
            front_cmd = [c for c in commands if "front" in c]
            back_cmd = [c for c in commands if "back" in c]
            layer_cmd = [c for c in commands if "--mode-multi" in c]

            assert len(front_cmd) == 1, "Expected a front composite renderer"
            assert len(back_cmd) == 1, "Expected a back composite renderer"
            assert len(layer_cmd) == 1, "Expected a per-layer renderer"

            assert "--mode-single" in front_cmd[0]
            assert "F.Cu" in front_cmd[0]
            assert "F.SilkS" in front_cmd[0]

            assert "--mode-single" in back_cmd[0]
            assert "B.Cu" in back_cmd[0]
            assert "B.SilkS" in back_cmd[0]

            assert "In1.Cu" in layer_cmd[0]
            assert "B.Cu" in layer_cmd[0]
