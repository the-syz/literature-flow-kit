#!/usr/bin/env python3
"""
zotero.py — Zotero Desktop local API CLI helper

Provides 5 subcommands that wrap the Zotero Desktop local HTTP API
(http://127.0.0.1:23119) for use by the zotero_mcp_server.

Usage:
    python zotero.py status --json
    python zotero.py search "heat exchanger" --json
    python zotero.py search "heat exchanger" --with-bibtex-keys --json
    python zotero.py tags --json
    python zotero.py collections --json
    python zotero.py export-bibtex --out references.bib
    python zotero.py export-bibtex --item-key ABC123 --include-children --out refs.bib

Requirements:
    - Zotero Desktop must be running (local API on port 23119)
    - Python 3.8+ (stdlib only, no third-party packages)
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE = "http://127.0.0.1:23119"
TIMEOUT = 15


# ─── HTTP helper ──────────────────────────────────────────────────────────────

def local_request(path: str, method: str = "GET", data: Any | None = None) -> Any:
    """Make a request to the Zotero local API and return parsed JSON."""
    url = f"{DEFAULT_BASE}{path}"
    headers = {"Accept": "application/json"}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read()
            if not raw:
                return None
            text = raw.decode("utf-8", errors="replace")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw": text}
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Cannot connect to Zotero Desktop local API at {DEFAULT_BASE}. "
            f"Ensure Zotero Desktop is running. Error: {exc.reason}"
        ) from exc
    except ConnectionError as exc:
        raise RuntimeError(
            f"Cannot connect to Zotero Desktop local API at {DEFAULT_BASE}. "
            f"Ensure Zotero Desktop is running. Error: {exc}"
        ) from exc


# ─── Subcommand: status ──────────────────────────────────────────────────────

def cmd_status(args: argparse.Namespace) -> dict[str, Any]:
    """Check Zotero Desktop local API and connector readiness."""
    try:
        # The Zotero local API doesn't have a dedicated health endpoint,
        # but requesting /api/users/0/items with limit=1 will succeed if running.
        result = local_request("/api/users/0/items?limit=1&format=json")
        return {
            "status": "running",
            "api_base": DEFAULT_BASE,
            "message": "Zotero Desktop local API is accessible",
        }
    except RuntimeError as exc:
        return {
            "status": "not_running",
            "api_base": DEFAULT_BASE,
            "error": str(exc),
        }


# ─── Subcommand: search ──────────────────────────────────────────────────────

def cmd_search(args: argparse.Namespace) -> dict[str, Any]:
    """Search top-level items in the local Zotero Desktop library."""
    query = urllib.parse.quote(args.query)
    path = f"/api/users/0/items?q={query}&qmode=everything&itemType=-attachment%20||%20note&format=json&limit=50"

    items = local_request(path)
    if not isinstance(items, list):
        items = []

    results = []
    for item in items:
        data = item.get("data", item)
        entry: dict[str, Any] = {
            "key": data.get("key"),
            "title": data.get("title"),
            "itemType": data.get("itemType"),
            "date": data.get("date"),
            "doi": data.get("DOI"),
            "creators": _summarize_creators(data.get("creators", [])),
            "tags": [t.get("tag", "") for t in data.get("tags", [])],
            "collections": data.get("collections", []),
        }

        if args.with_bibtex_keys:
            # Generate a simple citation key: AuthorYear + first word of title
            entry["bibtex_key"] = _guess_bibtex_key(data)

        results.append(entry)

    return {"query": args.query, "count": len(results), "items": results}


def _summarize_creators(creators: list[dict]) -> list[str]:
    """Convert creator objects to 'LastName, FirstName' strings."""
    result = []
    for c in creators:
        last = c.get("lastName", "")
        first = c.get("firstName", "")
        if last:
            result.append(f"{last}, {first}" if first else last)
        elif c.get("name"):
            result.append(c["name"])
    return result


def _guess_bibtex_key(data: dict[str, Any]) -> str:
    """Generate a rough BibTeX citation key (AuthorYearTitleword)."""
    creators = data.get("creators", [])
    year = str(data.get("date", ""))[:4]
    title = data.get("title", "")

    author_part = ""
    if creators:
        last = creators[0].get("lastName", "") or creators[0].get("name", "")
        # Keep only ASCII letters for the key
        author_part = "".join(ch for ch in last if ch.isascii() and ch.isalpha())

    title_part = ""
    for word in title.split():
        if word and word[0].isalpha():
            title_part = "".join(ch for ch in word if ch.isascii() and ch.isalpha())
            break

    return f"{author_part}{year}{title_part}"


# ─── Subcommand: tags ────────────────────────────────────────────────────────

def cmd_tags(args: argparse.Namespace) -> dict[str, Any]:
    """List all tags from the local Zotero Desktop library."""
    path = "/api/users/0/tags?format=json&limit=500"
    tags = local_request(path)
    if not isinstance(tags, list):
        tags = []

    tag_list = []
    for tag in tags:
        tag_data = tag.get("data", tag)
        tag_list.append({
            "tag": tag_data.get("tag", ""),
            "count": tag_data.get("meta", {}).get("numItems", 0) if isinstance(tag_data.get("meta"), dict) else 0,
        })

    # Sort by count descending
    tag_list.sort(key=lambda x: x["count"], reverse=True)
    return {"count": len(tag_list), "tags": tag_list}


# ─── Subcommand: collections ─────────────────────────────────────────────────

def cmd_collections(args: argparse.Namespace) -> dict[str, Any]:
    """List all collections from the local Zotero Desktop library."""
    path = "/api/users/0/collections?format=json&limit=100"
    collections = local_request(path)
    if not isinstance(collections, list):
        collections = []

    coll_list = []
    for coll in collections:
        data = coll.get("data", coll)
        coll_list.append({
            "key": data.get("key"),
            "name": data.get("name"),
            "parentCollection": data.get("parentCollection") or "",
            "numItems": coll.get("meta", {}).get("numItems", 0) if isinstance(coll.get("meta"), dict) else 0,
        })

    return {"count": len(coll_list), "collections": coll_list}


# ─── Subcommand: export-bibtex ───────────────────────────────────────────────

def cmd_export_bibtex(args: argparse.Namespace) -> dict[str, Any]:
    """Export local Zotero items as BibTeX.

    Uses the Zotero local API's /better-bibtex/export endpoint if available
    (requires Better BibTeX plugin), otherwise falls back to /export with
    format=bibtex.
    """
    # Determine item keys
    item_keys: list[str] = []
    if args.item_key:
        item_keys = [args.item_key]
    else:
        # Export all top-level items
        path = "/api/users/0/items?itemType=-attachment%20||%20note&format=json&limit=500"
        items = local_request(path)
        if isinstance(items, list):
            item_keys = [item.get("key", "") for item in items if item.get("key")]

    if not item_keys:
        return {"success": False, "error": "No items found to export", "exported": 0}

    # Try Better BibTeX endpoint first
    bibtex_content = None
    try:
        keys_query = "&".join("itemKey=" + k for k in item_keys)
        bbt_path = "/better-bibtex/export?" + keys_query + "&format=bibtex"
        result = local_request(bbt_path)
        if isinstance(result, dict) and result.get("raw"):
            bibtex_content = result["raw"]
        elif isinstance(result, str):
            bibtex_content = result
    except RuntimeError:
        pass  # Better BibTeX not installed, fall through

    # Fallback: use Zotero's built-in BibTeX export
    if bibtex_content is None:
        try:
            keys_param = "%2C".join(item_keys)
            export_path = f"/api/users/0/items?itemKey={keys_param}&format=bibtex"
            raw = local_request(export_path)
            if isinstance(raw, dict) and raw.get("raw"):
                bibtex_content = raw["raw"]
            elif isinstance(raw, str):
                bibtex_content = raw
            elif isinstance(raw, list):
                # Sometimes returns a list of strings
                bibtex_content = "\n".join(str(entry) for entry in raw)
        except RuntimeError as exc:
            return {"success": False, "error": str(exc), "exported": 0}

    if bibtex_content is None:
        bibtex_content = ""

    # Write to file
    out_path = args.out or "references.bib"
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(bibtex_content)
    except OSError as exc:
        return {"success": False, "error": f"Cannot write to {out_path}: {exc}", "exported": 0}

    # Include children if requested (append their entries)
    if args.include_children and item_keys:
        for key in item_keys:
            try:
                child_path = f"/api/users/0/items/{key}/children?format=bibtex"
                child_raw = local_request(child_path)
                child_content = None
                if isinstance(child_raw, dict) and child_raw.get("raw"):
                    child_content = child_raw["raw"]
                elif isinstance(child_raw, str):
                    child_content = child_raw
                elif isinstance(child_raw, list):
                    child_content = "\n".join(str(e) for e in child_raw)

                if child_content:
                    with open(out_path, "a", encoding="utf-8") as f:
                        f.write("\n" + child_content)
            except RuntimeError:
                pass  # Skip children that fail

    return {
        "success": True,
        "exported": len(item_keys),
        "out": out_path,
        "include_children": args.include_children,
    }


# ─── CLI entry point ─────────────────────────────────────────────────────────

def main() -> None:
    # Use a common parent parser so --json works with any subcommand
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="Output results as JSON (for programmatic use)")

    parser = argparse.ArgumentParser(
        prog="zotero.py",
        description="Zotero Desktop local API CLI helper",
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommand")

    # status
    sub_status = subparsers.add_parser("status", help="Check Zotero Desktop readiness", parents=[common])
    sub_status.set_defaults(func=cmd_status)

    # search
    sub_search = subparsers.add_parser("search", help="Search items in local library", parents=[common])
    sub_search.add_argument("query", help="Search query string")
    sub_search.add_argument("--with-bibtex-keys", action="store_true", help="Include guessed BibTeX citation keys")
    sub_search.set_defaults(func=cmd_search)

    # tags
    sub_tags = subparsers.add_parser("tags", help="List all tags", parents=[common])
    sub_tags.set_defaults(func=cmd_tags)

    # collections
    sub_coll = subparsers.add_parser("collections", help="List all collections", parents=[common])
    sub_coll.set_defaults(func=cmd_collections)

    # export-bibtex
    sub_export = subparsers.add_parser("export-bibtex", help="Export items as BibTeX", parents=[common])
    sub_export.add_argument("--item-key", default="", help="Specific item key to export (default: all)")
    sub_export.add_argument("--include-children", action="store_true", help="Include child items (attachments, notes)")
    sub_export.add_argument("--out", default="references.bib", help="Output file path (default: references.bib)")
    sub_export.set_defaults(func=cmd_export_bibtex)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        result = args.func(args)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            # Human-readable output
            if isinstance(result, dict):
                print(json.dumps(result, ensure_ascii=False, indent=2))
            else:
                print(result)
    except Exception as exc:
        error_result = {"error": str(exc), "command": args.command}
        if args.json:
            print(json.dumps(error_result, ensure_ascii=False, indent=2))
        else:
            print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
