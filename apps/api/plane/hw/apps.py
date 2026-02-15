# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class HwConfig(AppConfig):
    name = "plane.hw"

    def ready(self):
        import plane.hw.signals  # noqa: F401
