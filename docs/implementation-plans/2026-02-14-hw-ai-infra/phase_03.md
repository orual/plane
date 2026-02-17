# HW AI Infrastructure Implementation Plan — Phase 3

**Goal:** Ship the `plane-mcp-server` as an out-of-the-box Docker sidecar in both compose files.

**Architecture:** The upstream `plane-mcp-server` PyPI package (v0.2.3, FastMCP-based) runs in a thin Python Alpine container on the shared Docker network. It connects to the API container via internal hostname (`api:8000`) and exposes port 8001 externally for MCP clients (Claude Code, Cursor, etc.). The server runs in HTTP transport mode, serving at `/mcp`.

**Tech Stack:** Docker, Python 3.12 Alpine, plane-mcp-server 0.2.3

**Scope:** 8 phases from original design (phase 3 of 8)

**Codebase verified:** 2026-02-15

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-ai-infra.AC6: MCP server runs as a sidecar container
- **hw-ai-infra.AC6.1 Success:** `docker compose up` starts the MCP server alongside other services
- **hw-ai-infra.AC6.2 Success:** MCP server connects to the API on the internal network (`api:8000`)
- **hw-ai-infra.AC6.3 Success:** External MCP clients can connect to `localhost:8001` and list/execute tools
- **hw-ai-infra.AC6.4 Failure:** MCP server without a valid `MCP_API_KEY` fails with a clear error, doesn't crash-loop
- **hw-ai-infra.AC6.5 Success:** Both `docker-compose-local.yml` and `docker-compose.yml` include the MCP service

---

<!-- START_TASK_1 -->
### Task 1: Create MCP server Dockerfile

**Files:**
- Create: `mcp/Dockerfile`

**Step 1: Create the Dockerfile**

Create `mcp/Dockerfile`:

```dockerfile
FROM python:3.12.5-alpine

WORKDIR /app

RUN pip install --no-cache-dir plane-mcp-server==0.2.3

ENV PLANE_BASE_URL=http://api:8000
ENV PLANE_WORKSPACE_SLUG=""
ENV PLANE_API_KEY=""
ENV MCP_PORT=8001

EXPOSE 8001

CMD ["sh", "-c", "plane-mcp-server http --host 0.0.0.0 --port ${MCP_PORT}"]
```

Note: The `plane-mcp-server` uses `PLANE_API_KEY` and `PLANE_WORKSPACE_SLUG` environment variables for authentication. `PLANE_BASE_URL` points to the internal API container. We expose on 8001 to avoid conflicting with the API on 8000.

**Step 2: Verify the Dockerfile builds**

Run: `docker build -t plane-mcp-test mcp/`
Expected: Builds successfully

**Step 3: Commit**

```bash
git add mcp/Dockerfile
git commit -m "feat: add MCP server Dockerfile"
```
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Add MCP service to docker-compose-local.yml

**Files:**
- Modify: `docker-compose-local.yml`

**Step 1: Add the plane-mcp service**

Add a new service after the existing `beat-worker` service (around line 185), before the `migrator` service. Follow the existing service patterns in the file:

```yaml
  plane-mcp:
    build:
      context: .
      dockerfile: mcp/Dockerfile
    restart: unless-stopped
    networks:
      - dev_env
    ports:
      - "8001:8001"
    env_file:
      - .env
    environment:
      PLANE_BASE_URL: http://api:8000
      PLANE_API_KEY: ${MCP_API_KEY:-}
      PLANE_WORKSPACE_SLUG: ${MCP_WORKSPACE_SLUG:-}
    depends_on:
      - api
```

Key decisions:
- Uses the local Dockerfile build (consistent with other dev services)
- Joins `dev_env` network for internal DNS resolution
- Maps port 8001 to host for external MCP clients
- `PLANE_BASE_URL` points to the API container via internal hostname
- `MCP_API_KEY` and `MCP_WORKSPACE_SLUG` are read from `.env` file
- `depends_on: api` ensures API is running first
- `restart: unless-stopped` for local dev (not `always`)

**Step 2: Verify compose config parses**

Run: `docker compose -f docker-compose-local.yml config --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add docker-compose-local.yml
git commit -m "feat: add plane-mcp service to local compose"
```
<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add MCP service to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add the plane-mcp service**

Add a new service in the production compose file. Follow the production patterns (explicit `container_name`, `restart: always`, image reference):

```yaml
  plane-mcp:
    container_name: plane-mcp
    image: ${DOCKER_REGISTRY:-makeplane}/plane-mcp:${APP_RELEASE:-stable}
    restart: always
    command: >
      sh -c "plane-mcp-server http --host 0.0.0.0 --port 8001"
    ports:
      - "8001:8001"
    environment:
      PLANE_BASE_URL: http://api:8000
      PLANE_API_KEY: ${MCP_API_KEY:-}
      PLANE_WORKSPACE_SLUG: ${MCP_WORKSPACE_SLUG:-}
    depends_on:
      - api
```

Note: For initial implementation, use `build:` pointing at `./mcp` instead of `image:` since there is no CI pipeline publishing this image yet. Switch to `image:` when CI is configured to build and push the `plane-mcp` image. Use `build:` as the default for now — the executor should replace the `image:` line above with `build: ./mcp` to match the local compose pattern.

**Step 2: Verify compose config parses**

Run: `docker compose config --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add plane-mcp service to production compose"
```
<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Add MCP environment variables to .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Add MCP configuration section**

Add a new section to `.env.example` following the existing documentation pattern (comments explaining each variable):

```bash
# MCP Server Settings
# API key for the MCP server to authenticate against Plane API
MCP_API_KEY=""
# Workspace slug that the MCP server provides access to
MCP_WORKSPACE_SLUG=""
```

Place this after the existing AI/LLM settings section if one exists, or after the AWS/S3 settings section.

**Step 2: Verify file is valid**

Run: `cat .env.example | head -5`
Expected: File reads correctly, no syntax errors

**Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add MCP server environment variables to .env.example"
```
<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Verify MCP sidecar starts and handles missing credentials

**Verifies:** hw-ai-infra.AC6.1, hw-ai-infra.AC6.4

**Files:**
- No code changes — verification task

**Step 1: Verify the service starts with credentials**

If you have a running local Plane instance, add `MCP_API_KEY` and `MCP_WORKSPACE_SLUG` to your `.env` and run:

```bash
docker compose -f docker-compose-local.yml up plane-mcp -d
docker compose -f docker-compose-local.yml logs plane-mcp
```

Expected: Service starts, logs show MCP server listening on port 8001.

**Step 2: Verify behaviour without credentials**

Start the MCP service without setting `MCP_API_KEY`:

```bash
MCP_API_KEY="" docker compose -f docker-compose-local.yml up plane-mcp
```

Expected: The service should start but fail gracefully when attempting to connect to the Plane API. It should NOT crash-loop (the `restart: unless-stopped` policy will restart it, but it should log a clear error about the missing API key).

If the upstream `plane-mcp-server` crash-loops on missing credentials, consider adding an entrypoint script that validates `PLANE_API_KEY` is non-empty before starting, and exits with a clear error message instead.

**Step 3: No commit needed — verification only.**
<!-- END_TASK_5 -->
