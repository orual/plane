# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Test Settings"""

import os

from .common import *  # noqa

DEBUG = True

# Send it in a dummy outbox
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Required by MagicCodeProvider SMTP check (uses os.environ, not Django settings)
os.environ.setdefault("EMAIL_HOST", "localhost")

# Required by base_host() in views that fire activity notifications
WEB_URL = "http://localhost:3000"
APP_BASE_URL = "http://localhost:3000"

INSTALLED_APPS.append(  # noqa
    "plane.tests"
)
