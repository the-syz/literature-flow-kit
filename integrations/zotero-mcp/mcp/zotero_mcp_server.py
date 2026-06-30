#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import winreg
import http.client
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from common_mcp import MCPServer, ToolError


ZOTERO_SCRIPT = Path(os.environ.get("ZOTERO_HELPER_SCRIPT", ""))
PYTHON_EXE = sys.executable
API_VERSION = "3"
DEFAULT_API_BASE = "https://api.zotero.org"
DEFAULT_LOCAL_BASE = "http://127.0.0.1:23119"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ENV_FILE = PROJECT_ROOT / ".env"

mcp = MCPServer("zotero", "1.0.0")


def run_zotero_cli(args: list[str], json_output: bool = True) -> dict[str, Any]:
    if not ZOTERO_SCRIPT.is_file():
        return {
            "error": "Zotero helper script not configured. Set ZOTERO_HELPER_SCRIPT to the local zotero.py helper path.",
            "expectedEnv": "ZOTERO_HELPER_SCRIPT",
        }
    cmd = [PYTHON_EXE, str(ZOTERO_SCRIPT), *args]
    if json_output:
        cmd.append("--json")
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    stdout = result.stdout.strip()
    stderr = result.stderr.strip()

    if json_output and stdout:
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            payload = {"raw_stdout": stdout}
    else:
        payload = {"stdout": stdout}

    if stderr:
        payload["stderr"] = stderr
    if result.returncode != 0:
        payload["exitCode"] = result.returncode
        payload["error"] = payload.get("error") or stderr or stdout or f"Exit code {result.returncode}"
    return payload


def env_value(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    return value.strip() if isinstance(value, str) else default


def project_env_value(name: str, default: str = "") -> str:
    if not PROJECT_ENV_FILE.is_file():
        return default
    try:
        for line in PROJECT_ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    except OSError:
        return default
    return default


def registry_env_value(name: str, default: str = "") -> str:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value).strip()
    except OSError:
        return default


def require_env(name: str) -> str:
    value = env_value(name) or project_env_value(name) or registry_env_value(name)
    if name == "ZOTERO_API_KEY" and value:
        match = re.search(r"[A-Za-z0-9]{24}", value)
        if match:
            value = match.group(0)
    if not value:
        raise ToolError(f"Missing required environment variable: {name}")
    return value


def config_value(name: str, default: str = "") -> str:
    return env_value(name) or project_env_value(name) or registry_env_value(name) or default


def api_base() -> str:
    return config_value("ZOTERO_API_BASE_URL", DEFAULT_API_BASE).rstrip("/")


def user_library_path() -> str:
    user_id = require_env("ZOTERO_USER_ID")
    if not user_id.isdigit():
        raise ToolError("ZOTERO_USER_ID must be a numeric Zotero userID, not a username or key id")
    return f"/users/{user_id}"


