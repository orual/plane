/**
 * Sandbox runtime for executing LLM-generated code in a Deno environment.
 *
 * This runtime provides a safe execution environment for LLM-generated code
 * with the ability to call tools and communicate with the host process via
 * newline-delimited JSON over stdin/stdout.
 */

// Global namespace for the runtime
declare global {
  interface Window {
    callTool: typeof callTool;
    output: typeof output;
    error: typeof error;
  }
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

// Runtime state
let pendingCalls = new Map<string, PendingCall>();
let outputBuffer = "";
let nextCallId = 1;

/**
 * Call a tool with the given name and parameters.
 *
 * @param name - Tool name to call
 * @param params - Tool parameters
 * @returns Promise that resolves with the tool result
 */
export function callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
  const id = `call_${nextCallId++}`;

  // Create a promise for this tool call
  const promise = new Promise<unknown>((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });
  });

  // Send the tool call message to the host
  const message: ToolCallRequest = { type: "tool_call", id, name, params };
  console.log(JSON.stringify(message));

  return promise;
}

/**
 * Send output content to the host.
 *
 * @param content - Content to output
 */
export function output(content: string): void {
  const message: OutputMessage = { type: "output", content };
  console.log(JSON.stringify(message));
}

/**
 * Send an error message and exit.
 *
 * @param message - Error message
 */
export function error(message: string): never {
  const errorMessage: ErrorMessage = { type: "error", message };
  console.log(JSON.stringify(errorMessage));
  Deno.exit(1);
}

/**
 * Read tool results from stdin and handle them.
 */
async function readToolResults(): Promise<void> {
  const reader = Deno.stdin.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as HostMessage;

            switch (message.type) {
              case "tool_result":
                pendingCalls.get(message.id)?.resolve(message.result);
                pendingCalls.delete(message.id);
                break;

              case "tool_error":
                pendingCalls.get(message.id)?.reject(new Error(message.error));
                pendingCalls.delete(message.id);
                break;
            }
          } catch (err) {
            console.error("Failed to parse host message:", err);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// Initialize the runtime
readToolResults().catch(err => {
  error(`Runtime error: ${err.message}`);
});

// Export functions for use by LLM-generated code
globalThis.callTool = callTool;
globalThis.output = output;
globalThis.error = error;