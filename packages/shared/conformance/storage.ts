import { afterEach, describe, expect, it } from 'vitest';
import {
  RECORD_ID,
  StorageError,
  type BaseRecord,
  type CollectionDef,
  type StorageProvider,
} from '../src/storage';

/** What a storage module hands to the suite: the provider, and a way to clean up after a test. */
export interface StorageFixture {
  storage: StorageProvider;
  /** Called after every test (close the database, delete the file, ...). */
  close?: () => void | Promise<void>;
}

/** Makes a fresh, empty storage. Called once per test, so that no test depends on another. */
export type StorageFactory = () => StorageFixture | Promise<StorageFixture>;

export interface ConformanceOptions {
  /** Shown in the names of the tests, for example "storage-sqlite". */
  name?: string;
}

interface Item extends BaseRecord {
  name: string | null;
  code: string | null;
  qty: number | null;
  price: number | null;
  active: boolean | null;
  seenAt: string | null;
  data: unknown;
}
interface Pair extends BaseRecord {
  a: string | null;
  b: string | null;
}
interface Other extends BaseRecord {
  code: string | null;
}

const itemsDef: CollectionDef = {
  name: 'conformance_items',
  schemaVersion: 1,
  fields: {
    name: 'string',
    code: 'string',
    qty: 'number',
    price: 'number',
    active: 'boolean',
    seenAt: 'datetime',
    data: 'json',
  },
  unique: [['code']],
  indexes: [['name']],
};
const pairsDef: CollectionDef = {
  name: 'conformance_pairs',
  schemaVersion: 1,
  fields: { a: 'string', b: 'string' },
  unique: [['a', 'b']],
};
const othersDef: CollectionDef = {
  name: 'conformance_others',
  schemaVersion: 1,
  fields: { code: 'string' },
  unique: [['code']],
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The StorageError that an operation fails with (the test fails if it succeeds or fails differently). */
async function failure(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StorageError) return error;
    throw error;
  }
  throw new Error('expected the operation to fail, but it succeeded');
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => (await failure(promise)).code;

/**
 * Tests every promise of the storage contract (`storage@1`) against a storage module. A module that
 * passes is a valid drop-in. See README.md in this folder.
 *
 * Call it inside a test file: `runStorageConformance(() => ({ storage: createMyStorage() }))`.
 */
