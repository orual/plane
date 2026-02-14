# Phase 1 Verification Commands

## Prerequisites

- Docker services running: `docker compose -f docker-compose-local.yml up`
- Django dev server running with DEBUG=True: `DJANGO_SETTINGS_MODULE=plane.settings.local`

## Test Directory Traversal Protection (AC1.4)

```bash
# This should NOT match (directory traversal):
curl -I "http://localhost:8000/uploads/../../../etc/passwd"
# Expected: 404 Not Found (regex doesn't match)

# This should match:
curl -I "http://localhost:8000/uploads/test-workspace/some-file.png"
# Expected: 502 (if MinIO not running) or 200 (if MinIO running with that file)
```

## Test Non-Debug Mode (AC1.3)

```bash
# Set DEBUG=False and restart Django server
curl -I "http://localhost:8000/uploads/test/file.png"
# Expected: 403 Forbidden (when DEBUG=False)
```

## Test Debug Mode Only

```bash
# Set DEBUG=True and restart Django server
curl -I "http://localhost:8000/uploads/test/file.png"
# Expected: 502 (if MinIO not running) or 200 (if MinIO running with that file)
```
