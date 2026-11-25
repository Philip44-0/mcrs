import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModuleContext } from '@mcrs/core-server';
import type { BaseRecord, CollectionDef, StorageProvider } from '@mcrs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import sqliteStorage from './index';

const folders: string[] = [];

afterEach(async () => {
  await sqliteStorage.stop?.({} as ModuleContext);
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

/** What the module sees: only the parts of the context that it uses. */
function contextFor(config: Record<string, unknown>, dataDir: string) {
  const provided = new Map<string, unknown>();
  const lines: string[] = [];
  const context = {
    id: 'storage-sqlite',
    config,
    dataDir,
    log: { debug() {}, info: (message: string) => void lines.push(message), warn() {}, error() {} },
    capabilities: {
      provide: (name: string, implementation: unknown) => void provided.set(name, implementation),
    },
  } as unknown as ModuleContext;
  return { context, provided, lines };
}

interface Thing extends BaseRecord {
  name: string | null;
}

const things: CollectionDef = { name: 'shop_things', schemaVersion: 1, fields: { name: 'string' } };

describe('the storage-sqlite module', () => {
  it('provides storage@1 with a database file in the data directory, which it creates', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'mcrs-module-'));
    folders.push(folder);
    const dataDir = path.join(folder, 'data', 'nested');
    const { context, provided, lines } = contextFor({ file: 'shop.db' }, dataDir);

    await sqliteStorage.register(context);
    const storage = provided.get('storage@1') as StorageProvider;
    await storage.defineCollection(things);
    await storage.migrate();
    const record = await storage.collection<Thing>('shop_things').insert({ name: 'Soup' });

    expect(existsSync(path.join(dataDir, 'shop.db'))).toBe(true);
    expect(await storage.collection('shop_things').get(record.id)).toEqual(record);
    expect(lines).toEqual([`database: ${path.join(dataDir, 'shop.db')}`]);
  });

  it('can keep the database in memory', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'mcrs-module-'));
    folders.push(folder);
    const { context, provided } = contextFor({ file: ':memory:' }, path.join(folder, 'data'));

    await sqliteStorage.register(context);
    const storage = provided.get('storage@1') as StorageProvider;
    await storage.defineCollection(things);
    await storage.migrate();

    expect(await storage.collection('shop_things').list()).toEqual([]);
    expect(existsSync(path.join(folder, 'data'))).toBe(false);
  });

  it('uses mcrs.db when no file is configured', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'mcrs-module-'));
    folders.push(folder);
    const { context, provided } = contextFor({}, folder);

    await sqliteStorage.register(context);
    await (provided.get('storage@1') as StorageProvider).migrate();

    expect(existsSync(path.join(folder, 'mcrs.db'))).toBe(true);
  });

  it('closes the database when it stops, and can be stopped twice', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'mcrs-module-'));
    folders.push(folder);
    const { context, provided } = contextFor({ file: ':memory:' }, folder);
    await sqliteStorage.register(context);
    const storage = provided.get('storage@1') as StorageProvider;

    await sqliteStorage.stop?.(context);
    await sqliteStorage.stop?.(context);

    await expect(storage.migrate()).rejects.toThrow();
  });
});
