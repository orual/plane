# Test validation report

Date: 2026-02-16 (updated)
Branches tested: `hw-ai-infra`, `hw`

## How to run tests

`run_tests.py` now auto-loads the `.env` file and overrides container hostnames
with `localhost`, so you can run tests directly without manual environment setup.

### Prerequisites

1. Docker compose stack running (`docker compose -f docker-compose-local.yml up -d plane-db plane-redis plane-mq`)
2. PostgreSQL reachable at `localhost:5432`
3. Redis reachable at `localhost:6379`
4. RabbitMQ reachable at `localhost:5672`
5. Python venv at `.venv/` with test dependencies installed
   (`pip install -r apps/api/requirements/test.txt`)

### The correct invocation

```bash
cd <worktree>/apps/api

# Just run it — env loading is automatic
python run_tests.py          # all tests
python run_tests.py -u       # unit tests only
python run_tests.py -c       # contract tests only
python run_tests.py -s       # smoke tests only
python run_tests.py -o       # with coverage (90% threshold)
python run_tests.py -p       # parallel via pytest-xdist
python run_tests.py --no-env # skip auto-loading (use when env is already configured)
```

### How the auto-env-loading works

`run_tests.py` has a `load_env()` function that:

1. Reads the `.env` file from the same directory as `run_tests.py`.
2. Sets environment variables that aren't already set (skipping lines with
   unresolved `${...}` shell interpolation).
3. Overrides `DATABASE_URL`, `REDIS_URL`, and `RABBITMQ_HOST` to point at
   `localhost` so tests can reach compose services via exposed ports.

The `DATABASE_URL` override is critical because the `.env` file uses shell
interpolation (e.g. `${POSTGRES_HOST}`) that bakes in container hostnames.
Django checks `DATABASE_URL` first via `dj_database_url.config()`, so
overriding individual `POSTGRES_*` variables after sourcing has no effect.

### Per-worktree `.env` status

| Worktree            | `.env` exists | Uses localhost       | Tests runnable        |
| ------------------- | ------------- | -------------------- | --------------------- |
| `hw-ai-infra`       | Yes           | Yes                  | Yes                   |
| `hw` (main)         | Yes           | No (container names) | Yes (auto-overridden) |
| `cpm-critical-path` | No            | —                    | No (needs `.env`)     |
| `kicad-preview`     | No            | —                    | No (needs `.env`)     |

## Infrastructure fixes applied

### 1. RabbitMQ port exposure

Added `"5672:5672"` port mapping to `plane-mq` in `docker-compose-local.yml`.
This unblocked all contract tests that trigger Celery tasks.

### 2. `conftest_external.py` wired into pytest

Created `apps/api/conftest.py` (top-level) with:

```python
pytest_plugins = ["plane.tests.conftest_external"]
```

The `conftest_external.py` file contains mock fixtures (`mock_redis`,
`mock_celery`, `mock_elasticsearch`, `mock_mongodb`) that were referenced in
`TESTING_GUIDE.md` but never auto-discovered by pytest. Pytest only
auto-discovers files named `conftest.py`, not `conftest_external.py`, and
the `pytest_plugins` declaration must be in a top-level conftest (not nested).

### 3. `run_tests.py` auto-loads `.env`

The `load_env()` function eliminates the manual `set -a && source .env && set +a`
and `export DATABASE_URL=...` dance that was previously required.

### 4. `UserFactory` and `create_user` fixture username fix

The `User` model has `username = CharField(unique=True)` with no default.
Multiple user creations with empty username violated the unique constraint.

- `UserFactory` now sets `username = factory.LazyAttribute(lambda o: str(o.id))`.
- The `create_user` conftest fixture now uses `get_or_create` with a `uuid4().hex`
  username, making it resilient to `--reuse-db` stale data.

## Test results (after infrastructure fixes)

### hw-ai-infra

**446 collected, 353 passed, 79 failed, 14 errors**

### hw

**320 collected, 242 passed, 62 failed, 16 errors**

## Failure categorisation

### On both branches

#### 1. Missing URL routes (404) — 13 failures (hw), 17 (hw-ai-infra)

Tests get 404 Not Found for endpoints that aren't registered in the URL dispatcher.

**Affected:**

- `contract/hw/test_issue_relations.py` — all 13 tests
- `contract/hw/test_llm_endpoint.py` — all 4 tests (hw-ai-infra only)

