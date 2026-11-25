import { DatabaseSync } from 'node:sqlite';

/** Opens (and creates) the database file with the settings MCRS wants. `:memory:` gives a database that is not kept. */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL'); // readers do not block the writer, and a crash does not corrupt the file
  db.exec('PRAGMA synchronous = NORMAL'); // safe with WAL, and much faster than FULL
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}
