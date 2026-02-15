# Plane E2E Tests

End-to-end tests for Plane using Playwright. Tests cover critical user journeys including issue type management and custom properties.

## Prerequisites

- Node.js >= 22.18.0
- pnpm 10.24.0
- Nix dev shell (optional but recommended)
- Running Plane full-stack: API on port 8000, web app on port 3000

## Setup

Install dependencies:

```bash
cd e2e
pnpm install
```

## Running Tests

### In Nix dev shell

The Nix shell provides Chromium via `PLAYWRIGHT_BROWSERS_PATH`:

```bash
pnpm test
```

### Outside Nix shell

Playwright will download Chromium on first run:

```bash
cd e2e
pnpm install
pnpm test
```

### Running specific tests

```bash
# Run a single test file
pnpm test issue-types-create

# Run tests matching a pattern
pnpm test -g "Issue Type Creation"

# Run with UI
pnpm test:ui

# Run in headed mode (see browser)
pnpm test:headed

# Run in debug mode
pnpm test:debug
```

## Environment Variables

- `BASE_URL` - Web app base URL (default: `http://localhost:3000`)
- `API_BASE_URL` - API base URL (default: `http://localhost:8000`)
- `CI` - Set to true in CI environments
- `PLAYWRIGHT_BROWSERS_PATH` - Set by Nix shell, points to Chromium

## Test Structure

```
e2e/
├── fixtures/              # Test fixtures and setup
│   └── index.ts          # Shared fixtures (auth, data setup)
├── helpers/              # Helper functions
│   ├── api.ts           # API request helpers
│   ├── auth.ts          # Authentication helpers
│   ├── selectors.ts     # Common selectors
│   └── wait.ts          # Wait utility functions
├── tests/               # Test files
│   ├── issue-types-create.spec.ts
│   ├── issue-types-switching.spec.ts
│   ├── issue-types-filtering.spec.ts
│   └── properties-management.spec.ts
├── playwright.config.ts # Playwright configuration
└── tsconfig.json        # TypeScript configuration
```

## Test Data

Tests use API-based setup via fixtures. Each test:

1. Creates a unique workspace via API
2. Creates a project in that workspace
3. Creates issue types and test data as needed
4. Performs user actions in the browser
5. Verifies results via DOM assertions

Data is isolated per test run — no cleanup needed.

## Key Test Scenarios

### Issue Types

- Create new issue types with custom colors
- Switch issue type on existing issues
- Filter issues by type
- Validation: name is required, duplicate type handling

### Custom Properties

- Create/edit/delete custom fields
- Support for select, text, number types
- Set field visibility
- Property management in project settings

## Debugging

### See browser during test run

```bash
pnpm test:headed
```

### Step through test execution

```bash
pnpm test:debug
```

### View test report

After tests run, open the HTML report:

```bash
npx playwright show-report
```

### Check test results

```bash
# View test results in terminal
pnpm test -- --reporter=list

# Generate JUnit XML for CI
pnpm test -- --reporter=junit
```

## Troubleshooting

### Browser not found

If Playwright can't find Chromium:

1. Make sure you're in the Nix dev shell
2. Or run `pnpm install` to download Chromium
3. Check `PLAYWRIGHT_BROWSERS_PATH` is set

### Tests timeout

- Increase timeout in `playwright.config.ts`
- Check that dev servers are running (port 3000, 8000)
- Look at test output and browser screenshots

### Network errors

- Verify API is running on port 8000
- Check CORS headers if API is on different origin
- Look at browser console in debug mode

## CI/CD

For CI environments, set `CI=true`. Tests will:

- Run in single worker (no parallelism)
- Retry failed tests up to 2 times
- Record videos and screenshots on failure
- Generate HTML report

## Contributing

When adding new tests:

1. Use the fixtures for auth/data setup
2. Use helper functions for common actions
3. Use meaningful test names
4. Add comments for non-obvious steps
5. Run full test suite before committing

## See Also

- [Playwright Documentation](https://playwright.dev)
- [Plane API Documentation](http://localhost:8000/api-docs)
- [Main Plane README](../../README.md)