**Root cause:** URL patterns not wired up. Tests were written ahead of route
registration.

#### 2. Cycle detection not working — 17 failures each branch

`detect_dependency_cycle()` returns `None` instead of detecting cycles.

**Affected:**

- `unit/hw/test_cycle_detection.py` — 6 tests (the "yes cycle" tests fail)
- `contract/hw/test_cycle_detection_api.py` — 11 tests

**Root cause:** Cycle detection function not implemented or broken.

#### 3. Auth test ordering pollution — ~7 failures + 14 errors each branch

Auth contract tests pass when run in isolation but error when run as part of
the full suite. Some earlier test pollutes state.

**Affected:** `contract/app/test_authentication.py` — 14 tests error,
several more fail.

**Root cause:** Upstream test isolation issue. Not our tests.

#### 4. `contains_url()` bug — 3 failures each branch

`contains_url()` returns `False` for valid URLs in strings under 1,000
characters. The function has a per-line length limit that rejects long
single-line strings even when the total length is within bounds.

**Affected:** `unit/utils/test_url.py` — 3 tests.

**Root cause:** Logic bug in line-length vs total-length handling.

#### 5. Missing required fields in test data — 5 failures each branch

`IssuePropertyValueSerializer` requires `issue_id` and `property_definition_id`
(DRF source-mapped field names), but tests provide `property_definition`.

**Affected:** `unit/hw/test_property_serializers.py::TestIssuePropertyValueSerializer`
— 5 tests.

**Root cause:** Test code — field names don't match serializer expectations.

#### 6. Cycles API (external) — 5 failures each branch

**Affected:** `contract/api/test_cycles.py` — 5 tests.

**Root cause:** Needs investigation.

#### 7. S3 copy NULL constraint violation — 1 failure each branch

Sets `description_json` to `NULL`, violating NOT NULL constraint.

**Affected:** `unit/bg_tasks/test_copy_s3_objects.py::test_copy_s3_objects_of_description_and_assets`

**Root cause:** Production code doesn't handle NULL `description_json`.

#### 8. Date propagation multi-hop logic — 1 failure each branch

Expected `date(2026, 2, 2)`, got `date(2026, 1, 24)`.

**Affected:** `unit/hw/test_propagation.py::test_multi_hop_chain_abc`

**Root cause:** Date arithmetic bug in propagation service.

#### 9. Serializer UUID/string mismatches — 2 failures each branch

**Affected:** `contract/hw/test_issue_types.py` (1 test),
`unit/hw/test_issue_type_serializers.py::test_nested_issue_type_detail` (1 test)

**Root cause:** UUID fields not coerced to strings in serializer output.

#### 10. Workspace/issue serializer field mismatches — 3 failures (hw only)

**Affected:** `unit/serializers/test_workspace.py` (2 tests),
`unit/serializers/test_issue_recent_visit.py` (1 test)

**Root cause:** Needs investigation — may be tests written for hw-ai-infra
serializer changes.

### hw-ai-infra only

#### 11. Agent infrastructure tests — 13 failures

**Affected:** `contract/hw/test_agent_runs.py` (10 tests),
`contract/hw/test_agent_registration.py` (3 tests)

**Root cause:** Needs investigation — agent API behaviour.

#### 12. LLM config not reading from database — 3 failures

`get_llm_config()` returns `None` instead of reading from `InstanceConfiguration`.

**Affected:** `contract/hw/test_llm_admin_settings.py` — 3 of 4 tests.

**Root cause:** Function doesn't query the database.

#### 13. LLM endpoint 404 — 4 failures

**Affected:** `contract/hw/test_llm_endpoint.py` — all 4 tests.

**Root cause:** URL route not registered.

## Recommended fix priority

1. **Register missing URL routes** — unblocks 13–17 tests (issue relations, LLM endpoints)
2. **Fix cycle detection** — 17 tests, core dependency management feature
3. **Fix property serializer test data** — 5 tests, straightforward fix
4. **Fix `contains_url()`** — 3 tests, exists on both branches
5. **Fix `get_llm_config()` DB read** — 3 tests (hw-ai-infra)
6. **Investigate agent tests** — 13 tests (hw-ai-infra)
7. **Investigate cycles API tests** — 5 tests
8. **Remaining bugs** — date propagation, S3 copy, UUID handling, auth isolation
