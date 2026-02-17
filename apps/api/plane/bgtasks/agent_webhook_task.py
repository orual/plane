# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac
import json
import uuid
from typing import Any, Dict, Optional

import requests
from celery import shared_task
from django.core.serializers.json import DjangoJSONEncoder

from plane.hw.models import AgentProfile
from plane.utils.exception_logger import log_exception


@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=600,
    max_retries=5,
    retry_jitter=True,
)
def agent_webhook_send_task(
    self,
    agent_profile_id: str,
    run_id: str,
    event_type: str,
    event_data: Optional[Dict[str, Any]],
    current_site: str,
) -> None:
    """
    Send webhook notifications to agent endpoints.

    Follows the exact pattern from webhook_send_task, adapted for agents.

    Args:
        agent_profile_id (str): Agent profile ID
        run_id (str): Agent run ID
        event_type (str): Event type (e.g., "issue_comment.mention")
        event_data (Optional[Dict[str, Any]]): Event data to be sent
        current_site (str): Current site URL
    """
    try:
        agent = AgentProfile.objects.get(id=agent_profile_id)

        # Skip if agent is not active
        if not agent.is_active:
            return

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Autopilot",
            "X-Plane-Delivery": str(uuid.uuid4()),
            "X-Plane-Event": event_type,
        }

        # Normalize event_data to ensure JSON serialization
        event_data = json.loads(json.dumps(event_data, cls=DjangoJSONEncoder)) if event_data is not None else None

        payload = {
            "event": event_type,
            "action": "created",
            "agent_id": str(agent.id),
            "workspace_id": str(agent.workspace_id),
            "run_id": str(run_id),
            "data": event_data,
        }

        # Use HMAC-SHA256 for generating signature
        if agent.webhook_secret:
            hmac_signature = hmac.new(
                agent.webhook_secret.encode("utf-8"),
                json.dumps(payload, cls=DjangoJSONEncoder).encode("utf-8"),
                hashlib.sha256,
            )
            signature = hmac_signature.hexdigest()
            headers["X-Plane-Signature"] = signature

    except Exception as e:
        log_exception(e)
        return

    try:
        # Send the webhook event
        response = requests.post(agent.webhook_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()

    except requests.RequestException:
        # Retry logic
        if self.request.retries >= self.max_retries:
            # Deactivate agent on persistent failure
            AgentProfile.objects.filter(pk=agent.id).update(is_active=False)
            return
        raise

    except Exception as e:
        log_exception(e)
        return
