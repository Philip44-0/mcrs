# storage-sqlite

The default storage module: provides the capability `storage@1` (see `packages/shared/src/storage.ts`)
with a SQLite database, using the `node:sqlite` module that is built into Node.js. Nothing has to be
installed for it.

## Configuration

```json
{ "id": "storage-sqlite", "path": "modules/storage-sqlite", "config": { "file": "mcrs.db" } }
```

- `file`: the name of the database file inside the data directory (`data/` next to `mcrs.config.json`
  by default). Only a plain file name is allowed. `:memory:` gives a database that is not kept.

## How the data is stored

- One table per collection, named like the collection. Booleans are stored as 0 and 1, `json` fields as
  text. The table `_mcrs_collections` remembers which version of which collection the file contains.
- Unique groups are checked by this module and also protected by unique indexes that only count active
  records (`WHERE "deletedAt" IS NULL`).
- The database runs in WAL mode (`mcrs.db`, `mcrs.db-wal` and `mcrs.db-shm` belong together; back up all
  three, or stop the server first).
- To look inside: `sqlite3 data/mcrs.db` and `.tables`, or any SQLite viewer. Do not change data by hand
  while the server runs.

## Limits

- One process: the database file is only used by one running server.
- A collection whose `schemaVersion` was raised cannot be upgraded yet (the migrations come in a later
  issue). The server refuses to start with a clear message instead of guessing.
- `node:sqlite` is still marked experimental in Node.js, so Node prints a warning when the server starts.

## Tests

`npm test -w @mcrs/module-storage-sqlite` runs the storage conformance suite from `@mcrs/shared`
(the same tests every storage module has to pass) and a few tests for what is special about SQLite.
