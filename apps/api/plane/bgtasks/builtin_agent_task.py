# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Built-in agent execution task.

Orchestrates the full LLM → sandbox → tools loop and creates activity records.
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
from plane.hw.agent_tools.registry import ToolContext, ToolRegistry
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


def _extract_code_block(content: str) -> Optional[str]:
    """Extract TypeScript code block from LLM response.

    Looks for fenced code blocks with language typescript or ts.
    Returns the code block content, or None if not found.

    Args:
        content: LLM response content

    Returns:
        Code block content or None if not found
    """
    # Pattern for triple-backtick code blocks with ts/typescript language
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
    # Simple HTML escape for plain text
    import html

    escaped = html.escape(content)
    # Preserve line breaks
    escaped = escaped.replace("\n", "<br/>")
    return f"<p>{escaped}</p>"


@shared_task
def builtin_agent_execute_task(
    run_id: str,
    trigger_type: str,
    user_message: str,
    conversation_messages: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Execute a built-in agent run.

    Orchestrates the full LLM → sandbox → tools loop and creates activity records.

    Args:
        run_id: The AgentRun UUID
        trigger_type: "mention" or "conversation"
        user_message: The text from the user (comment body or chat message)
        conversation_messages: Previous conversation turns for multi-turn context
    """
    try:
        # Load context
        try:
            run = AgentRun.objects.select_related(
                "agent", "workspace", "project", "issue", "created_by"
            ).get(id=run_id)
        except AgentRun.DoesNotExist:
            logger.error(f"Agent run {run_id} not found")
            return

        # Get LLM config
        api_key, model, provider, base_url = get_llm_config()
        if not api_key or not model or not provider:
            error_msg = "LLM configuration missing"
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

        # Transition status to IN_PROGRESS
        run.status = AgentRunStatus.IN_PROGRESS
        run.save()
        emit_run_status_event(run)

        # Build prompt
        tool_registry = ToolRegistry()
        tool_docs = tool_registry.generate_docs()
        workspace_context = build_workspace_context(run.workspace)
        system_prompt = build_system_prompt(tool_docs, workspace_context)

        # Build messages list
        messages = []
        if conversation_messages:
            # Add previous conversation turns
            messages.extend(conversation_messages)

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        # Call LLM
        try:
            client = AgentLLMClient(api_key, provider, model, base_url)
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

        # Create thought activity if reasoning present
        if llm_response.reasoning_content:
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.THOUGHT,
                content=llm_response.reasoning_content,
            )
            emit_activity_event(activity)
            run.last_activity_at = timezone.now()
            run.save()

        # Extract code block
        code_block = _extract_code_block(llm_response.content)

        # If no code block, treat as direct response
        if not code_block:
            response_activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.RESPONSE,
                content=llm_response.content,
            )
            emit_activity_event(response_activity)
            run.last_activity_at = timezone.now()

            # Create assistant conversation message if conversation-scoped
            if run.conversation_id:
                AgentConversationMessage.objects.create(
                    conversation_id=run.conversation_id,
                    role=AgentConversationMessageRole.ASSISTANT,
                    content=llm_response.content,
                    run=run,
                )

            # Auto-create IssueComment if issue-scoped
            if run.issue_id:
                IssueComment.objects.create(
                    issue_id=run.issue_id,
                    project_id=run.project_id,
                    workspace_id=run.workspace_id,
                    comment_html=_create_html_for_content(llm_response.content),
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
            return

        # Create action activity for code
        activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.ACTION,
            content=code_block,
        )
        emit_activity_event(activity)
        run.last_activity_at = timezone.now()
        run.save()

        # Execute sandbox
        try:
            tool_context = ToolContext(
                user=run.created_by,
                workspace=run.workspace,
                run=run,
                project_id=run.project_id,
            )
            executor = SandboxExecutor(tool_registry, tool_context)
            sandbox_result = executor.execute(code_block)
        except Exception as e:
            error_msg = f"Sandbox initialization failed: {str(e)}"
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

        # Handle sandbox result
        if sandbox_result.timed_out:
            error_msg = "Execution timed out (60 second limit exceeded)"
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

        if sandbox_result.error:
            activity = AgentRunActivity.objects.create(
                run=run,
                activity_type=AgentActivityType.ERROR,
                content=sandbox_result.error,
            )
            emit_activity_event(activity)
            run.status = AgentRunStatus.FAILED
            run.completed_at = timezone.now()
            run.save()
            emit_run_status_event(run)
            return

        # Success: create response activity with sandbox output
        response_activity = AgentRunActivity.objects.create(
            run=run,
            activity_type=AgentActivityType.RESPONSE,
            content=sandbox_result.output,
        )
        emit_activity_event(response_activity)
        run.last_activity_at = timezone.now()

        # Create assistant conversation message if conversation-scoped
        if run.conversation_id:
            AgentConversationMessage.objects.create(
                conversation_id=run.conversation_id,
                role=AgentConversationMessageRole.ASSISTANT,
                content=sandbox_result.output,
                run=run,
            )

        # Auto-create IssueComment if issue-scoped
        if run.issue_id:
            IssueComment.objects.create(
                issue_id=run.issue_id,
                project_id=run.project_id,
                workspace_id=run.workspace_id,
                comment_html=_create_html_for_content(sandbox_result.output),
                created_by=run.agent.user,
                updated_by=run.agent.user,
                actor=run.agent.user,
                external_source="agent",
                external_id=f"{run.id}:{response_activity.id}",
            )

        # Transition to completed
        run.status = AgentRunStatus.COMPLETED
        run.completed_at = timezone.now()
        run.save()
        emit_run_status_event(run)

    except Exception as e:
        log_exception(e)
        logger.error(f"Unexpected error in builtin_agent_execute_task: {e}")

        # Try to update run with error activity
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
            logger.error(f"Failed to create error activity: {e2}")
