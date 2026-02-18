# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
import re

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

import django_eventstream.routing

django_asgi_app = get_asgi_application()


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")
# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.


application = ProtocolTypeRouter({
    "http": URLRouter([
        *django_eventstream.routing.urlpatterns,
        re_path(r"", django_asgi_app),
    ]),
})
