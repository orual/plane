from dataclasses import dataclass
from typing import Callable, Any, List, Dict, Optional
from uuid import UUID


class ToolError(Exception):
    """Exception raised by tools to indicate failures."""
    pass


@dataclass
class ToolParam:
    """Represents one parameter of a tool."""
    name: str
    type: str  # e.g., "string", "integer", "boolean", "array"
    description: str
    required: bool = True
    items_type: Optional[str] = None  # for array types


@dataclass
class ToolDefinition:
    """Represents a registered tool."""
    name: str  # dotted name like "issues.create"
    description: str
    params: List[ToolParam]
    return_type: str  # description of return value
    handler: Callable
    requires_project: bool = False


@dataclass
class ToolContext:
    """Execution context passed to every tool call."""
    user: Any  # User model instance
    workspace: Any  # Workspace model instance
    run: Any  # AgentRun model instance
    project_id: Optional[UUID] = None  # set when run is project-scoped


class ToolRegistry:
    """Registry for managing tools and their execution."""

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def tool(
        self,
        name: str,
        description: str,
        params: List[ToolParam],
        return_type: str,
        requires_project: bool = False
    ):
        """Decorator to register a tool."""
        def decorator(handler: Callable) -> Callable:
            # Create tool definition
            tool_def = ToolDefinition(
                name=name,
                description=description,
                params=params,
                return_type=return_type,
                handler=handler,
                requires_project=requires_project
            )
            # Register this tool
            self._tools[name] = tool_def
            return handler
        return decorator

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Get a tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> List[ToolDefinition]:
        """Get all registered tools."""
        return list(self._tools.values())

    def execute(self, name: str, params: Dict[str, Any], context: ToolContext) -> Dict[str, Any]:
        """Execute a tool by name."""
        # Check if tool exists
        tool = self.get_tool(name)
        if not tool:
            return {"error": f"Unknown tool: {name}"}

        try:
            # Call the tool handler
            result = tool.handler(params, context)
            return {"result": result}
        except ToolError as e:
            return {"error": f"Permission denied: {str(e)}"}
        except Exception as e:
            return {"error": f"Tool execution failed: {str(e)}"}

    def generate_docs(self) -> str:
        """Generate markdown documentation for all registered tools."""
        if not self._tools:
            return "# No tools registered"

        docs = ["# Agent Tools Reference\n"]

        for tool in sorted(self._tools.values(), key=lambda t: t.name):
            docs.append(f"## {tool.name}\n")
            docs.append(f"{tool.description}\n")

            if tool.params:
                docs.append("\n### Parameters\n")
                docs.append("| Name | Type | Required | Description |")
                docs.append("|------|------|----------|-------------|")

                for param in tool.params:
                    required = "Yes" if param.required else "No"
                    items = f" (`Array<{param.items_type}>`)" if param.items_type else ""
                    docs.append(f"| {param.name} | {param.type}{items} | {required} | {param.description} |")
                docs.append("")

            docs.append(f"\n### Returns\n{tool.return_type}\n\n")

        return "\n".join(docs)

    def generate_types(self) -> str:
        """Generate TypeScript declarations for all registered tools."""
        if not self._tools:
            return "// No tools registered"

        types = ["// Agent Tool TypeScript Declarations\n"]

        for tool in sorted(self._tools.values(), key=lambda t: t.name):
            # Build parameters object type
            required_params = []
            optional_params = []

            for param in tool.params:
                param_type = self._map_type_to_ts(param.type, param.items_type)
                if param.required:
                    required_params.append(f"  {param.name}: {param_type}")
                else:
                    optional_params.append(f"  {param.name}?: {param_type}")

            all_params = required_params + optional_params
            params_str = ", ".join(all_params) if all_params else "void"

            types.append(f"declare function {tool.name}({params_str}): "
               f"Promise<{self._map_type_to_ts(tool.return_type)}>;\n")

        return "\n".join(types)

    def _map_type_to_ts(self, python_type: str, items_type: Optional[str] = None) -> str:
        """Map Python type names to TypeScript types."""
        type_mapping = {
            "string": "string",
            "integer": "number",
            "boolean": "boolean",
            "array": "Array<{}>".format(self._map_type_to_ts(items_type) if items_type else "any")
        }
        return type_mapping.get(python_type, "any")


# Module-level default registry instance
default_registry = ToolRegistry()

# Convenience decorator that uses the default registry
tool = default_registry.tool