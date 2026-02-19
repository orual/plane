/**
 * Type definitions for the IPC protocol between sandbox and host.
 *
 * This file defines the TypeScript interfaces for the newline-delimited JSON
 * protocol used for communication between the Deno sandbox runtime and the
 * Python host process.
 */

export interface ToolCallRequest {
  type: "tool_call";
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface OutputMessage {
  type: "output";
  content: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface ToolResult {
  type: "tool_result";
  id: string;
  result: unknown;
}

export interface ToolError {
  type: "tool_error";
  id: string;
  error: string;
}

export type SandboxMessage =
  | ToolCallRequest
  | OutputMessage
  | ErrorMessage;

export type HostMessage =
  | ToolResult
  | ToolError;