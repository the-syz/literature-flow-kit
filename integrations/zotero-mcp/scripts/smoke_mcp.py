#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.stdout.reconfigure(encoding="utf-8")


ROOT = Path(__file__).resolve().parents[1]
SERVERS = {
    "zotero": ROOT / "mcp" / "zotero_mcp_server.py",
}


def request(process: subprocess.Popen[str], payload: dict[str, Any]) -> dict[str, Any]:
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None
    process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
    process.stdin.flush()
    while True:
        raw = process.stdout.readline()
        if not raw:
            stderr = process.stderr.read()
            raise RuntimeError(f"No response from MCP server. stderr={stderr}")
        line = raw.decode("utf-8", errors="replace").strip()
        if line:
            return json.loads(line)


def parse_json_arg(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    path = Path(raw)
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test local TraeSolo MCP servers.")
    parser.add_argument("--server", choices=sorted(SERVERS), required=True)
    parser.add_argument("--list-tools", action="store_true")
    parser.add_argument("--call", default="")
    parser.add_argument("--args", default="", help="JSON object or path to JSON file for tool arguments.")
    args = parser.parse_args()

    server_path = SERVERS[args.server]
    process = subprocess.Popen(
        [sys.executable, str(server_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        init = request(
            process,
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "smoke", "version": "1.0"}},
            },
        )
        if "error" in init:
            print(json.dumps(init, ensure_ascii=False, indent=2))
            return 1

        if args.list_tools:
            response = request(process, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            print(json.dumps(response, ensure_ascii=False, indent=2))
            return 0 if "error" not in response else 1

        if args.call:
            tool_args = parse_json_arg(args.args)
            response = request(
                process,
                {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": args.call, "arguments": tool_args}},
            )
            print(json.dumps(response, ensure_ascii=False, indent=2))
            is_error = response.get("result", {}).get("isError", False)
            return 1 if "error" in response or is_error else 0

        print(json.dumps(init, ensure_ascii=False, indent=2))
        return 0
    finally:
        process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
