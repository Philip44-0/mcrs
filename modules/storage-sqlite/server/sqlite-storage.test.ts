import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StorageError, type BaseRecord, type CollectionDef } from '@mcrs/shared';
import { runStorageConformance } from '@mcrs/shared/conformance';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './open-database';
import { createSqliteStorage, type SqliteStorage } from './sqlite-storage';

// The module has to pass the same suite as every other storage module.
runStorageConformance(
  () => {
    const storage = createSqliteStorage(new DatabaseSync(':memory:'));
    return { storage, close: () => storage.close() };
  },
  { name: 'storage-sqlite' },
);

// ---------------------------------------------------------------- what is special about this module

interface Thing extends BaseRecord {
  name: string | null;
  code: string | null;
}

const definition = (overrides: Partial<CollectionDef> = {}): CollectionDef => ({
  name: 'shop_things',
  schemaVersion: 1,
  fields: { name: 'string', code: 'string' },
  unique: [['code']],
  ...overrides,
});

const folders: string[] = [];
const open: SqliteStorage[] = [];

afterEach(async () => {
  for (const storage of open.splice(0)) {
    try {
      storage.close();
    } catch {
      // already closed by the test
    }
  }
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function databaseFile(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'mcrs-sqlite-'));
  folders.push(folder);
  return path.join(folder, 'test.db');
}

/** A storage on the file, with the given collections defined (and migrated unless told otherwise). */
async function storageOn(
  file: string,
  definitions: CollectionDef[] = [definition()],
  migrate = true,
): Promise<SqliteStorage> {
  const storage = createSqliteStorage(openDatabase(file));
  open.push(storage);
  for (const item of definitions) await storage.defineCollection(item);
  if (migrate) await storage.migrate();
  return storage;
}

async function failure(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StorageError) return error;
    throw error;
  }
  throw new Error('expected a failure');
}

describe('storage-sqlite on disk', () => {
  it('keeps the data between runs', async () => {
    const file = await databaseFile();
    const first = await storageOn(file);
    const thing = await first
      .collection<Thing>('shop_things')
      .insert({ id: 'soup', name: 'Soup', code: 'A' });
    first.close();

    const second = await storageOn(file);

    expect(await second.collection<Thing>('shop_things').get('soup')).toEqual(thing);
  });

  it('can be migrated twice', async () => {
    const storage = await storageOn(await databaseFile());

    await expect(storage.migrate()).resolves.toBeUndefined();
  });

  it('does not mind in which order fields and groups are written', async () => {
    const file = await databaseFile();
    const first = await storageOn(file, [
      definition({ fields: { name: 'string', code: 'string' }, unique: [['code', 'name']] }),
    ]);
    first.close();

    await expect(
      storageOn(file, [
        definition({ fields: { code: 'string', name: 'string' }, unique: [['name', 'code']] }),
      ]),
    ).resolves.toBeDefined();
  });

  it('refuses a changed definition when the schemaVersion stayed the same', async () => {
    const file = await databaseFile();
    (await storageOn(file)).close();

    const error = await failure(
      storageOn(file, [
        definition({ fields: { name: 'string', code: 'string', extra: 'string' } }),
      ]),
    );

    expect(error.code).toBe('invalid-collection');
    expect(error.message).toContain('without raising its schemaVersion');
  });

  it('says that a newer schemaVersion cannot be upgraded yet', async () => {
    const file = await databaseFile();
    (await storageOn(file)).close();

    const error = await failure(storageOn(file, [definition({ schemaVersion: 2 })]));

    expect(error.code).toBe('invalid-collection');
    expect(error.message).toContain('upgrading is not supported yet');
  });

  it('refuses a database that is newer than the code', async () => {
    const file = await databaseFile();
    (await storageOn(file, [definition({ schemaVersion: 3 })])).close();

    const error = await failure(storageOn(file, [definition({ schemaVersion: 1 })]));

    expect(error.message).toContain('newer than the code');
  });

  it('can only be used after it was migrated', async () => {
    const storage = await storageOn(await databaseFile(), [definition()], false);
    const things = storage.collection<Thing>('shop_things'); // getting it is fine in register()

    expect((await failure(things.insert({ name: 'x' }))).code).toBe('invalid-collection');
    await storage.migrate();
    await expect(things.insert({ name: 'x' })).resolves.toBeDefined();
  });

  it('refuses collections that are defined after the migration', async () => {
    const storage = await storageOn(await databaseFile());

    const error = await failure(storage.defineCollection(definition({ name: 'shop_later' })));

    expect(error.message).toContain('too late');
  });

  it('works for modules whose id contains a hyphen', async () => {
    const storage = await storageOn(await databaseFile(), [
      definition({ name: 'back-button_things', unique: [['code']] }),
    ]);
    const things = storage.collection<Thing>('back-button_things');

    await things.insert({ code: 'A' });

    expect(await failure(things.insert({ code: 'A' }))).toHaveProperty('code', 'unique-violation');
  });

  it('also protects unique values with an index in the database', async () => {
    const file = await databaseFile();
    const storage = await storageOn(file);
    storage.close();

    const db = new DatabaseSync(file);
    const index = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'shop_things__u0'`)
      .get() as { sql: string };
    db.close();

    expect(index.sql).toContain('CREATE UNIQUE INDEX');
    expect(index.sql).toContain('WHERE "deletedAt" IS NULL');
  });
});

describe('openDatabase', () => {
  it('turns on the write-ahead log for a file', async () => {
    const db = openDatabase(await databaseFile());

    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    db.close();

    expect(mode.journal_mode).toBe('wal');
  });
});
