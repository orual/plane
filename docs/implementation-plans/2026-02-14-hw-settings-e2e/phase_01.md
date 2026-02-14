# HW Settings E2E — Phase 1: Upload Proxy

**Goal:** Create a Django DEBUG-only reverse proxy that routes `/uploads/*` to MinIO, enabling project creation and file uploads in local development without a separate proxy container.

**Architecture:** A standalone Django view function (not a ViewSet) in `plane.hw.views.proxy` that accepts GET/HEAD requests for `/uploads/{path}`, forwards them to MinIO via the `requests` library with streaming, and returns a `StreamingHttpResponse`. The URL pattern is registered in `plane/urls.py` inside an `if settings.DEBUG:` guard. This is an infrastructure phase — no unit tests, verified operationally.

**Tech Stack:** Django 4.2, Python `requests` library, MinIO (S3-compatible)

**Scope:** 1 of 5 phases from original design

**Codebase verified:** 2026-02-14

---

## Acceptance Criteria Coverage

This phase implements and tests:

### hw-settings-e2e.AC1: Django dev middleware proxies `/uploads/*` to MinIO

- **hw-settings-e2e.AC1.1 Success:** With `DEBUG=True`, a GET request to `http://localhost:8000/uploads/{any-valid-path}` returns the corresponding object from MinIO with correct `Content-Type` and status 200.
- **hw-settings-e2e.AC1.2 Success:** With `DEBUG=True`, a HEAD request to the same URL returns headers without a body.
- **hw-settings-e2e.AC1.3 Security:** With `DEBUG=False`, requests to `/uploads/*` are never routed to the proxy view (URL pattern not registered or view returns 403).
- **hw-settings-e2e.AC1.4 Security:** Paths containing `..` are rejected by the URL regex and never reach the view.
- **hw-settings-e2e.AC1.5 Security:** POST/PUT/DELETE requests to `/uploads/*` return 405 Method Not Allowed.
- **hw-settings-e2e.AC1.6 Error:** When MinIO is unreachable, the proxy returns 502; when MinIO times out, it returns 504. Both are logged.
- **hw-settings-e2e.AC1.7 Integration:** Project creation succeeds in the local dev stack (cover image upload completes without 404).

---

<!-- START_TASK_1 -->

### Task 1: Add `requests` to base requirements

**Verifies:** None (infrastructure prerequisite)

**Files:**

- Modify: `apps/api/requirements/base.txt` (add `requests` dependency)

**Implementation:**

Add the `requests` library to `apps/api/requirements/base.txt`. The library is already in `test.txt` at version 2.32.4 — use the same version for consistency. Add it after the `# html sanitizer` / `nh3` entry (end of file), with a comment indicating its purpose.

> **Design plan correction:** The design plan (line 116) states "`requests` already in `apps/api/requirements/base.txt`" — this is incorrect. `requests` is only in `test.txt`. This task correctly adds it to `base.txt` as a runtime dependency needed by the proxy view.

```
# http client (used by upload proxy)
requests==2.32.4
```

**Verification:**

Run from `apps/api/`:

```bash
pip install -r requirements/base.txt
```

Expected: Installs without errors. `requests` already likely available as transitive dependency of other packages, but this makes it explicit.

**Commit:** `chore(api): add requests to base requirements for upload proxy`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->

### Task 2: Create the proxy view

**Verifies:** hw-settings-e2e.AC1.1, hw-settings-e2e.AC1.2, hw-settings-e2e.AC1.3, hw-settings-e2e.AC1.5, hw-settings-e2e.AC1.6

**Files:**

- Create: `apps/api/plane/hw/views/proxy.py`

**Implementation:**

Create the file `apps/api/plane/hw/views/proxy.py` with a single view function `proxy_minio_upload`. This is NOT a ViewSet — it's a plain Django view function because:

- It doesn't need DRF authentication (uploads are public/presigned)
- It doesn't need serializers or querysets
- It's simpler and has fewer dependencies

The view must:

