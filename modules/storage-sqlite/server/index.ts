import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ServerModule } from '@mcrs/core-server';
import type { StorageProvider } from '@mcrs/shared';
import { openDatabase } from './open-database';
import { createSqliteStorage, type SqliteStorage } from './sqlite-storage';

let storage: SqliteStorage | undefined;

/**
 * The default storage: provides `storage@1` with a SQLite database in the data directory
 * (`config.file`, default `mcrs.db`; `:memory:` for a database that is not kept).
 */
const sqliteStorage: ServerModule = {
  register(context) {
    const file = String(context.config.file ?? 'mcrs.db');
    const target = file === ':memory:' ? file : path.join(context.dataDir, file);
    if (file !== ':memory:') mkdirSync(context.dataDir, { recursive: true });

    storage = createSqliteStorage(openDatabase(target));
    context.capabilities.provide<StorageProvider>('storage@1', storage);
    context.log.info(`database: ${target}`);
  },

  stop() {
    storage?.close();
    storage = undefined;
  },
};

export default sqliteStorage;
