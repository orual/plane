# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Built-in agent execution task.

Orchestrates the LLM → sandbox → tools loop with error-feedback retries.
When sandbox execution fails, the error is fed back to the LLM so it can
correct its code and try again (up to MAX_SANDBOX_ATTEMPTS total).
"""

import logging
import re
from typing import Any, Dict, List, Optional

from celery import shared_task
from django.utils import timezone

from plane.db.models import IssueComment
from plane.hw.agent_tools.llm_client import AgentLLMClient
from plane.hw.agent_tools.prompts import (
    build_system_prompt,
    build_workspace_context,
)
from plane.hw.agent_tools.registry import ToolContext, default_registry
import plane.hw.agent_tools.tools  # noqa: F401 — trigger tool registration
from plane.hw.agent_tools.sandbox import SandboxExecutor
from plane.hw.models import (
    AgentConversationMessage,
    AgentConversationMessageRole,
    AgentRun,
    AgentRunActivity,
    AgentRunStatus,
    AgentActivityType,
)
from plane.hw.services.agent_events import emit_activity_event, emit_run_status_event
from plane.utils.exception_logger import log_exception
from plane.utils.llm_config import get_llm_config


logger = logging.getLogger("plane.worker")

MAX_SANDBOX_ATTEMPTS = 3


def _extract_code_block(content: str) -> Optional[str]:
    """Extract TypeScript code block from LLM response.

    Looks for fenced code blocks with language typescript or ts.

    Args:
        content: LLM response content

    Returns:
        Code block content or None if not found
    """
    pattern = r"```(?:typescript|ts)\s*(.*?)```"
    matches = re.findall(pattern, content, re.DOTALL)

    if matches:
        return matches[0].strip()

    return None


def _create_html_for_content(content: str) -> str:
    """Convert plain text content to HTML.

    Escapes HTML and wraps in paragraph tags.

    Args:
        content: Plain text content

    Returns:
        HTML-escaped content wrapped in paragraph
    """
    import html

    escaped = html.escape(content)
    escaped = escaped.replace("\n", "<br/>")
    return f"<p>{escaped}</p>"


def _complete_run(run: AgentRun, content: str) -> None:
    """Finalize a successful run with a response.

    Creates the RESPONSE activity, conversation message (if conversation-scoped),
    issue comment (if issue-scoped), and transitions the run to COMPLETED.

    Args:
        run: The agent run to complete
        content: The response content to deliver
    """
    response_activity = AgentRunActivity.objects.create(
        run=run,
        activity_type=AgentActivityType.RESPONSE,
        content=content,
    )
    emit_activity_event(response_activity)
    run.last_activity_at = timezone.now()

    if run.conversation_id:
        AgentConversationMessage.objects.create(
            conversation_id=run.conversation_id,
            role=AgentConversationMessageRole.ASSISTANT,
            content=content,
            run=run,
        )

    if run.issue_id:
        IssueComment.objects.create(
            issue_id=run.issue_id,
            project_id=run.project_id,
            workspace_id=run.workspace_id,
            comment_html=_create_html_for_content(content),
            created_by=run.agent.user,
            updated_by=run.agent.user,
            actor=run.agent.user,
            external_source="agent",
            external_id=f"{run.id}:{response_activity.id}",
        )

    run.status = AgentRunStatus.COMPLETED
    run.completed_at = timezone.now()
    run.save()
    emit_run_status_event(run)
    logger.info("Run %s completed successfully", run.id)


@shared_task
def builtin_agent_execute_task(
    run_id: str,
    trigger_type: str,
    user_message: str,
    conversation_messages: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Execute a built-in agent run.

    Orchestrates the LLM → sandbox → tools loop with automatic retries.
    When sandbox execution produces an error, the error is fed back to the
    LLM as a follow-up message so it can correct its code and try again.

    Args:
        run_id: The AgentRun UUID
        trigger_type: "mention" or "conversation"
        user_message: The text from the user (comment body or chat message)
        conversation_messages: Previous conversation turns for multi-turn context
    """
    try:
        try:
            run = AgentRun.objects.select_related(
                "agent", "agent__user", "workspace", "project", "issue", "created_by"
            ).get(id=run_id)
        except AgentRun.DoesNotExist:
            logger.error("Agent run %s not found", run_id)
            return

        # Validate LLM configuration
        api_key, model, provider, base_url = get_llm_config()
        if not api_key or not model or not provider:
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.ERROR,
                content="LLM configuration missing",
            )
            emit_activity_event(activity)
            run.status = AgentRunStatus.FAILED
            run.completed_at = timezone.now()
            run.save()
            emit_run_status_event(run)
            return

        run.status = AgentRunStatus.IN_PROGRESS
        run.save()
        emit_run_status_event(run)

        # Build system prompt with tool docs and workspace context
        tool_registry = default_registry
        tool_docs = tool_registry.generate_docs()
        workspace_context = build_workspace_context(run.workspace)
        system_prompt = build_system_prompt(tool_docs, workspace_context)

        # Assemble conversation history
        messages: List[Dict[str, Any]] = []
        if conversation_messages:
            messages.extend(conversation_messages)
        messages.append({"role": "user", "content": user_message})

        # These are stateless and safe to reuse across retry attempts
        client = AgentLLMClient(api_key, provider, model, base_url)
        # Resolve the human user who triggered this run.
        # BaseModel.save() uses crum.get_current_user() which returns None in
        # Celery workers, so run.created_by is unreliable. Fall back to the
        # conversation owner when available.
        acting_user = run.created_by
        if acting_user is None and run.conversation_id:
            acting_user = run.conversation.user
        if acting_user is None:
            logger.error("Cannot determine acting user for run %s", run.id)
            _complete_run(run, "Unable to determine the user for this request.")
            return

        tool_context = ToolContext(
            user=acting_user,
            actor=run.agent.user,
            workspace=run.workspace,
            run=run,
            project_id=run.project_id,
        )
        executor = SandboxExecutor(tool_registry, tool_context)

        last_llm_content = None

        for attempt in range(MAX_SANDBOX_ATTEMPTS):
            # ── LLM call ──
            try:
                llm_response = client.call(system_prompt, messages)
            except Exception as e:
                error_msg = f"LLM call failed: {str(e)}"
                logger.error(error_msg)
                activity = AgentRunActivity.objects.create(
                    run=run,
                    activity_type=AgentActivityType.ERROR,
                    content=error_msg,
                )
                emit_activity_event(activity)
                run.status = AgentRunStatus.FAILED
                run.completed_at = timezone.now()
                run.save()
                emit_run_status_event(run)
                return

            last_llm_content = llm_response.content

            logger.info(
                "LLM response (attempt %d/%d): content_len=%d, reasoning=%s, finish=%s (run %s)",
                attempt + 1, MAX_SANDBOX_ATTEMPTS,
                len(llm_response.content),
                bool(llm_response.reasoning_content),
                llm_response.finish_reason,
                run_id,
            )

            if llm_response.reasoning_content:
                activity = AgentRunActivity.objects.create(
                    run=run,
                    activity_type=AgentActivityType.THOUGHT,
                    content=llm_response.reasoning_content,
                )
                emit_activity_event(activity)
                run.last_activity_at = timezone.now()
                run.save()

            # ── Response type dispatch ──
            code_block = _extract_code_block(llm_response.content)

            if not code_block:
                _complete_run(run, llm_response.content)
                return

            # ── Sandbox execution ──
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.ACTION,
                content=code_block,
            )
            emit_activity_event(activity)
            run.last_activity_at = timezone.now()
            run.save()

            try:
                sandbox_result = executor.execute(code_block)
            except Exception as e:
                # Infrastructure failure (deno missing, etc.) — retrying won't help
                error_msg = f"Sandbox initialization failed: {str(e)}"
                logger.error(error_msg)
                activity = AgentRunActivity.objects.create(
                    run=run,
                    activity_type=AgentActivityType.ERROR,
                    content=error_msg,
                )
                emit_activity_event(activity)

                fallback = last_llm_content.strip() if last_llm_content else None
                if fallback and run.conversation_id:
                    response_activity = AgentRunActivity.objects.create(
                        run=run,
                        activity_type=AgentActivityType.RESPONSE,
                        content=fallback,
                    )
                    emit_activity_event(response_activity)
                    AgentConversationMessage.objects.create(
                        conversation_id=run.conversation_id,
                        role=AgentConversationMessageRole.ASSISTANT,
                        content=fallback,
                        run=run,
                    )

                run.status = AgentRunStatus.FAILED
                run.completed_at = timezone.now()
                run.save()
                emit_run_status_event(run)
                return

            logger.info(
                "Sandbox result (attempt %d/%d): output_len=%d, error=%s, timed_out=%s (run %s)",
                attempt + 1, MAX_SANDBOX_ATTEMPTS,
                len(sandbox_result.output or ""),
                sandbox_result.error,
                sandbox_result.timed_out,
                run_id,
            )

            # ── Success ──
            if not sandbox_result.error and not sandbox_result.timed_out:
                _complete_run(run, sandbox_result.output)
                return

            # ── Timeout — retrying won't help ──
            if sandbox_result.timed_out:
                activity = AgentRunActivity.objects.create(
                    run=run,
                    activity_type=AgentActivityType.ERROR,
                    content="Execution timed out (60 second limit exceeded)",
                )
                emit_activity_event(activity)
                run.status = AgentRunStatus.FAILED
                run.completed_at = timezone.now()
                run.save()
                emit_run_status_event(run)
                return

            # ── Sandbox error — retry with feedback ──
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.ERROR,
                content=sandbox_result.error,
            )
            emit_activity_event(activity)

            is_last_attempt = attempt >= MAX_SANDBOX_ATTEMPTS - 1
            if is_last_attempt:
                logger.info(
                    "All %d sandbox attempts exhausted for run %s",
                    MAX_SANDBOX_ATTEMPTS, run_id,
                )
                # Deliver raw LLM text as fallback so the user sees something
                fallback = last_llm_content.strip() if last_llm_content else None
                if fallback and run.conversation_id:
                    response_activity = AgentRunActivity.objects.create(
                        run=run,
                        activity_type=AgentActivityType.RESPONSE,
                        content=fallback,
                    )
                    emit_activity_event(response_activity)
                    AgentConversationMessage.objects.create(
                        conversation_id=run.conversation_id,
                        role=AgentConversationMessageRole.ASSISTANT,
                        content=fallback,
                        run=run,
                    )

                run.status = AgentRunStatus.FAILED
                run.completed_at = timezone.now()
                run.save()
                emit_run_status_event(run)
                return

            # Feed error back to the LLM so it can correct its code
            logger.info(
                "Sandbox error on attempt %d/%d, retrying (run %s)",
                attempt + 1, MAX_SANDBOX_ATTEMPTS, run_id,
            )
            messages.append({"role": "assistant", "content": llm_response.content})
            messages.append({
                "role": "user",
                "content": (
                    f"Your code produced an error during execution:\n\n"
                    f"```\n{sandbox_result.error}\n```\n\n"
                    f"Please fix the issue and try again. "
                    f"If you cannot fix it, respond with plain text instead."
                ),
            })

    except Exception as e:
        import traceback
        traceback.print_exc()
        log_exception(e)
        logger.error(
            "Unexpected error in builtin_agent_execute_task: %s", e, exc_info=True
        )

        try:
            run = AgentRun.objects.get(id=run_id)
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.ERROR,
                content=f"Unexpected error: {str(e)}",
            )
            emit_activity_event(activity)
            run.status = AgentRunStatus.FAILED
            run.completed_at = timezone.now()
            run.save()
            emit_run_status_event(run)
        except Exception as e2:
            logger.error("Failed to create error activity: %s", e2)
