"""Minimal MCP server for controlled EndNote write operations.

The default create path prepares RIS import records for EndNote Desktop.
For disposable test libraries, this server also exposes an experimental
direct insert tool that writes both the ``.enl`` database and the
``.Data/sdb/sdb.eni`` mirror.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("EndNote Write MCP")

SORT_TRIGGER = "refs__refs_ord_AU"
ENDNOTE_DB_REFERENCE_TYPES = {
    "Journal Article": 0,
}
ENDNOTE_XML_REFERENCE_TYPES = {
    "Journal Article": 17,
}
SAFE_WRITE_FIELDS = {
    "research_notes",
    "notes",
    "keywords",
    "read_status",
    "rating",
    "label",
    "caption",
    "custom_1",
    "custom_2",
    "custom_3",
    "custom_4",
    "custom_5",
    "custom_6",
    "custom_7",
    "translated_title",
    "translated_author",
}
READ_FIELDS = [
    "id",
    "trash_state",
    "reference_type",
    "author",
    "year",
    "title",
    "secondary_title",
    "keywords",
    "abstract",
    "label",
    "url",
    "notes",
    "custom_1",
    "custom_2",
    "custom_3",
    "custom_4",
    "custom_5",
    "custom_6",
    "custom_7",
    "electronic_resource_number",
    "translated_author",
    "translated_title",
    "research_notes",
    "read_status",
    "rating",
]


def _json(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _resolve_path(value: str | None, env_name: str | None = None) -> Path:
    raw = value or (os.environ.get(env_name) if env_name else None)
    if not raw:
        raise ValueError(f"Missing path. Provide argument or set {env_name}.")
    return Path(raw).expanduser().resolve()


def _library_paths(library_path: str | None) -> tuple[Path, Path]:
    enl = _resolve_path(library_path, "ENDNOTE_LIBRARY")
    if enl.suffix.lower() != ".enl":
        raise ValueError(f"EndNote library must be an .enl file: {enl}")
    sdb = enl.with_suffix(".Data") / "sdb" / "sdb.eni"
    return enl, sdb


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.create_function("EN_MAKE_SORT_KEY", 3, _make_sort_key)
    conn.create_collation("ENCIN_zh_CN", _endnote_collation)
    conn.create_collation("ENCI_Base", _endnote_collation)
    return conn


def _make_sort_key(value: Any, sort_mode: Any = 0, max_len: Any = 12) -> str:
    text = str(value or "").strip().lower()
    try:
        limit = int(max_len)
    except (TypeError, ValueError):
        limit = 12
    return text[:limit]


def _endnote_collation(left: Any, right: Any) -> int:
    left_text = str(left or "").casefold()
    right_text = str(right or "").casefold()
    if left_text < right_text:
        return -1
    if left_text > right_text:
        return 1
    return 0


def _read_record(enl: Path, ref_id: int) -> dict[str, Any] | None:
    fields = ", ".join(READ_FIELDS)
    with _connect(enl) as conn:
        row = conn.execute(f"SELECT {fields} FROM refs WHERE id = ?", (ref_id,)).fetchone()
        if row is None:
            return None
        data = {key: row[key] for key in row.keys()}
        data["doi"] = data.get("electronic_resource_number") or ""
        data["journal"] = data.get("secondary_title") or ""
        return data


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _ensure_library_ready(enl: Path, sdb: Path) -> None:
    if not enl.exists():
        raise FileNotFoundError(f"EndNote .enl not found: {enl}")
    if not sdb.exists():
        raise FileNotFoundError(f"EndNote sdb.eni mirror not found: {sdb}")
    with _connect(enl) as conn:
        if not _table_exists(conn, "refs"):
            raise ValueError(f"refs table not found in {enl}")
    with _connect(sdb) as conn:
        if not _table_exists(conn, "refs"):
            raise ValueError(f"refs table not found in {sdb}")


def _backup_library(enl: Path, sdb: Path, backup_dir: str | None) -> dict[str, str]:
    target_dir = _resolve_path(backup_dir, "ENDNOTE_BACKUP_DIR")
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    enl_backup = target_dir / f"{enl.stem}.{stamp}.enl.bak"
    sdb_backup = target_dir / f"{enl.stem}.{stamp}.sdb.eni.bak"
    shutil.copy2(enl, enl_backup)
    shutil.copy2(sdb, sdb_backup)
    return {"enl": str(enl_backup), "sdb": str(sdb_backup)}


def _exec_both(conns: list[sqlite3.Connection], sql: str, params: tuple[Any, ...]) -> None:
    for conn in conns:
        conn.execute(sql, params)


@contextmanager
def _refs_update_tx(conns: list[sqlite3.Connection]) -> Iterator[None]:
    backups: list[tuple[sqlite3.Connection, str]] = []
    try:
        for conn in conns:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
                (SORT_TRIGGER,),
            ).fetchone()
            if row and row[0]:
                conn.execute(f"DROP TRIGGER {SORT_TRIGGER}")
                backups.append((conn, row[0]))
        yield
        for conn, trigger_sql in backups:
            conn.execute(trigger_sql)
        for conn in conns:
            conn.commit()
    except Exception:
        for conn in conns:
            try:
                conn.rollback()
            except sqlite3.Error:
                pass
        raise


def _split_multivalue(value: str) -> list[str]:
    return [item.strip() for item in value.split("\r") if item.strip()]


def _merge_keywords(current: str, incoming: list[str]) -> str:
    existing = _split_multivalue(current or "")
    seen = {item.lower() for item in existing}
    for item in incoming:
        clean = str(item).strip()
        if clean and clean.lower() not in seen:
            existing.append(clean)
            seen.add(clean.lower())
    return "\r".join(existing)


def _ris_line(tag: str, value: Any) -> str | None:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if not text:
        return None
    return f"{tag}  - {text}"


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).replace("；", ";").replace("，", ";").replace(",", ";")
    return [item.strip() for item in text.split(";") if item.strip()]


def _format_ris(record: dict[str, Any]) -> str:
    lines: list[str] = ["TY  - JOUR"]
    for tag, key in [
        ("T1", "title"),
        ("TT", "translated_title"),
        ("PY", "year"),
        ("JO", "journal"),
        ("JF", "journal_full"),
        ("VL", "volume"),
        ("IS", "issue"),
        ("SP", "start_page"),
        ("EP", "end_page"),
        ("DO", "doi"),
        ("SN", "issn"),
        ("UR", "url"),
        ("AB", "abstract"),
    ]:
        line = _ris_line(tag, record.get(key))
        if line:
            lines.append(line)
    if record.get("pages") and not (record.get("start_page") or record.get("end_page")):
        pages = str(record["pages"]).strip()
        parts = [part.strip() for part in pages.replace("–", "-").split("-", 1)]
        if parts:
            line = _ris_line("SP", parts[0])
            if line:
                lines.append(line)
        if len(parts) > 1:
            line = _ris_line("EP", parts[1])
            if line:
                lines.append(line)
    for author in _as_list(record.get("authors")):
        line = _ris_line("AU", author)
        if line:
            lines.append(line)
    for keyword in _as_list(record.get("keywords")):
        line = _ris_line("KW", keyword)
        if line:
            lines.append(line)
    pdf_path = record.get("pdf_path") or record.get("local_path")
    if pdf_path:
        path = Path(str(pdf_path)).expanduser().resolve()
        lines.append(f"L1  - file:///{str(path).replace(os.sep, '/')}")
    for note in _as_list(record.get("notes")):
        line = _ris_line("N1", note)
        if line:
            lines.append(line)
    for key in ("archive_no", "sha256", "ima_media_id", "ima_status"):
        if record.get(key):
            lines.append(f"N1  - {key}: {record[key]}")
    lines.append("ER  -")
    return "\n".join(lines) + "\n"


def _now_endnote_stamp() -> int:
    return int(time.time())


def _authors_for_refs(authors: list[str] | str | None) -> str:
    return "\r".join(_as_list(authors))


def _keywords_for_refs(keywords: list[str] | str | None) -> str:
    return "\r".join(_as_list(keywords))


def _pages_for_refs(
    pages: str | None = None,
    start_page: str | None = None,
    end_page: str | None = None,
) -> str:
    if pages:
        return str(pages).strip()
    if start_page and end_page:
        return f"{start_page}-{end_page}"
    return str(start_page or end_page or "").strip()


def _direct_insert_payload(record: dict[str, Any], record_id: int | None = None) -> dict[str, Any]:
    stamp = _now_endnote_stamp()
    reference_type_name = str(record.get("reference_type_name") or "Journal Article").strip()
    if reference_type_name not in ENDNOTE_DB_REFERENCE_TYPES:
        raise ValueError(
            "Unsupported reference_type_name for direct insert: "
            f"{reference_type_name!r}. Supported values: {sorted(ENDNOTE_DB_REFERENCE_TYPES)}"
        )
    if "reference_type" in record or "ref_type" in record:
        raise ValueError(
            "Do not pass raw reference_type/ref_type to direct insert. "
            "Use reference_type_name instead. EndNote .enl internal codes are not "
            "the same as EndNote XML <ref-type> values."
        )
    payload: dict[str, Any] = {
        "trash_state": 0,
        "reference_type": ENDNOTE_DB_REFERENCE_TYPES[reference_type_name],
        "author": _authors_for_refs(record.get("authors")),
        "year": str(record.get("year") or ""),
        "title": str(record.get("title") or ""),
        "pages": _pages_for_refs(
            record.get("pages"),
            record.get("start_page"),
            record.get("end_page"),
        ),
        "secondary_title": str(record.get("journal") or ""),
        "volume": str(record.get("volume") or ""),
        "number": str(record.get("issue") or ""),
        "keywords": _keywords_for_refs(record.get("keywords")),
        "abstract": str(record.get("abstract") or ""),
        "url": str(record.get("url") or ""),
        "notes": "\r".join(_as_list(record.get("notes"))),
        "isbn": str(record.get("issn") or ""),
        "electronic_resource_number": str(record.get("doi") or ""),
        "translated_title": str(record.get("translated_title") or ""),
        "research_notes": str(record.get("pdf_path") or ""),
        "added_to_library": stamp,
        "record_last_updated": stamp,
    }
    if record_id is not None:
        payload["id"] = int(record_id)
    return payload


def _insert_ref(conn: sqlite3.Connection, payload: dict[str, Any]) -> int:
    columns = list(payload)
    placeholders = ", ".join(["?"] * len(columns))
    sql = f"INSERT INTO refs ({', '.join(columns)}) VALUES ({placeholders})"
    cursor = conn.execute(sql, tuple(payload[column] for column in columns))
    return int(payload.get("id") or cursor.lastrowid)


@mcp.tool()
def endnote_status(
    library_path: str | None = None,
    backup_dir: str | None = None,
    import_file: str | None = None,
) -> str:
    """Check configured EndNote paths and basic database readability."""
    try:
        enl, sdb = _library_paths(library_path)
        result: dict[str, Any] = {
            "ok": True,
            "library_path": str(enl),
            "library_exists": enl.exists(),
            "sdb_path": str(sdb),
            "sdb_exists": sdb.exists(),
            "backup_dir": str(_resolve_path(backup_dir, "ENDNOTE_BACKUP_DIR"))
            if (backup_dir or os.environ.get("ENDNOTE_BACKUP_DIR"))
            else None,
            "import_file": str(_resolve_path(import_file, "ENDNOTE_IMPORT_FILE"))
            if (import_file or os.environ.get("ENDNOTE_IMPORT_FILE"))
            else None,
        }
        if enl.exists():
            with _connect(enl) as conn:
                result["refs_table"] = _table_exists(conn, "refs")
                if result["refs_table"]:
                    result["record_count"] = conn.execute("SELECT COUNT(*) FROM refs").fetchone()[0]
        return _json(result)
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
def endnote_get_record(ref_id: int, library_path: str | None = None) -> str:
    """Read a single EndNote record by internal reference id."""
    try:
        enl, _ = _library_paths(library_path)
        record = _read_record(enl, ref_id)
        if record is None:
            return _json({"ok": False, "error": f"Reference {ref_id} not found"})
        return _json({"ok": True, "record": record})
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
def endnote_prepare_import(
    title: str,
    authors: list[str] | str | None = None,
    year: str | None = None,
    journal: str | None = None,
    journal_full: str | None = None,
    translated_title: str | None = None,
    volume: str | None = None,
    issue: str | None = None,
    pages: str | None = None,
    start_page: str | None = None,
    end_page: str | None = None,
    doi: str | None = None,
    issn: str | None = None,
    url: str | None = None,
    abstract: str | None = None,
    keywords: list[str] | str | None = None,
    pdf_path: str | None = None,
    notes: list[str] | str | None = None,
    archive_no: str | None = None,
    sha256: str | None = None,
    ima_media_id: str | None = None,
    ima_status: str | None = None,
    import_file: str | None = None,
    append: bool = True,
    dry_run: bool = True,
) -> str:
    """Prepare a RIS file for creating a new reference through EndNote import."""
    try:
        if not title.strip():
            raise ValueError("title is required")
        target = _resolve_path(import_file, "ENDNOTE_IMPORT_FILE")
        record = {
            "title": title,
            "authors": authors,
            "year": year,
            "journal": journal,
            "journal_full": journal_full,
            "translated_title": translated_title,
            "volume": volume,
            "issue": issue,
            "pages": pages,
            "start_page": start_page,
            "end_page": end_page,
            "doi": doi,
            "issn": issn,
            "url": url,
            "abstract": abstract,
            "keywords": keywords,
            "pdf_path": pdf_path,
            "notes": notes,
            "archive_no": archive_no,
            "sha256": sha256,
            "ima_media_id": ima_media_id,
            "ima_status": ima_status,
        }
        ris = _format_ris(record)
        if dry_run:
            return _json({"ok": True, "dry_run": True, "import_file": str(target), "ris": ris})
        target.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append and target.exists() else "w"
        with target.open(mode, encoding="utf-8", newline="\n") as handle:
            if mode == "a":
                handle.write("\n")
            handle.write(ris)
        return _json({
            "ok": True,
            "dry_run": False,
            "import_file": str(target),
            "message": "RIS prepared. Import it from EndNote Desktop to create the record.",
        })
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
def endnote_direct_insert_records(
    records: list[dict[str, Any]],
    library_path: str | None = None,
    backup_dir: str | None = None,
    dry_run: bool = True,
    confirm: bool = False,
    allow_experimental_direct_insert: bool = False,
) -> str:
    """Experimentally insert new records into a disposable EndNote test library.

    This bypasses EndNote Desktop import. It is intended for controlled tests
    only, and writes both the .enl database and .Data/sdb/sdb.eni mirror.
    """
    try:
        if not records:
            raise ValueError("records is required")
        enl, sdb = _library_paths(library_path)
        _ensure_library_ready(enl, sdb)

        with _connect(enl) as conn:
            next_id = int(conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM refs").fetchone()[0])

        plan: list[dict[str, Any]] = []
        payloads: list[dict[str, Any]] = []
        for offset, record in enumerate(records):
            title = str(record.get("title") or "").strip()
            if not title:
                raise ValueError(f"records[{offset}].title is required")
            payload = _direct_insert_payload(record, next_id + offset)
            payloads.append(payload)
            plan.append({
                "id": payload["id"],
                "reference_type_name": str(record.get("reference_type_name") or "Journal Article"),
                "reference_type_internal": payload["reference_type"],
                "title": payload["title"],
                "authors": payload["author"],
                "year": payload["year"],
                "journal": payload["secondary_title"],
                "doi": payload["electronic_resource_number"],
                "pages": payload["pages"],
                "pdf_path": payload["research_notes"],
            })

        if dry_run:
            return _json({"ok": True, "dry_run": True, "mode": "experimental_direct_insert", "plan": plan})
        if not allow_experimental_direct_insert:
            raise ValueError("allow_experimental_direct_insert=true is required for direct inserts")
        if not confirm:
            raise ValueError("confirm=true is required for direct inserts")

        backups = _backup_library(enl, sdb, backup_dir)
        conns = [_connect(enl), _connect(sdb)]
        try:
            for conn in conns:
                conn.execute("BEGIN")
            for payload in payloads:
                for conn in conns:
                    _insert_ref(conn, payload)
            for conn in conns:
                conn.commit()
        except Exception:
            for conn in conns:
                try:
                    conn.rollback()
                except sqlite3.Error:
                    pass
            raise
        finally:
            for conn in conns:
                conn.close()

        inserted_enl = [_read_record(enl, int(payload["id"])) for payload in payloads]
        inserted_sdb = [_read_record(sdb, int(payload["id"])) for payload in payloads]
        return _json({
            "ok": True,
            "dry_run": False,
            "mode": "experimental_direct_insert",
            "backup": backups,
            "inserted_ids": [payload["id"] for payload in payloads],
            "enl_records": inserted_enl,
            "sdb_records": inserted_sdb,
        })
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
def endnote_update_fields(
    ref_id: int,
    fields: dict[str, Any],
    library_path: str | None = None,
    backup_dir: str | None = None,
    append_keywords: bool = True,
    dry_run: bool = True,
    confirm: bool = False,
) -> str:
    """Update safe fields on an existing EndNote record."""
    try:
        enl, sdb = _library_paths(library_path)
        _ensure_library_ready(enl, sdb)
        before = _read_record(enl, ref_id)
        if before is None:
            raise ValueError(f"Reference {ref_id} not found")
        illegal = sorted(set(fields) - SAFE_WRITE_FIELDS)
        if illegal:
            raise ValueError(
                f"Unsafe fields requested: {illegal}. Safe fields: {sorted(SAFE_WRITE_FIELDS)}"
            )
        normalized = dict(fields)
        if append_keywords and "keywords" in normalized:
            normalized["keywords"] = _merge_keywords(before.get("keywords") or "", _as_list(fields["keywords"]))
        plan = {
            "ref_id": ref_id,
            "title": before.get("title"),
            "doi": before.get("doi"),
            "fields": normalized,
        }
        if dry_run:
            return _json({"ok": True, "dry_run": True, "plan": plan})
        if not confirm:
            raise ValueError("confirm=true is required for write operations")
        backups = _backup_library(enl, sdb, backup_dir)
        conns = [_connect(enl), _connect(sdb)]
        try:
            with _refs_update_tx(conns):
                for field, value in normalized.items():
                    _exec_both(conns, f"UPDATE refs SET {field} = ? WHERE id = ?", (str(value), ref_id))
        finally:
            for conn in conns:
                conn.close()
        after = _read_record(enl, ref_id)
        return _json({"ok": True, "dry_run": False, "backup": backups, "before": before, "after": after})
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
def endnote_delete_records(
    ref_ids: list[int],
    library_path: str | None = None,
    backup_dir: str | None = None,
    dry_run: bool = True,
    confirm: bool = False,
) -> str:
    """Soft-delete EndNote records by moving them to trash_state=1."""
    try:
        if not ref_ids:
            raise ValueError("ref_ids is required")
        enl, sdb = _library_paths(library_path)
        _ensure_library_ready(enl, sdb)
        before: list[dict[str, Any]] = []
        missing: list[int] = []
        for ref_id in ref_ids:
            record = _read_record(enl, int(ref_id))
            if record is None:
                missing.append(int(ref_id))
            else:
                before.append(record)
        if missing:
            raise ValueError(f"References not found: {missing}")
        plan = [
            {
                "id": item["id"],
                "title": item.get("title"),
                "doi": item.get("doi"),
                "current_trash_state": item.get("trash_state"),
            }
            for item in before
        ]
        if dry_run:
            return _json({"ok": True, "dry_run": True, "plan": plan})
        if not confirm:
            raise ValueError("confirm=true is required for delete operations")
        backups = _backup_library(enl, sdb, backup_dir)
        conns = [_connect(enl), _connect(sdb)]
        try:
            with _refs_update_tx(conns):
                for ref_id in ref_ids:
                    _exec_both(conns, "UPDATE refs SET trash_state = 1 WHERE id = ?", (int(ref_id),))
        finally:
            for conn in conns:
                conn.close()
        return _json({
            "ok": True,
            "dry_run": False,
            "backup": backups,
            "deleted_mode": "soft_delete_to_trash",
            "records": plan,
        })
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
