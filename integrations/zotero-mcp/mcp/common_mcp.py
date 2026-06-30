#!/usr/bin/env python3
from __future__ import annotations

import inspect
import json
import sys
import traceback
from typing import Any, get_type_hints

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class ToolError(Exception):
    pass


class MCPServer:
    def __init__(self, name: str, version: str = "1.0.0") -> None:
        self.name = name
        self.version = version
        self._tools: dict[str, Any] = {}

    def tool(self, fn: Any = None, *, name: str | None = None) -> Any:
        def decorator(func: Any) -> Any:
            self._tools[name or func.__name__] = func
            return func

        if fn is not None:
            return decorator(fn)
        return decorator

    def _send(self, message: dict[str, Any]) -> None:
        sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    def _reply(self, request_id: Any, result: dict[str, Any]) -> None:
        self._send({"jsonrpc": "2.0", "id": request_id, "result": result})

    def _error(self, request_id: Any, code: int, message: str) -> None:
        self._send({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

    def _annotation_to_json_type(self, annotation: Any) -> str:
        if annotation is bool:
            return "boolean"
        if annotation is int:
            return "integer"
        if annotation is float:
            return "number"
        if annotation in (dict, list):
            return "object" if annotation is dict else "array"
        return "string"

    def _tool_schema(self, func: Any) -> dict[str, Any]:
        signature = inspect.signature(func)
        try:
            hints = get_type_hints(func)
        except Exception:
            hints = {}

        properties: dict[str, Any] = {}
        required: list[str] = []
        for param_name, param in signature.parameters.items():
            if param_name == "self":
                continue
            annotation = hints.get(param_name, param.annotation)
            json_type = self._annotation_to_json_type(annotation)
            properties[param_name] = {
                "type": json_type,
                "description": f"Parameter {param_name}",
            }
            if param.default is inspect.Parameter.empty:
                required.append(param_name)

        return {"type": "object", "properties": properties, "required": required}

    def run(self) -> None:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue

            request_id = request.get("id")
            method = request.get("method")
            params = request.get("params", {})

            if method == "initialize":
                self._reply(
                    request_id,
                    {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {"name": self.name, "version": self.version},
                    },
                )
            elif method == "notifications/initialized":
                continue
            elif method == "tools/list":
                self._reply(
                    request_id,
                    {
                        "tools": [
                            {
                                "name": tool_name,
                                "description": (func.__doc__ or tool_name).strip(),
                                "inputSchema": self._tool_schema(func),
                            }
                            for tool_name, func in self._tools.items()
                        ]
                    },
                )
            elif method == "tools/call":
                tool_name = params.get("name", "")
                arguments = params.get("arguments", {})
                if tool_name not in self._tools:
                    self._error(request_id, -32601, f"Tool '{tool_name}' not found")
                    continue

                try:
                    result = self._tools[tool_name](**arguments)
                    if not isinstance(result, dict):
                        result = {"result": result}
                    content = [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]
                    self._reply(request_id, {"content": content, "isError": False})
                except ToolError as exc:
                    content = [{"type": "text", "text": json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2)}]
                    self._reply(request_id, {"content": content, "isError": True})
                except Exception as exc:
                    payload = {"error": str(exc), "traceback": traceback.format_exc(limit=5)}
                    content = [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, indent=2)}]
                    self._reply(request_id, {"content": content, "isError": True})
            else:
                self._error(request_id, -32601, f"Method '{method}' not found")