export function runStorageConformance(
  createStorage: StorageFactory,
  options: ConformanceOptions = {},
): void {
  const fixtures: StorageFixture[] = [];

  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await fixture.close?.();
  });

  /** A fresh storage with the collections of the suite defined and migrated. */
  async function setup() {
    const fixture = await createStorage();
    fixtures.push(fixture);
    const { storage } = fixture;
    await storage.defineCollection(itemsDef);
    await storage.defineCollection(pairsDef);
    await storage.defineCollection(othersDef);
    await storage.migrate();
    return {
      storage,
      items: storage.collection<Item>('conformance_items'),
      pairs: storage.collection<Pair>('conformance_pairs'),
      others: storage.collection<Other>('conformance_others'),
    };
  }

  describe(`storage conformance${options.name === undefined ? '' : `: ${options.name}`}`, () => {
    describe('collections', () => {
      it('accepts the same definition twice', async () => {
        const { storage } = await setup();

        await expect(storage.defineCollection({ ...itemsDef })).resolves.toBeUndefined();
      });

      it('refuses to define a collection a second time with a different definition', async () => {
        const { storage } = await setup();

        expect(
          await codeOf(
            storage.defineCollection({
              ...itemsDef,
              fields: { ...itemsDef.fields, extra: 'string' },
            }),
          ),
        ).toBe('invalid-collection');
      });

      it('refuses a definition that breaks the rules', async () => {
        const { storage } = await setup();

        expect(
          await codeOf(
            storage.defineCollection({
              ...itemsDef,
              name: 'conformance_broken',
              fields: { id: 'string' },
            }),
          ),
        ).toBe('invalid-collection');
        expect(await codeOf(storage.defineCollection({ ...itemsDef, name: 'NoOwner' }))).toBe(
          'invalid-collection',
        );
      });

      it('throws for a collection that was never defined', async () => {
        const { storage } = await setup();

        let thrown: unknown;
        try {
          storage.collection('conformance_nothing');
        } catch (error) {
          thrown = error;
        }

        expect(thrown instanceof StorageError && thrown.code).toBe('invalid-collection');
      });

      it('keeps collections apart', async () => {
        const { items, others } = await setup();

        await items.insert({ id: 'same', code: 'x' });
        await others.insert({ id: 'same', code: 'x' }); // same id and same unique value: no conflict

        expect(await items.list()).toHaveLength(1);
        expect(await others.list()).toHaveLength(1);
      });
    });

    describe('insert', () => {
      it('returns the whole record with the base fields set', async () => {
        const { items } = await setup();

        const record = await items.insert({ name: 'Soup', qty: 3 });

        expect(RECORD_ID.test(record.id)).toBe(true);
        expect(record.createdAt).toMatch(ISO);
        expect(record.updatedAt).toBe(record.createdAt);
        expect(record.deletedAt).toBeNull();
        expect(record.rev).toBe(1);
        expect(record).toEqual({
          ...record,
          name: 'Soup',
          qty: 3,
          code: null,
          price: null,
          active: null,
          seenAt: null,
          data: null,
        });
      });

      it('keeps an id that is given, and makes up a different one every time otherwise', async () => {
        const { items } = await setup();

        expect((await items.insert({ id: 'order-1' })).id).toBe('order-1');
        expect((await items.insert({})).id).not.toBe((await items.insert({})).id);
      });

      it('refuses an id that is used already, also when its record was removed', async () => {
        const { items } = await setup();
        await items.insert({ id: 'x' });

        expect(await codeOf(items.insert({ id: 'x' }))).toBe('duplicate-id');
        await items.remove('x');
        expect(await codeOf(items.insert({ id: 'x' }))).toBe('duplicate-id');
      });

      it('refuses ids that are not allowed', async () => {
        const { items } = await setup();

        for (const id of ['a b', '', 'x'.repeat(65), 'ü', 'a/b']) {
          expect(await codeOf(items.insert({ id }))).toBe('invalid-value');
        }
      });

      it('refuses fields that the collection does not have', async () => {
        const { items } = await setup();

        expect(await codeOf(items.insert({ nope: 1 } as never))).toBe('invalid-field');
      });

      it('refuses to set the base fields, except the id', async () => {
        const { items } = await setup();

        for (const field of ['rev', 'createdAt', 'updatedAt', 'deletedAt']) {
          expect(await codeOf(items.insert({ [field]: null } as never))).toBe('invalid-field');
        }
      });

      it('refuses values that do not fit their field', async () => {
        const { items } = await setup();
        const bad = [
          { name: 5 },
          { qty: 'x' },
          { qty: Number.NaN },
          { qty: Number.POSITIVE_INFINITY },
          { active: 'yes' },
          { seenAt: 'yesterday' },
          { seenAt: '2026-10-19' },
          { seenAt: '2026-10-19T11:50:31Z' },
          { data: () => 1 },
        ];

        for (const record of bad)
          expect(await codeOf(items.insert(record as never))).toBe('invalid-value');
        expect(await items.list()).toHaveLength(0);
      });

      it('treats undefined like a field that was not given', async () => {
        const { items } = await setup();

        const record = await items.insert({ name: undefined, qty: 1 });

        expect(record.name).toBeNull();
      });

      it('stores numbers, booleans, dates and json values as they are', async () => {
        const { items } = await setup();
        const values = [{ a: [1, { b: 'c' }] }, [1, 2, 3], 'text', 7, true, null];

        const record = await items.insert({
          name: 'N',
          qty: -2.5,
          price: 0,
          active: false,
          seenAt: '2026-10-19T11:50:31.490Z',
        });
        const jsons = await Promise.all(values.map((data) => items.insert({ data })));

        expect(await items.get(record.id)).toEqual(record);
        expect(record).toEqual({
          ...record,
          qty: -2.5,
          price: 0,
          active: false,
          seenAt: '2026-10-19T11:50:31.490Z',
        });
        expect(
          (await Promise.all(jsons.map((json) => items.get(json.id)))).map((json) => json?.data),
        ).toEqual(values);
      });

      it('gives back copies, so changing a result changes nothing in the storage', async () => {
        const { items } = await setup();
        const record = await items.insert({ data: { list: [1] } });

        (record.data as { list: number[] }).list.push(2);
        const listed = await items.list();
        (listed[0]?.data as { list: number[] }).list.push(3);

        expect((await items.get(record.id))?.data).toEqual({ list: [1] });
      });
    });

    describe('get', () => {
      it('returns what was inserted, and null for a record that does not exist', async () => {
        const { items } = await setup();
        const record = await items.insert({ name: 'Soup' });

        expect(await items.get(record.id)).toEqual(record);
        expect(await items.get('missing')).toBeNull();
      });

      it('returns null for a removed record, unless includeDeleted is set', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'Soup' });
        await items.remove(id);

        expect(await items.get(id)).toBeNull();
        const removed = await items.get(id, { includeDeleted: true });
        expect(removed?.name).toBe('Soup');
        expect(removed?.deletedAt).toMatch(ISO);
      });
    });

    describe('list', () => {
      async function fill() {
        const context = await setup();
        const { items } = context;
        await items.insert({
          id: 'item-1',
          name: 'Soup',
          code: 'A',
          qty: 5,
          price: 3.5,
          active: true,
          seenAt: '2026-01-01T00:00:00.000Z',
        });
        await items.insert({
          id: 'item-2',
          name: 'Beer',
          code: 'B',
          qty: 0,
          price: 4,
          active: false,
          seenAt: '2026-02-01T00:00:00.000Z',
        });
        await items.insert({
          id: 'item-3',
          name: 'Cake',
          code: null,
          qty: null,
          price: 3.5,
          active: true,
          seenAt: null,
        });
        await items.insert({
          id: 'item-4',
          name: 'Soup',
          code: 'D',
          qty: 9,
          price: null,
          active: null,
          seenAt: '2026-03-01T00:00:00.000Z',
        });
        return context;
      }
      const ids = (records: Array<{ id: string }>) => records.map((record) => record.id);

      it('returns the active records in the order they were created', async () => {
        const { items } = await fill();
        await items.remove('item-2');

        expect(ids(await items.list())).toEqual(['item-1', 'item-3', 'item-4']);
        expect(ids(await items.list({}))).toEqual(['item-1', 'item-3', 'item-4']);
      });

      it('finds records by equality, on every kind of field', async () => {
        const { items } = await fill();

        expect(ids(await items.list({ where: { name: 'Soup' } }))).toEqual(['item-1', 'item-4']);
        expect(ids(await items.list({ where: { qty: 0 } }))).toEqual(['item-2']);
        expect(ids(await items.list({ where: { price: 3.5 } }))).toEqual(['item-1', 'item-3']);
        expect(ids(await items.list({ where: { active: false } }))).toEqual(['item-2']);
        expect(ids(await items.list({ where: { seenAt: '2026-02-01T00:00:00.000Z' } }))).toEqual([
          'item-2',
        ]);
        expect(ids(await items.list({ where: { id: 'item-3' } }))).toEqual(['item-3']);
        expect(ids(await items.list({ where: { rev: 1 } }))).toEqual([
          'item-1',
          'item-2',
          'item-3',
          'item-4',
        ]);
      });

      it('matches empty fields with null', async () => {
        const { items } = await fill();

        expect(ids(await items.list({ where: { code: null } }))).toEqual(['item-3']);
        expect(ids(await items.list({ where: { active: null } }))).toEqual(['item-4']);
      });

      it('finds records whose value is one of several, and combines conditions with AND', async () => {
        const { items } = await fill();

        expect(ids(await items.list({ where: { code: { in: ['A', 'D', 'Z'] } } }))).toEqual([
          'item-1',
          'item-4',
        ]);
        expect(ids(await items.list({ where: { code: { in: ['A', null] } } }))).toEqual([
          'item-1',
          'item-3',
        ]);
        expect(ids(await items.list({ where: { code: { in: [] } } }))).toEqual([]);
        expect(ids(await items.list({ where: { name: 'Soup', qty: 9 } }))).toEqual(['item-4']);
      });

      it('sorts by one or more fields, ascending and descending, with empty values first when ascending', async () => {
        const { items } = await fill();

        expect(ids(await items.list({ orderBy: [['qty', 'asc']] }))).toEqual([
          'item-3',
          'item-2',
          'item-1',
          'item-4',
        ]);
        expect(ids(await items.list({ orderBy: [['qty', 'desc']] }))).toEqual([
          'item-4',
          'item-1',
          'item-2',
          'item-3',
        ]);
        expect(
          ids(
            await items.list({
              orderBy: [
                ['name', 'asc'],
                ['qty', 'desc'],
              ],
            }),
          ),
        ).toEqual(['item-2', 'item-3', 'item-4', 'item-1']);
        expect(ids(await items.list({ orderBy: [['active', 'asc']] }))).toEqual([
          'item-4',
          'item-2',
          'item-1',
          'item-3',
        ]);
        expect(ids(await items.list({ orderBy: [['name', 'desc']] }))).toEqual([
          'item-1',
          'item-4',
          'item-3',
          'item-2',
        ]);
      });

      it('skips and limits', async () => {
        const { items } = await fill();

        expect(ids(await items.list({ limit: 2 }))).toEqual(['item-1', 'item-2']);
        expect(ids(await items.list({ offset: 1, limit: 2 }))).toEqual(['item-2', 'item-3']);
        expect(ids(await items.list({ offset: 3 }))).toEqual(['item-4']);
        expect(ids(await items.list({ offset: 10 }))).toEqual([]);
        expect(ids(await items.list({ orderBy: [['qty', 'desc']], limit: 1 }))).toEqual(['item-4']);
      });

      it('includes removed records only when asked to', async () => {
        const { items } = await fill();
        await items.remove('item-2');

        expect(ids(await items.list({ includeDeleted: true }))).toEqual([
          'item-1',
          'item-2',
          'item-3',
          'item-4',
        ]);
        expect(ids(await items.list({ includeDeleted: true, where: { active: false } }))).toEqual([
          'item-2',
        ]);
      });

      it('refuses queries that are not valid', async () => {
        const { items } = await fill();
        const bad = [
          { where: { nope: 1 } },
          { where: { data: 1 } },
          { where: { deletedAt: null } },
          { where: { qty: 'x' } },
          { where: { qty: { in: 'x' } } },
          { where: { qty: { in: ['x'] } } },
          { orderBy: [['nope', 'asc']] },
          { orderBy: [['data', 'asc']] },
          { orderBy: [['qty', 'sideways']] },
          { limit: 0 },
          { limit: -1 },
          { limit: 1.5 },
          { offset: -1 },
          { offset: 0.5 },
        ];

        for (const query of bad)
          expect(await codeOf(items.list(query as never))).toBe('invalid-query');
      });
    });

    describe('update', () => {
      it('changes the given fields and nothing else, and returns the whole record', async () => {
        const { items } = await setup();
        const before = await items.insert({ name: 'Soup', qty: 5 });
        await sleep(5);

        const after = await items.update(before.id, { qty: 4, price: 2 });

        expect(after).toEqual({ ...before, qty: 4, price: 2, rev: 2, updatedAt: after.updatedAt });
        expect(after.createdAt).toBe(before.createdAt);
        expect(after.updatedAt > before.updatedAt).toBe(true);
        expect(await items.get(before.id)).toEqual(after);
      });

      it('leaves fields alone that are undefined, and empties fields that are null', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'Soup', qty: 5 });

        const after = await items.update(id, { name: undefined, qty: null });

        expect(after.name).toBe('Soup');
        expect(after.qty).toBeNull();
      });

      it('throws not-found for a record that does not exist or was removed', async () => {
        const { items } = await setup();
        const { id } = await items.insert({});
        await items.remove(id);

        expect(await codeOf(items.update('missing', { name: 'x' }))).toBe('not-found');
        expect(await codeOf(items.update(id, { name: 'x' }))).toBe('not-found');
      });

      it('refuses fields and values that are not allowed, and changes nothing', async () => {
        const { items } = await setup();
        const record = await items.insert({ name: 'Soup' });

        expect(await codeOf(items.update(record.id, { nope: 1 } as never))).toBe('invalid-field');
        expect(await codeOf(items.update(record.id, { rev: 9 } as never))).toBe('invalid-field');
        expect(await codeOf(items.update(record.id, { id: 'other' } as never))).toBe(
          'invalid-field',
        );
        expect(await codeOf(items.update(record.id, { name: 'ok', qty: 'x' } as never))).toBe(
          'invalid-value',
        );
        expect(await items.get(record.id)).toEqual(record);
      });

      it('checks the revision when ifRev is given', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'Soup' });

        const second = await items.update(id, { name: 'Stew' }, { ifRev: 1 });
        const conflict = await failure(items.update(id, { name: 'Broth' }, { ifRev: 1 }));

        expect(second.rev).toBe(2);
        expect(conflict.code).toBe('conflict');
        expect(conflict.details).toEqual({ expected: 1, actual: 2 });
        expect((await items.get(id))?.name).toBe('Stew');
      });

      it('refuses a change that breaks a unique group, and changes nothing', async () => {
        const { items } = await setup();
        await items.insert({ id: 'one', code: 'A' });
        const two = await items.insert({ id: 'two', code: 'B' });

        expect(await codeOf(items.update('two', { code: 'A' }))).toBe('unique-violation');
        expect(await items.get('two')).toEqual(two);
        expect((await items.update('two', { code: 'B', name: 'same code is fine' })).rev).toBe(2);
      });
    });

    describe('unique groups', () => {
      it('refuses a second active record with the same value', async () => {
        const { items } = await setup();
        await items.insert({ code: 'A' });

        const error = await failure(items.insert({ code: 'A' }));

        expect(error.code).toBe('unique-violation');
        expect(error.details).toEqual({ fields: ['code'] });
        expect(await items.list()).toHaveLength(1);
      });

      it('never counts empty values', async () => {
        const { items, pairs } = await setup();

        await items.insert({ code: null });
        await items.insert({});
        await pairs.insert({ a: 'x', b: null });
        await pairs.insert({ a: 'x', b: null });

        expect(await items.list()).toHaveLength(2);
        expect(await pairs.list()).toHaveLength(2);
      });

      it('lets a removed record free its value, and refuses to restore it when the value was taken', async () => {
        const { items } = await setup();
        const first = await items.insert({ code: 'A' });
        await items.remove(first.id);

        await items.insert({ code: 'A' });

        expect(await codeOf(items.restore(first.id))).toBe('unique-violation');
        expect(await items.get(first.id)).toBeNull();
        expect((await items.get(first.id, { includeDeleted: true }))?.deletedAt).toMatch(ISO);
      });

      it('treats a group of several fields as a combination', async () => {
        const { pairs } = await setup();
        await pairs.insert({ a: 'x', b: '1' });

        await pairs.insert({ a: 'x', b: '2' });
        await pairs.insert({ a: 'y', b: '1' });

        expect(await codeOf(pairs.insert({ a: 'x', b: '1' }))).toBe('unique-violation');
        expect(await pairs.list()).toHaveLength(3);
      });
    });

    describe('adjust', () => {
      it('adds to a number field and reports the new value', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ qty: 10 });

        expect(await items.adjust(id, 'qty', -3)).toEqual({ ok: true, value: 7 });
        expect(await items.adjust(id, 'qty', 5)).toEqual({ ok: true, value: 12 });

        const record = await items.get(id);
        expect(record?.qty).toBe(12);
        expect(record?.rev).toBe(3);
      });

      it('may reach the minimum and the maximum exactly, but not cross them', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ qty: 2 });

        expect(await items.adjust(id, 'qty', -2, { min: 0 })).toEqual({ ok: true, value: 0 });
        expect(await items.adjust(id, 'qty', -1, { min: 0 })).toEqual({ ok: false, value: 0 });
        expect(await items.adjust(id, 'qty', 5, { max: 5 })).toEqual({ ok: true, value: 5 });
        expect(await items.adjust(id, 'qty', 1, { max: 5 })).toEqual({ ok: false, value: 5 });
        expect(await items.adjust(id, 'qty', -9, { min: 0, max: 5 })).toEqual({
          ok: false,
          value: 5,
        });
      });

      it('changes nothing when it refuses', async () => {
        const { items } = await setup();
        const before = await items.insert({ qty: 1 });

        await items.adjust(before.id, 'qty', -5, { min: 0 });

        expect(await items.get(before.id)).toEqual(before);
      });

      it('refuses fields and values that are not allowed', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'Soup', qty: null, price: 1 });

        expect(await codeOf(items.adjust(id, 'name', 1))).toBe('invalid-field');
        expect(await codeOf(items.adjust(id, 'nope', 1))).toBe('invalid-field');
        expect(await codeOf(items.adjust(id, 'qty', 1))).toBe('invalid-value'); // empty: nothing to add to
        for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, '1']) {
          expect(await codeOf(items.adjust(id, 'price', delta as number))).toBe('invalid-value');
        }
        expect((await items.get(id))?.price).toBe(1);
      });

      it('throws not-found for a record that does not exist or was removed', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ qty: 1 });
        await items.remove(id);

        expect(await codeOf(items.adjust('missing', 'qty', 1))).toBe('not-found');
        expect(await codeOf(items.adjust(id, 'qty', 1))).toBe('not-found');
      });

      it('never lets calls at the same moment cross the minimum (the last portion is sold once)', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ qty: 20 });

        const results = await Promise.all(
          Array.from({ length: 50 }, () => items.adjust(id, 'qty', -1, { min: 0 })),
        );

        expect(results.filter((result) => result.ok)).toHaveLength(20);
        const record = await items.get(id);
        expect(record?.qty).toBe(0);
        expect(record?.rev).toBe(21);
      });

      it('does the same for adjustments that happen in transactions', async () => {
        const { items, storage } = await setup();
        const { id } = await items.insert({ qty: 20 });

        const sold = await Promise.all(
          Array.from({ length: 10 }, () =>
            storage.transaction(async (tx) => {
              let count = 0;
              for (let i = 0; i < 5; i++)
                if ((await items.adjust(id, 'qty', -1, { min: 0, tx })).ok) count++;
              return count;
            }),
          ),
        );

        expect(sold.reduce((sum, count) => sum + count, 0)).toBe(20);
        expect((await items.get(id))?.qty).toBe(0);
      });
    });

    describe('remove, restore and purge', () => {
      it('removes a record without losing it', async () => {
        const { items } = await setup();
        const before = await items.insert({ name: 'Soup' });
        await sleep(5);

        await items.remove(before.id);

        expect(await items.get(before.id)).toBeNull();
        expect(await items.list()).toEqual([]);
        const removed = await items.get(before.id, { includeDeleted: true });
        expect(removed?.deletedAt).toMatch(ISO);
        expect(removed?.updatedAt).toBe(removed?.deletedAt);
        expect(removed?.updatedAt && removed.updatedAt > before.updatedAt).toBe(true);
        expect(removed?.rev).toBe(2);
        expect(removed?.name).toBe('Soup');
      });

      it('does nothing when a removed record is removed again, and fails for a missing one', async () => {
        const { items } = await setup();
        const { id } = await items.insert({});
        await items.remove(id);
        const once = await items.get(id, { includeDeleted: true });

        await items.remove(id);

        expect(await items.get(id, { includeDeleted: true })).toEqual(once);
        expect(await codeOf(items.remove('missing'))).toBe('not-found');
      });

      it('brings a removed record back', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'Soup' });
        await items.remove(id);

        await items.restore(id);

        const back = await items.get(id);
        expect(back?.deletedAt).toBeNull();
        expect(back?.rev).toBe(3);
        expect(back?.name).toBe('Soup');
        expect(await items.list()).toHaveLength(1);
      });

      it('does nothing when an active record is restored, and fails for a missing one', async () => {
        const { items } = await setup();
        const record = await items.insert({});

        await items.restore(record.id);

        expect(await items.get(record.id)).toEqual(record);
        expect(await codeOf(items.restore('missing'))).toBe('not-found');
      });

      it('deletes a record for good, whether it was removed or not, and frees its id', async () => {
        const { items } = await setup();
        await items.insert({ id: 'active' });
        await items.insert({ id: 'removed' });
        await items.remove('removed');

        await items.purge('active');
        await items.purge('removed');

        expect(await items.get('active', { includeDeleted: true })).toBeNull();
        expect(await items.get('removed', { includeDeleted: true })).toBeNull();
        expect((await items.insert({ id: 'removed' })).rev).toBe(1);
        expect(await codeOf(items.purge('missing'))).toBe('not-found');
      });
    });

    describe('optimistic concurrency and unique values under concurrent calls', () => {
      it('lets exactly one of several updates with the same ifRev win', async () => {
        const { items } = await setup();
        const { id } = await items.insert({ name: 'start' });

        const outcomes = await Promise.all(
          Array.from({ length: 10 }, (_, index) =>
            items.update(id, { name: `writer ${index}` }, { ifRev: 1 }).then(
              () => 'won',
              (error: unknown) => (error instanceof StorageError ? error.code : 'other'),
            ),
          ),
        );

        expect(outcomes.filter((outcome) => outcome === 'won')).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome === 'conflict')).toHaveLength(9);
        expect((await items.get(id))?.rev).toBe(2);
      });

      it('lets exactly one of several inserts with the same unique value win', async () => {
        const { items } = await setup();

        const outcomes = await Promise.all(
          Array.from({ length: 10 }, () =>
            items.insert({ code: 'ONLY' }).then(
              () => 'won',
              (error: unknown) => (error instanceof StorageError ? error.code : 'other'),
            ),
          ),
        );

        expect(outcomes.filter((outcome) => outcome === 'won')).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome === 'unique-violation')).toHaveLength(9);
        expect(await items.list()).toHaveLength(1);
      });
    });

    describe('transactions', () => {
      it('returns what the work returns, and keeps the changes', async () => {
        const { items, storage } = await setup();

        const result = await storage.transaction(async (tx) => {
          const record = await items.insert({ id: 'kept', name: 'Soup' }, { tx });
          await items.update(record.id, { qty: 2 }, { tx });
          return 'done';
        });

        expect(result).toBe('done');
        expect((await items.get('kept'))?.qty).toBe(2);
      });

      it('lets the work see its own changes', async () => {
        const { items, storage } = await setup();
        await items.insert({ id: 'before' });

        await storage.transaction(async (tx) => {
          await items.insert({ id: 'inside' }, { tx });
          await items.remove('before', { tx });

          expect((await items.get('inside', { tx }))?.id).toBe('inside');
          expect((await items.list({}, { tx })).map((record) => record.id)).toEqual(['inside']);
        });
      });

      it('undoes everything when the work throws, and throws the same error', async () => {
        const { items, storage } = await setup();
        const kept = await items.insert({ id: 'kept', name: 'Soup', qty: 5 });
        await items.insert({ id: 'gone' });
        const problem = new Error('something went wrong');

        const thrown = await storage
          .transaction(async (tx) => {
            await items.insert({ id: 'new' }, { tx });
            await items.update('kept', { name: 'Stew' }, { tx });
            await items.adjust('kept', 'qty', -3, { tx });
            await items.remove('gone', { tx });
            throw problem;
          })
          .catch((error: unknown) => error);

        expect(thrown).toBe(problem);
        expect(await items.get('new')).toBeNull();
        expect(await items.get('kept')).toEqual(kept);
        expect((await items.get('gone'))?.deletedAt).toBeNull();
      });

      it('undoes everything when an operation inside fails and nobody catches it', async () => {
        const { items, storage } = await setup();
        await items.insert({ code: 'A' });

        const code = await codeOf(
          storage.transaction(async (tx) => {
            await items.insert({ id: 'new', code: 'B' }, { tx });
            await items.insert({ code: 'A' }, { tx });
          }),
        );

        expect(code).toBe('unique-violation');
        expect(await items.get('new')).toBeNull();
      });

      it('goes on after an operation inside failed, when the work catches the error', async () => {
        const { items, storage } = await setup();
        await items.insert({ code: 'A' });

        await storage.transaction(async (tx) => {
          await items.insert({ id: 'before', code: 'B' }, { tx });
          await items.insert({ id: 'refused', code: 'A' }, { tx }).catch(() => undefined);
          await items.insert({ id: 'after', code: 'C' }, { tx });
        });

        expect(
          (await items.list({ orderBy: [['code', 'asc']] })).map((record) => record.code),
        ).toEqual(['A', 'B', 'C']);
        expect(await items.get('refused')).toBeNull();
      });

      it('runs transactions one after another', async () => {
        const { storage } = await setup();
        const events: string[] = [];

        const first = storage.transaction(async () => {
          events.push('first start');
          await sleep(20);
          events.push('first end');
        });
        const second = storage.transaction(async () => {
          events.push('second start');
          events.push('second end');
        });
        await Promise.all([first, second]);

        expect(events).toEqual(['first start', 'first end', 'second start', 'second end']);
      });

      it('works again after a transaction was rolled back', async () => {
        const { items, storage } = await setup();
        await storage
          .transaction(async () => {
            throw new Error('rolled back');
          })
          .catch(() => undefined);

        await storage.transaction(async (tx) => void (await items.insert({ id: 'fine' }, { tx })));

        expect((await items.get('fine'))?.id).toBe('fine');
      });

      it('does not roll back a call that was made without the transaction', async () => {
        const { items, storage } = await setup();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        let reachedGate!: () => void;
        const inside = new Promise<void>((resolve) => (reachedGate = resolve));

        const rolledBack = storage
          .transaction(async (tx) => {
            await items.insert({ code: 'inside' }, { tx });
            reachedGate();
            await gate;
            throw new Error('rolled back');
          })
          .catch((error: unknown) => error);
        await inside;
        const outside = items.insert({ code: 'outside' }); // no tx: may have to wait, but is not part of it
        release();
        await rolledBack;
        await outside;

        expect((await items.list()).map((record) => record.code)).toEqual(['outside']);
      });
    });
  });
}