def zotero_request(
    method: str,
    path: str,
    *,
    query: dict[str, str] | None = None,
    body: Any | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], Any]:
    api_key = require_env("ZOTERO_API_KEY")
    url = f"{api_base()}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)

    data = None
    headers = {
        "Zotero-API-Key": api_key,
        "Zotero-API-Version": API_VERSION,
        "User-Agent": "literature-workflow/1.0",
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)

    last_error = ""
    for attempt in range(2):
        request = urllib.request.Request(url, data=data, method=method.upper(), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                parsed = parse_response(raw, response.headers.get("Content-Type", ""))
                return response.status, dict(response.headers.items()), parsed
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            parsed = parse_response(raw, exc.headers.get("Content-Type", ""))
            message = parsed if isinstance(parsed, str) else json.dumps(parsed, ensure_ascii=False)
            raise ToolError(f"Zotero API {method.upper()} {path} failed with HTTP {exc.code}: {message}")
        except (urllib.error.URLError, http.client.RemoteDisconnected, TimeoutError, ConnectionError) as exc:
            last_error = str(exc)
            if attempt == 0:
                time.sleep(1)
                continue
            break
    return zotero_request_powershell(method, url, headers, body, path, last_error)


def zotero_request_powershell(
    method: str,
    url: str,
    headers: dict[str, str],
    body: Any | None,
    path: str,
    previous_error: str,
) -> tuple[int, dict[str, str], Any]:
    safe_headers = {key: value for key, value in headers.items() if key != "Zotero-API-Key"}
    payload = {
        "method": method.upper(),
        "url": url,
        "headers": headers,
        "body": body,
    }
    script = r"""
$ErrorActionPreference = 'Stop'
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$headers = @{}
$payload.headers.PSObject.Properties | ForEach-Object { $headers[$_.Name] = [string]$_.Value }
$params = @{
  Method = $payload.method
  Uri = $payload.url
  Headers = $headers
  TimeoutSec = 30
}
if ($null -ne $payload.body) {
  $params.Body = ($payload.body | ConvertTo-Json -Depth 20 -Compress)
  $params.ContentType = 'application/json'
}
$response = Invoke-WebRequest @params
$result = @{
  status = [int]$response.StatusCode
  headers = @{}
  body = $response.Content
}
$response.Headers.GetEnumerator() | ForEach-Object { $result.headers[$_.Key] = [string]$_.Value }
$result | ConvertTo-Json -Depth 20 -Compress
"""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            input=json.dumps(payload, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=45,
        )
    except Exception as exc:
        raise ToolError(f"Zotero API connection failed after retry and PowerShell fallback: {previous_error}; fallback={exc}")

    if result.returncode != 0:
        stderr = (result.stderr or result.stdout or "").strip()
        raise ToolError(f"Zotero API {method.upper()} {path} failed after retry and PowerShell fallback: {previous_error}; fallback={stderr}")
    try:
        wrapper = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ToolError(f"Zotero API PowerShell fallback returned invalid JSON: {exc}")
    status = int(wrapper.get("status", 0))
    content = str(wrapper.get("body", ""))
    parsed = parse_response(content.encode("utf-8"), str(wrapper.get("headers", {}).get("Content-Type", "")))
    return status, wrapper.get("headers", safe_headers), parsed


def parse_response(raw: bytes, content_type: str) -> Any:
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    if "json" in content_type.lower():
        return json.loads(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", title.lower(), flags=re.UNICODE)).strip()


def tag_objects(tags: list[str] | str) -> list[dict[str, str]]:
    if isinstance(tags, str):
        tags = [part.strip() for part in re.split(r"[,;，；]", tags) if part.strip()]
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for tag in tags:
        clean = str(tag).strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        result.append({"tag": clean})
    return result


def parse_collection_path(collection_path: list[str] | str) -> list[str]:
    if isinstance(collection_path, str):
        parts = [part.strip() for part in re.split(r"[\\/]", collection_path) if part.strip()]
    else:
        parts = [str(part).strip() for part in collection_path if str(part).strip()]
    return parts or ["文献索引"]


def split_authors(authors: list[str] | str) -> list[dict[str, str]]:
    if isinstance(authors, str):
        authors = [part.strip() for part in re.split(r";|；", authors) if part.strip()]
    creators: list[dict[str, str]] = []
    for author in authors:
        name = str(author).strip()
        if not name:
            continue
        if "," in name:
            last, first = [part.strip() for part in name.split(",", 1)]
        else:
            parts = name.split()
            if len(parts) >= 2:
                first = " ".join(parts[:-1])
                last = parts[-1]
            else:
                first = ""
                last = name
        creators.append({"creatorType": "author", "firstName": first, "lastName": last})
    return creators


def extra_text(
    local_path: str,
    source_path: str,
    sha256: str,
    archive_index: str,
    ima_status: str,
    existing_extra: str = "",
) -> str:
    managed = {
        "Local-Path": local_path,
        "Original-Path": source_path,
        "SHA256": sha256,
        "Archive-Index": archive_index,
        "IMA-Status": ima_status,
        "Managed-By": "literature-workflow",
    }
    preserved: list[str] = []
    for line in str(existing_extra or "").splitlines():
        if not any(line.startswith(f"{key}:") for key in managed):
            preserved.append(line)
    managed_lines = [f"{key}: {value}" for key, value in managed.items() if value]
    return "\n".join([*preserved, *managed_lines]).strip()


def item_summary(item: dict[str, Any]) -> dict[str, Any]:
    data = item.get("data", item)
    return {
        "key": data.get("key"),
        "version": data.get("version") or item.get("version"),
        "title": data.get("title"),
        "date": data.get("date"),
        "DOI": data.get("DOI"),
        "tags": [tag.get("tag") for tag in data.get("tags", [])],
        "collections": data.get("collections", []),
    }


def find_items(query: str) -> list[dict[str, Any]]:
    _, _, payload = zotero_request(
        "GET",
        f"{user_library_path()}/items",
        query={"q": query, "qmode": "everything", "itemType": "-attachment || note", "format": "json", "limit": "25"},
    )
    return payload if isinstance(payload, list) else []


def find_by_sha256(sha256: str) -> dict[str, Any] | None:
    if not sha256:
        return None
    for item in find_items(sha256):
        data = item.get("data", {})
        if f"SHA256: {sha256}" in str(data.get("extra", "")):
            return item
    return None


def find_by_title_year(title: str, year: str) -> dict[str, Any] | None:
    wanted = normalize_title(title)
    for item in find_items(title):
        data = item.get("data", {})
        if normalize_title(str(data.get("title", ""))) != wanted:
            continue
        item_year = str(data.get("date", ""))[:4]
        if not year or not item_year or item_year == str(year):
            return item
    return None


def get_item_template(item_type: str = "journalArticle") -> dict[str, Any]:
    _, _, payload = zotero_request("GET", "/items/new", query={"itemType": item_type})
    if not isinstance(payload, dict):
        raise ToolError(f"Unexpected Zotero template response for itemType={item_type}")
    return payload


def get_collections() -> list[dict[str, Any]]:
    _, _, payload = zotero_request("GET", f"{user_library_path()}/collections", query={"format": "json", "limit": "100"})
    return payload if isinstance(payload, list) else []


def create_collection(name: str, parent_key: str = "") -> dict[str, Any]:
    payload: dict[str, Any] = {"name": name}
    if parent_key:
        payload["parentCollection"] = parent_key
    _, _, response = zotero_request("POST", f"{user_library_path()}/collections", body=[payload])
    if not isinstance(response, dict):
        raise ToolError("Unexpected Zotero collection create response")
    success = response.get("success", {})
    if "0" not in success:
        raise ToolError(f"Zotero collection create failed: {json.dumps(response, ensure_ascii=False)}")
    collection_key = success["0"]
    _, _, collection = zotero_request("GET", f"{user_library_path()}/collections/{collection_key}")
    return collection


def get_or_create_collection_path(collection_path: list[str] | str) -> dict[str, Any]:
    parts = parse_collection_path(collection_path)
    parent_key = ""
    selected: dict[str, Any] | None = None

    for part in parts:
        collections = get_collections()
        match = None
        for collection in collections:
            data = collection.get("data", {})
            if data.get("name") == part and str(data.get("parentCollection") or "") == parent_key:
                match = collection
                break
        if match is None:
            match = create_collection(part, parent_key)
        selected = match
        parent_key = selected.get("data", {}).get("key", "")

    if not selected:
        raise ToolError("Failed to resolve collection path")
    return selected


def post_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    _, headers, payload = zotero_request("POST", f"{user_library_path()}/items", body=items)
    if not isinstance(payload, dict):
        raise ToolError("Unexpected Zotero item create response")
    return {"headers": headers, "payload": payload}


def put_item(item_key: str, item_data: dict[str, Any], version: int | str) -> dict[str, Any]:
    status, headers, payload = zotero_request(
        "PUT",
        f"{user_library_path()}/items/{item_key}",
        body=item_data,
        extra_headers={"If-Unmodified-Since-Version": str(version)},
    )
    return {"statusCode": status, "headers": headers, "payload": payload}


@mcp.tool()
def zotero_local_status() -> dict[str, Any]:
    """Check Zotero Desktop local API and connector readiness."""
    return run_zotero_cli(["status"], json_output=True)


@mcp.tool()
def zotero_local_search(query: str, with_bibtex_keys: bool = False) -> dict[str, Any]:
    """Search top-level items in the local Zotero Desktop library."""
    args = ["search", query]
    if with_bibtex_keys:
        args.append("--with-bibtex-keys")
    return run_zotero_cli(args, json_output=True)


@mcp.tool()
def zotero_local_tags() -> dict[str, Any]:
    """List tags from the local Zotero Desktop library."""
    return run_zotero_cli(["tags"], json_output=True)


@mcp.tool()
def zotero_local_collections() -> dict[str, Any]:
    """List collections from the local Zotero Desktop library."""
    return run_zotero_cli(["collections"], json_output=True)


@mcp.tool()
def zotero_local_export_bibtex(out: str = "references.bib", item_key: str = "", include_children: bool = False) -> dict[str, Any]:
    """Export local Zotero items as BibTeX."""
    args = ["export-bibtex"]
    if item_key:
        args.extend(["--item-key", item_key])
    if include_children:
        args.append("--include-children")
    if out:
        args.extend(["--out", out])
    return run_zotero_cli(args, json_output=False)


@mcp.tool()
def zotero_web_key_info() -> dict[str, Any]:
    """Validate the Zotero Web API key and report non-secret identity and permissions."""
    _, headers, payload = zotero_request("GET", "/keys/current")
    if not isinstance(payload, dict):
        raise ToolError("Unexpected Zotero key info response")
    access = payload.get("access", {})
    return {
        "userID": payload.get("userID"),
        "username": payload.get("username"),
        "access": access,
        "write": bool(access.get("user", {}).get("write")),
        "library": bool(access.get("user", {}).get("library")),
        "files": bool(access.get("user", {}).get("files")),
        "apiVersion": headers.get("Zotero-API-Version") or API_VERSION,
    }


@mcp.tool()
def zotero_web_find_items_by_doi(doi: str) -> dict[str, Any]:
    """Find Zotero Web API items by DOI."""
    doi = doi.strip()
    if not doi:
        return {"items": []}
    items = []
    for item in find_items(doi):
        data = item.get("data", {})
        if str(data.get("DOI", "")).lower() == doi.lower():
            items.append(item_summary(item))
    return {"items": items}


@mcp.tool()
def zotero_web_find_items_by_title(title: str, year: str = "") -> dict[str, Any]:
    """Find Zotero Web API items by exact normalized title and optional year."""
    match = find_by_title_year(title, year)
    return {"items": [item_summary(match)] if match else []}


@mcp.tool()
def zotero_web_list_collections() -> dict[str, Any]:
    """List Zotero Web API collections."""
    return {
        "collections": [
            {
                "key": collection.get("data", {}).get("key"),
                "name": collection.get("data", {}).get("name"),
                "parentCollection": collection.get("data", {}).get("parentCollection") or "",
                "version": collection.get("data", {}).get("version") or collection.get("version"),
            }
            for collection in get_collections()
        ]
    }


@mcp.tool()
def zotero_web_get_or_create_collection(collection_path: str = "文献索引/MCP测试") -> dict[str, Any]:
    """Get or create a slash-separated Zotero collection path."""
    collection = get_or_create_collection_path(collection_path)
    data = collection.get("data", {})
    return {
        "key": data.get("key"),
        "name": data.get("name"),
        "parentCollection": data.get("parentCollection") or "",
        "version": data.get("version") or collection.get("version"),
    }


@mcp.tool()
def zotero_web_create_or_update_index_item(
    title: str,
    year: str = "",
    doi: str = "",
    authors: str = "",
    publication_title: str = "",
    abstract_note: str = "",
    local_path: str = "",
    source_path: str = "",
    sha256: str = "",
    tags: str = "",
    collection_path: str = "文献索引/自己找的文献",
    archive_index: str = "",
    ima_status: str = "",
) -> dict[str, Any]:
    """Create or update an index-only Zotero journalArticle with tags and collection membership."""
    clean_title = title.strip()
    if not clean_title:
        raise ToolError("title is required")

    collection = get_or_create_collection_path(collection_path)
    collection_key = collection.get("data", {}).get("key")

    matched_by = "none"
    existing = None
    if doi.strip():
        doi_matches = zotero_web_find_items_by_doi(doi.strip()).get("items", [])
        if doi_matches:
            _, _, existing = zotero_request("GET", f"{user_library_path()}/items/{doi_matches[0]['key']}")
            matched_by = "doi"
    if existing is None:
        existing = find_by_sha256(sha256.strip())
        if existing is not None:
            matched_by = "sha256"
    if existing is None:
        existing = find_by_title_year(clean_title, year.strip())
        if existing is not None:
            matched_by = "title_year"

    item_tags = tag_objects(tags)
    if ima_status:
        item_tags.extend(tag_objects([f"IMA:{ima_status}"]))
    if config_value("ZOTERO_SYNC_MODE", "index-only") == "index-only":
        item_tags.extend(tag_objects(["index-only"]))

    if existing is not None:
        data = existing.get("data", existing)
        existing_tags = tag_objects([tag.get("tag", "") for tag in data.get("tags", [])])
        tag_map = {tag["tag"]: tag for tag in [*existing_tags, *item_tags]}
        collection_keys = list(dict.fromkeys([*data.get("collections", []), collection_key]))
        data.update(
            {
                "title": clean_title,
                "date": year.strip() or data.get("date", ""),
                "DOI": doi.strip() or data.get("DOI", ""),
                "publicationTitle": publication_title.strip() or data.get("publicationTitle", ""),
                "abstractNote": abstract_note.strip() or data.get("abstractNote", ""),
                "creators": split_authors(authors) or data.get("creators", []),
                "tags": list(tag_map.values()),
                "collections": collection_keys,
                "extra": extra_text(local_path, source_path, sha256, archive_index, ima_status, data.get("extra", "")),
            }
        )
        version = data.get("version") or existing.get("version")
        put_item(data["key"], data, version)
        _, headers, updated = zotero_request("GET", f"{user_library_path()}/items/{data['key']}")
        return {
            "status": "updated",
            "matchedBy": matched_by,
            "item": item_summary(updated),
            "collectionKey": collection_key,
            "libraryVersion": headers.get("Last-Modified-Version"),
        }

    item = get_item_template("journalArticle")
    item.update(
        {
            "title": clean_title,
            "date": year.strip(),
            "DOI": doi.strip(),
            "publicationTitle": publication_title.strip(),
            "abstractNote": abstract_note.strip(),
            "creators": split_authors(authors),
            "tags": item_tags,
            "collections": [collection_key],
            "extra": extra_text(local_path, source_path, sha256, archive_index, ima_status),
        }
    )
    response = post_items([item])
    payload = response["payload"]
    success = payload.get("success", {})
    if "0" not in success:
        raise ToolError(f"Zotero item create failed: {json.dumps(payload, ensure_ascii=False)}")
    item_key = success["0"]
    _, headers, created = zotero_request("GET", f"{user_library_path()}/items/{item_key}")
    return {
        "status": "created",
        "matchedBy": matched_by,
        "item": item_summary(created),
        "collectionKey": collection_key,
        "libraryVersion": headers.get("Last-Modified-Version"),
    }


if __name__ == "__main__":
    mcp.run()