1. **Defense in depth:** Return `HttpResponseForbidden` immediately if `settings.DEBUG` is False (beyond the URL guard).
2. **Method check:** Only allow GET and HEAD. Return `HttpResponseNotAllowed` for anything else.
3. **Build MinIO URL:** Construct `{settings.AWS_S3_ENDPOINT_URL}/{settings.AWS_S3_BUCKET_NAME}/{path}` where `path` is the captured URL parameter. (Improvement over design: uses dynamic `AWS_S3_BUCKET_NAME` instead of hardcoded `/uploads/`, correctly handling environments where the bucket name differs.)
4. **Forward request to MinIO:** Use `requests.get()` with `stream=True` and a 30-second timeout.
5. **Stream response:** Return a `StreamingHttpResponse` that iterates over the upstream response in 8KB chunks.
6. **Pass through headers:** Copy `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`, `Cache-Control`, `Content-Disposition` from the MinIO response.
7. **HEAD handling:** For HEAD requests, still make a GET to MinIO but return `HttpResponse` with headers only (no body). Alternatively, use `requests.head()`.
8. **Error handling:**
   - `requests.exceptions.ConnectionError` → 502 Bad Gateway, log error
   - `requests.exceptions.Timeout` → 504 Gateway Timeout, log error
   - Non-200 MinIO response → pass through the status code

Use `logging.getLogger("plane.proxy")` for logging.

```python
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""DEBUG-only reverse proxy for MinIO uploads."""

import logging

import requests as http_client
from django.conf import settings
from django.http import (
    HttpResponse,
    HttpResponseForbidden,
    HttpResponseNotAllowed,
    StreamingHttpResponse,
)

logger = logging.getLogger("plane.proxy")

# Headers to copy from the MinIO response to the Django response
PASSTHROUGH_HEADERS = (
    "Content-Type",
    "Content-Length",
    "ETag",
    "Last-Modified",
    "Cache-Control",
    "Content-Disposition",
)

PROXY_TIMEOUT = 30  # seconds


def proxy_minio_upload(request, path):
    """Proxy GET/HEAD requests for /uploads/* to MinIO.

    Only active when DEBUG=True. Returns 403 otherwise (defense in depth).
    """
    if not settings.DEBUG:
        return HttpResponseForbidden()

    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])

    bucket = getattr(settings, "AWS_S3_BUCKET_NAME", "uploads")
    minio_url = f"{settings.AWS_S3_ENDPOINT_URL}/{bucket}/{path}"

    try:
        if request.method == "HEAD":
            upstream = http_client.head(minio_url, timeout=PROXY_TIMEOUT)
            response = HttpResponse(status=upstream.status_code)
        else:
            upstream = http_client.get(
                minio_url, stream=True, timeout=PROXY_TIMEOUT
            )
            if upstream.status_code == 200:
                response = StreamingHttpResponse(
                    upstream.iter_content(chunk_size=8192),
                    status=200,
                )
            else:
                response = HttpResponse(
                    upstream.content, status=upstream.status_code
                )

        for header in PASSTHROUGH_HEADERS:
            value = upstream.headers.get(header)
            if value is not None:
                response[header] = value

        return response

    except http_client.exceptions.ConnectionError:
        logger.error("MinIO connection error proxying %s", minio_url)
        return HttpResponse("Bad Gateway", status=502)
    except http_client.exceptions.Timeout:
        logger.error("MinIO timeout proxying %s", minio_url)
        return HttpResponse("Gateway Timeout", status=504)
```

**Verification:**

Check the file has no syntax errors:

```bash
cd apps/api && python -c "from plane.hw.views.proxy import proxy_minio_upload; print('OK')"
```

Expected: `OK`

**Commit:** `feat(api): add DEBUG-only MinIO upload proxy view`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->

### Task 3: Export the proxy view from the hw views package

**Verifies:** None (wiring prerequisite)

**Files:**

- Modify: `apps/api/plane/hw/views/__init__.py` (add import)

**Implementation:**

The current `apps/api/plane/hw/views/__init__.py` exports `IssueTypeViewSet`, `ProjectIssueTypeViewSet`, `PropertyDefinitionViewSet`, `IssuePropertyValueViewSet`. Add the proxy view import:

Add after the existing imports:

```python
from .proxy import proxy_minio_upload
```

Add `"proxy_minio_upload"` to the `__all__` list.

**Verification:**

```bash
cd apps/api && python -c "from plane.hw.views import proxy_minio_upload; print('OK')"
```

