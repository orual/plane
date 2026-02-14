# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""DEBUG-only reverse proxy for MinIO uploads."""

# Pattern: Imperative Shell (proxy view - performs I/O operations)

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

    if request.method not in ("GET", "HEAD", "POST", "PUT", "DELETE"):
        return HttpResponseNotAllowed(["GET", "HEAD", "POST", "PUT", "DELETE"])

    bucket = getattr(settings, "AWS_S3_BUCKET_NAME", "uploads")
    minio_url = f"{settings.AWS_S3_ENDPOINT_URL}/{bucket}/{path}"

    try:
        if request.method == "HEAD":
            upstream = http_client.head(minio_url, timeout=PROXY_TIMEOUT)
            response = HttpResponse(status=upstream.status_code)
        elif request.method in ("POST", "PUT", "DELETE"):
            # Forward request with streaming
            upstream = http_client.request(
                request.method,
                minio_url,
                data=request.body,
                stream=True,
                timeout=PROXY_TIMEOUT,
                headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
            )
            if upstream.status_code == 200:
                response = StreamingHttpResponse(
                    upstream.iter_content(chunk_size=8192),
                    status=200,
                )
            else:
                response = HttpResponse(upstream.content, status=upstream.status_code)

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
