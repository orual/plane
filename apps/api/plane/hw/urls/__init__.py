# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .issue_type import urlpatterns as issue_type_urls
from .issue_property import urlpatterns as issue_property_urls
from .agent import urlpatterns as agent_urls

urlpatterns = [
    *issue_type_urls,
    *issue_property_urls,
    *agent_urls,
]
