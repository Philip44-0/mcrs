import { describe, expect, it } from 'vitest';
import {
  BASE_FIELDS,
  RECORD_ID,
  StorageError,
  createId,
  isStorageError,
  ownerOfCollection,
  validateCollectionDef,
  type CollectionDef,
} from './storage';

const def = (overrides: Record<string, unknown> = {}) => ({
  name: 'stock_levels',
  schemaVersion: 1,
  fields: { itemId: 'string', quantity: 'number', note: 'json' },
  ...overrides,
});

describe('ownerOfCollection', () => {
  it('is the part before the first underscore', () => {
    expect(ownerOfCollection('stock_levels')).toBe('stock');
    expect(ownerOfCollection('back-button_things_2')).toBe('back-button');
  });

  it('is null for names that do not look like <moduleId>_<name>', () => {
    for (const name of [
      'stock',
      'Stock_levels',
      'stock_',
      '_levels',
      'stock_Levels',
      'stock_1levels',
      '',
    ]) {
      expect(ownerOfCollection(name)).toBeNull();
    }
  });
});

describe('validateCollectionDef', () => {
  it('accepts a complete definition', () => {
    const complete: CollectionDef = {
      name: 'stock_levels',
      schemaVersion: 3,
      fields: {
        itemId: 'string',
        quantity: 'number',
        active: 'boolean',
        seenAt: 'datetime',
        note: 'json',
      },
      unique: [['itemId']],
      indexes: [['quantity', 'seenAt']],
      migrations: { 2: async () => {}, 3: async () => {} },
    };

    expect(validateCollectionDef(complete, { owner: 'stock' })).toEqual([]);
    expect(validateCollectionDef(def())).toEqual([]);
  });

  it('wants the name to start with the id of the module that owns it', () => {
    expect(validateCollectionDef(def({ name: 'orders_levels' }), { owner: 'stock' })).toEqual([
      '"name" has to start with "stock_", because module "stock" owns the collection',
    ]);
    expect(
      validateCollectionDef(def({ name: 'back-button_items' }), { owner: 'back' }),
    ).toHaveLength(1);
    expect(
      validateCollectionDef(def({ name: 'back-button_items' }), { owner: 'back-button' }),
    ).toEqual([]);
  });

  it('refuses names of the wrong shape', () => {
    for (const name of ['levels', 'Stock_levels', 'stock levels', undefined, 5]) {
      expect(validateCollectionDef(def({ name }))[0]).toContain(
        'has to look like <moduleId>_<name>',
      );
    }
  });

  it('checks the schema version', () => {
    for (const schemaVersion of [0, -1, 1.5, '1', undefined]) {
      expect(validateCollectionDef(def({ schemaVersion }))).toEqual([
        '"schemaVersion" has to be a whole number, 1 or more',
      ]);
    }
  });

  it('checks the fields: names, types, and that the base fields are not declared', () => {
    expect(validateCollectionDef(def({ fields: { Bad: 'string' } }))[0]).toContain('field "Bad"');
    expect(validateCollectionDef(def({ fields: { quantity: 'integer' } }))[0]).toContain(
      'the type has to be one of',
    );
    expect(validateCollectionDef(def({ fields: { id: 'string' } }))[0]).toContain(
      'belongs to every record',
    );
    expect(validateCollectionDef(def({ fields: 'none' }))[0]).toContain(
      '"fields" has to be an object',
    );
    for (const field of BASE_FIELDS)
      expect(validateCollectionDef(def({ fields: { [field]: 'string' } }))).toHaveLength(1);
  });

  it('checks that unique and indexes only use declared fields that are not json', () => {
    expect(validateCollectionDef(def({ unique: [['itemId', 'missing']] }))).toEqual([
      'unique[0]: "missing" is not a declared field',
    ]);
    expect(validateCollectionDef(def({ indexes: [['note']] }))).toEqual([
      'indexes[0]: "note" is a json field and cannot be used here',
    ]);
    expect(validateCollectionDef(def({ unique: [[]] }))[0]).toContain('at least one entry');
    expect(validateCollectionDef(def({ unique: 'itemId' }))).toEqual([
      '"unique" has to be a list of field groups',
    ]);
  });

  it('checks the migrations: keys from 2 to the schema version, and functions', () => {
    const noop = async () => {};

    expect(validateCollectionDef(def({ schemaVersion: 2, migrations: { 1: noop } }))[0]).toContain(
      'migrations[1]',
    );
    expect(validateCollectionDef(def({ schemaVersion: 2, migrations: { 3: noop } }))[0]).toContain(
      'migrations[3]',
    );
    expect(
      validateCollectionDef(def({ schemaVersion: 2, migrations: { two: noop } }))[0],
    ).toContain('migrations[two]');
    expect(validateCollectionDef(def({ schemaVersion: 2, migrations: { 2: 'later' } }))).toEqual([
      'migrations[2] has to be a function',
    ]);
    expect(validateCollectionDef(def({ migrations: [] }))[0]).toContain(
      '"migrations" has to be an object',
    );
  });

  it('reports all problems at once, and refuses something that is not an object', () => {
    expect(validateCollectionDef({ name: 'x', schemaVersion: 0, fields: 1 })).toHaveLength(3);
    expect(validateCollectionDef(null)).toEqual(['the definition has to be an object']);
  });
});

describe('StorageError', () => {
  it('carries a code and details', () => {
    const error = new StorageError('conflict', 'someone else changed it', {
      expected: 1,
      actual: 2,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('conflict');
    expect(error.details).toEqual({ expected: 1, actual: 2 });
    expect(error.name).toBe('StorageError');
  });

  it('is recognised, also when it comes from another copy of the class', () => {
    const foreign = Object.assign(new Error('x'), {
      code: 'not-found',
      [Symbol.for('mcrs.storageError')]: true,
    });

    expect(foreign instanceof StorageError).toBe(true);
    expect(isStorageError(new StorageError('not-found', 'x'))).toBe(true);
    expect(isStorageError(new Error('x'))).toBe(false);
    expect(isStorageError(undefined)).toBe(false);
  });
});

describe('createId', () => {
  it('makes a UUID of version 7', () => {
    const id = createId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(RECORD_ID.test(id)).toBe(true);
  });

  it('starts with the time, so later ids sort later', () => {
    const early = createId(Date.UTC(2026, 0, 1));
    const late = createId(Date.UTC(2026, 9, 19));

    expect(early < late).toBe(true);
    expect(createId(0x0123456789ab).slice(0, 13)).toBe('01234567-89ab');
  });

  it('is different every time', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId()));

    expect(ids.size).toBe(1000);
  });
});

describe('RECORD_ID', () => {
  it('allows ids that are short and harmless', () => {
    for (const id of ['a', 'order-12_x', 'A'.repeat(64)]) expect(RECORD_ID.test(id)).toBe(true);
    for (const id of ['', 'a b', 'ü', 'x'.repeat(65), 'a/b'])
      expect(RECORD_ID.test(id)).toBe(false);
  });
});
