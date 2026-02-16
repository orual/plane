#!/usr/bin/env python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import argparse
import os
import subprocess
import sys
from pathlib import Path


def load_env():
    """Load .env file and override container hostnames with localhost.

    Django settings read from os.environ, which does NOT auto-load .env files.
    Docker compose loads .env for containerised services, but host-side pytest
    needs the variables injected into the process environment.

    After loading, we force DATABASE_URL, REDIS_URL, and RABBITMQ_HOST to point
    at localhost so tests can reach the compose services via exposed ports.
    The DATABASE_URL override is critical because the .env file uses shell
    interpolation (e.g. ${POSTGRES_HOST}) that bakes in container hostnames
    at source time, and Django checks DATABASE_URL first via dj_database_url.
    """
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        print(f"Warning: {env_path} not found — environment variables must be set manually")
        return

    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            # Skip lines with unresolved shell interpolation — we override these below.
            if "${" in value:
                continue
            os.environ.setdefault(key, value)

    # Override hostnames that point at container names with localhost.
    # These compose services expose their ports to the host.
    pg_user = os.environ.get("POSTGRES_USER", "plane")
    pg_pass = os.environ.get("POSTGRES_PASSWORD", "plane")
    pg_port = os.environ.get("POSTGRES_PORT", "5432")
    pg_db = os.environ.get("POSTGRES_DB", "plane")
    os.environ["DATABASE_URL"] = f"postgresql://{pg_user}:{pg_pass}@localhost:{pg_port}/{pg_db}"
    os.environ["REDIS_URL"] = f"redis://localhost:{os.environ.get('REDIS_PORT', '6379')}/"
    os.environ["RABBITMQ_HOST"] = "localhost"


def main():
    parser = argparse.ArgumentParser(description="Run Plane tests")
    parser.add_argument("-u", "--unit", action="store_true", help="Run unit tests only")
    parser.add_argument("-c", "--contract", action="store_true", help="Run contract tests only")
    parser.add_argument("-s", "--smoke", action="store_true", help="Run smoke tests only")
    parser.add_argument("-o", "--coverage", action="store_true", help="Generate coverage report")
    parser.add_argument("-p", "--parallel", action="store_true", help="Run tests in parallel")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    parser.add_argument(
        "--no-env", action="store_true", help="Skip auto-loading .env (use when env is already configured)"
    )
    args = parser.parse_args()

    if not args.no_env:
        load_env()

    # Build command
    cmd = ["python", "-m", "pytest"]
    markers = []

    # Add test markers
    if args.unit:
        markers.append("unit")
    if args.contract:
        markers.append("contract")
    if args.smoke:
        markers.append("smoke")

    # Add markers filter
    if markers:
        cmd.extend(["-m", " or ".join(markers)])

    # Add coverage
    if args.coverage:
        cmd.extend(["--cov=plane", "--cov-report=term", "--cov-report=html"])

    # Add parallel
    if args.parallel:
        cmd.extend(["-n", "auto"])

    # Add verbose
    if args.verbose:
        cmd.append("-v")

    # Add common flags
    cmd.extend(["--reuse-db", "--nomigrations"])

    # Print command
    print(f"Running: {' '.join(cmd)}")

    # Execute command
    result = subprocess.run(cmd)

    # Check coverage thresholds if coverage is enabled
    if args.coverage:
        print("Checking coverage thresholds...")
        coverage_cmd = ["python", "-m", "coverage", "report", "--fail-under=90"]
        coverage_result = subprocess.run(coverage_cmd)
        if coverage_result.returncode != 0:
            print("Coverage below threshold (90%)")
            sys.exit(coverage_result.returncode)

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
