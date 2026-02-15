#!/bin/bash
# Run Playwright tests with Nix environment variables

set -e

# Set Nix environment variables if in Nix dev shell
if [ -n "$PLAYWRIGHT_BROWSERS_PATH" ]; then
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
  export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="ubuntu-24.04"
fi

# Set API and web URLs
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"

# Run tests
pnpm exec playwright test "$@"