Expected: `OK`

**Commit:** `chore(api): export proxy_minio_upload from hw views`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->

### Task 4: Wire the URL pattern into `plane/urls.py`

**Verifies:** hw-settings-e2e.AC1.3, hw-settings-e2e.AC1.4

**Files:**

- Modify: `apps/api/plane/urls.py` (add URL pattern inside DEBUG guard)

**Implementation:**

In `apps/api/plane/urls.py`, **replace the entire** `if settings.DEBUG:` block (lines 42-48) with a new combined block that adds the upload proxy URL pattern alongside the existing debug toolbar pattern. This is a full replacement, not an insertion — the new block subsumes the old one.

The URL regex uses a negative lookahead `(?!.*\.\.)` to reject `..` anywhere in the path, blocking directory traversal attacks.

**Current block to replace (lines 42-48):**

```python
if settings.DEBUG:
    try:
        import debug_toolbar
        urlpatterns = [re_path(r"^__debug__/", include(debug_toolbar.urls))] + urlpatterns
    except ImportError:
        pass
```

**Replacement block (final expected state of lines 42+):**

```python
if settings.DEBUG:
    from plane.hw.views import proxy_minio_upload

    urlpatterns += [
        re_path(r"^uploads/(?P<path>(?!.*\.\.)[\w\-./]+)$", proxy_minio_upload),
    ]
    try:
        import debug_toolbar

        urlpatterns = [re_path(r"^__debug__/", include(debug_toolbar.urls))] + urlpatterns
    except ImportError:
        pass
```

Note: `re_path` is already imported at line 8 of the file. The import of `proxy_minio_upload` is inside the `if settings.DEBUG:` block so it only runs in debug mode.

**Verification:**

Start the Django dev server and test with curl:

```bash
# These should NOT match (directory traversal):
curl -I "http://localhost:8000/uploads/../../../etc/passwd"
# Expected: 404 Not Found (regex doesn't match)

# This should match:
curl -I "http://localhost:8000/uploads/test-workspace/some-file.png"
# Expected: 502 (if MinIO not running) or 200 (if MinIO running with that file)
```

**Commit:** `feat(api): wire upload proxy URL pattern with path traversal protection`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->

### Task 5: Verify end-to-end with local dev stack

**Verifies:** hw-settings-e2e.AC1.1, hw-settings-e2e.AC1.2, hw-settings-e2e.AC1.5, hw-settings-e2e.AC1.6, hw-settings-e2e.AC1.7

**Files:**

- No file changes — operational verification only

**Implementation:**

This task verifies all acceptance criteria work together against the running local dev stack. The user must have Docker services running (`docker compose -f docker-compose-local.yml up`) and the Django dev server running with `DEBUG=True` (i.e., `DJANGO_SETTINGS_MODULE=plane.settings.local`).

**Verification steps:**

1. **AC1.1 — GET returns file from MinIO:**

```bash
# Upload a test file to MinIO first (via MinIO console at localhost:9090 or mc CLI)
# Then fetch it through the proxy:
curl -v "http://localhost:8000/uploads/{bucket-path-to-existing-file}"
# Expected: 200 OK with correct Content-Type header and file content
```

2. **AC1.2 — HEAD returns headers only:**

```bash
curl -I "http://localhost:8000/uploads/{bucket-path-to-existing-file}"
# Expected: 200 OK with headers but no body
```

3. **AC1.5 — POST returns 405:**

```bash
curl -X POST "http://localhost:8000/uploads/test"
# Expected: 405 Method Not Allowed
```

4. **AC1.6 — MinIO unreachable returns 502:**

```bash
# Stop MinIO container:
docker compose -f docker-compose-local.yml stop plane-minio
curl -v "http://localhost:8000/uploads/test/file.png"
# Expected: 502 Bad Gateway
# Restart MinIO:
docker compose -f docker-compose-local.yml start plane-minio
```

5. **AC1.7 — Project creation works:**

```bash
# Navigate to the Plane web UI at localhost:3000
# Create a new project (which triggers cover image upload)
# Expected: Project creation succeeds without 404 errors on /uploads/* paths
```

**Commit:** No commit for this task — verification only.

<!-- END_TASK_5 -->
