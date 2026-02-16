"""Command-line interface for plane-hw-preview."""

import shutil
from pathlib import Path

import click


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
        raise SystemExit(1)

    # Get template path
    template_path = Path(__file__).parent / "templates" / "plane-preview.yml"

    # Copy template to current directory
    shutil.copy2(template_path, config_path)

    click.echo("Created `.plane-preview.yml` — edit it with your Plane workspace settings.")


if __name__ == "__main__":
    main()
