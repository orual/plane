"""Command-line interface for plane-hw-preview."""

import os
import shutil
import sys
from pathlib import Path

import click

from plane_preview.adapters.github import GitHubAdapter
from plane_preview.client import PlaneClient
from plane_preview.config import ConfigLoader
from plane_preview.renderer import Renderer
from plane_preview.resolver import IssueResolver
from plane_preview.types import PlaneAPIError, PreviewTarget


@click.group()
def main():
    """plane-hw-preview: Post hardware design previews to Plane issues."""
    pass


@main.command()
@click.option("--force", is_flag=True, help="Overwrite existing config file")
def init(force):
    """Copy template config to .plane-preview.yml in the current directory."""
    config_path = Path.cwd() / ".plane-preview.yml"

    if config_path.exists() and not force:
        click.echo(".plane-preview.yml already exists. Use --force to overwrite.")
        sys.exit(1)

    # Get template path
    template_path = Path(__file__).parent / "templates" / "plane-preview.yml"

    # Copy template to current directory
    shutil.copy2(template_path, config_path)

    click.echo("Created `.plane-preview.yml` — edit it with your Plane workspace settings.")


@main.command()
@click.option(
    "--adapter",
    type=click.Choice(["github"]),
    required=True,
    help="Git hosting adapter to use",
)
@click.option(
    "--config",
    type=click.Path(exists=True),
    default=".plane-preview.yml",
    help="Path to config file",
)
def post(adapter, config):
    """Post hardware preview renders to Plane issues."""
    try:
        # Load config
        config_path = Path(config)
        config_obj = ConfigLoader.load(config_path)

        # Validate PLANE_API_KEY
        api_key = os.getenv("PLANE_API_KEY")
        if not api_key:
            click.echo("Error: PLANE_API_KEY environment variable is not set.")
            sys.exit(1)

        # Extract commit info via adapter
        if adapter == "github":
            adapter_result = GitHubAdapter.extract()
        else:
            click.echo(f"Error: Unknown adapter '{adapter}'")
            sys.exit(1)

        # Resolve changed files to targets
        resolver = IssueResolver(config_obj)
        targets = resolver.resolve(list(adapter_result.changed_files), adapter_result.commit_message)

        if not targets:
            click.echo("No Plane issues matched. Nothing to post.")
            return

        # Render changed files
        renderer = Renderer(config_obj)
        render_results = renderer.render(list(adapter_result.changed_files))

        # Match render outputs to targets by source_path
        render_map: dict[str, list] = {}
        for rf in render_results:
            render_map.setdefault(rf.source_path, []).append(rf)
        matched_targets = []

        for target in targets:
            matched_files = []
            for placeholder_file in target.render_files:
                matched_files.extend(render_map.get(placeholder_file.source_path, []))

            if matched_files:
                matched_target = PreviewTarget(
                    project_id=target.project_id,
                    issue_id=target.issue_id,
                    render_files=tuple(matched_files),
                )
                matched_targets.append(matched_target)

        if not matched_targets:
            click.echo("No rendered files matched targets. Nothing to post.")
            return

        # Post previews via PlaneClient
        with PlaneClient(config_obj.base_url, api_key, config_obj.workspace) as client:
            client.post_preview(
                matched_targets,
                adapter_result.commit_sha,
                adapter_result.commit_url,
                adapter_result.branch,
            )

        click.echo(f"Posted previews to {len(matched_targets)} issue(s).")

    except PlaneAPIError as e:
        click.echo(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
