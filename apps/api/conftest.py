# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Register test plugins that pytest won't auto-discover from non-standard filenames.
pytest_plugins = ["plane.tests.conftest_external"]
