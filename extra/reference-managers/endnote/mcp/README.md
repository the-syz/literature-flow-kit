# EndNote Write MCP

This is a minimal local MCP server for controlled EndNote write operations.
It is intentionally small and conservative:

- **Create**: writes a RIS import file for the user to import in EndNote Desktop.
- **Direct create**: experimentally inserts records into both `.enl` and `.Data/sdb/sdb.eni` for disposable test libraries or explicitly confirmed backed-up libraries.
- **Update**: updates only safe fields in an existing `.enl` record.
- **Delete**: soft-deletes records by moving them to EndNote trash (`trash_state = 1`), never hard-deletes rows.

The implementation follows the safety constraints documented by `endnote-cli`:

- Do not directly `INSERT` into the EndNote `refs` table.
- Write updates to both the `.enl` database and `.Data/sdb/sdb.eni`.
- Drop and restore EndNote's `refs__refs_ord_AU` trigger during safe `refs` updates.
- Register compatible SQLite function/collation shims for EndNote triggers during experimental direct inserts.
- Require backups and explicit confirmation for write operations.
- Require EndNote Desktop to be closed before modifying the library.

## Install

From this directory:

```powershell
python -m pip install -e .
```

The server depends on:

- `mcp[cli]`

## MCP config example

```json
{
  "mcpServers": {
    "endnote-write": {
      "command": "python",
      "args": [
        "-m",
        "endnote_write_mcp.server"
      ],
      "cwd": "<repo>/extra/reference-managers/endnote/mcp",
      "env": {
        "ENDNOTE_LIBRARY": "<path-to-library.enl>",
        "ENDNOTE_BACKUP_DIR": "<path-to-backups>",
        "ENDNOTE_IMPORT_FILE": "<path-to-import.ris>"
      }
    }
  }
}
```

## Tools

### `endnote_prepare_import`

Creates or appends a RIS record. This is the supported "add" path.
The user still imports the RIS file through EndNote Desktop.

Supported bibliographic fields include:

```text
title, translated_title, authors, year, journal, journal_full,
volume, issue, pages, start_page, end_page, doi, issn, url,
abstract, keywords, pdf_path, notes
```

The generated RIS includes EndNote-friendly tags such as `T1`, `TT`,
`AU`, `PY`, `JO`, `JF`, `VL`, `IS`, `SP`, `EP`, `DO`, `SN`, `AB`,
`KW`, `L1`, and `N1`.

### `endnote_direct_insert_records`

Experimentally inserts new records into the EndNote library without using
EndNote Desktop import. This is intended for test libraries and controlled
automation only.

Safety requirements:

```text
dry_run = true first
confirm = true for real writes
allow_experimental_direct_insert = true for real writes
EndNote Desktop closed
backup directory configured
```

The tool writes both `.enl` and `.Data/sdb/sdb.eni`, then reads records
back from both databases for verification. It registers compatible
`EN_MAKE_SORT_KEY`, `ENCIN_zh_CN`, and `ENCI_Base` shims so EndNote's
insert triggers can populate related tables such as `refs_ord`,
`ref_props`, `ret_watch`, and `tag_members`.

### `endnote_update_fields`

Updates safe fields on an existing reference. Allowed fields:

```text
research_notes, notes, keywords, read_status, rating, label, caption,
custom_1, custom_2, custom_3, custom_4, custom_5, custom_6, custom_7,
translated_title, translated_author
```

### `endnote_delete_records`

Soft-deletes exact reference ids by setting `trash_state = 1`.
Requires `confirm = true`.

### `endnote_get_record`

Read-only helper for checking a record before update/delete.

### `endnote_status`

Checks the configured library, `.Data/sdb/sdb.eni`, and backup/import paths.

## Required safety pattern

1. Run `endnote_status`.
2. Run `endnote_get_record` to verify the target record.
3. Run direct insert/update/delete with `dry_run = true`.
4. Repeat with `confirm = true` only after checking the plan.
5. For direct insert, also pass `allow_experimental_direct_insert = true`.

Do not use this MCP on a formal library until it has been tested on a disposable copy.
