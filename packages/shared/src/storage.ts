/**
 * The storage contract (`storage@1`).
 *
 * Every module keeps its data in *collections*. A collection is a list of records of one shape, which
 * the module declares itself (`CollectionDef`). The storage module that provides this contract (SQLite
 * by default) stores them; anyone can write another one that behaves the same way. The conformance
 * suite tests that.
 *
 * The contract is a small collection store, not SQL: there are no joins and no raw queries, so every
 * storage module can implement it. A module that needs more (reports, for example) reads records with
 * `list()` and combines them itself.
 */

// ---------------------------------------------------------------- records and fields

/** The kinds of value a field can hold. */
export type FieldType =
  /** Text. */
  | 'string'
  /** A finite number (integer or fractional). */
  | 'number'
  | 'boolean'
  /** Anything that can be written as JSON (objects, arrays, ...). Cannot be used in `where`, `unique` or `indexes`. */
  | 'json'
  /** A date and time as a string in exactly the format of `Date.toISOString()`, for example "2026-10-19T11:50:31.490Z" (UTC, with milliseconds). */
  | 'datetime';

/**
 * What every record has, whatever its collection. The storage sets and maintains these fields; a module
 * cannot declare a field with one of these names, and cannot change them with `update()`.
 */
export interface BaseRecord {
  /** 1 to 64 characters: letters, digits, "-" and "_". A UUIDv7 (see `createId()`) unless the caller chose another. */
  id: string;
  /** When the record was inserted (ISO 8601, UTC). Never changes. */
  createdAt: string;
  /** When the record was last changed (ISO 8601, UTC): every update, adjustment, removal and restoration. */
  updatedAt: string;
  /** When the record was removed with `remove()`, or null while it is active. */
  deletedAt: string | null;
  /** Revision: 1 when inserted, plus 1 with every change. Used to notice that someone else changed a record. */
  rev: number;
}

/** The names of the fields that belong to every record. */
export const BASE_FIELDS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'rev'] as const;

type Fields<T extends BaseRecord> = Omit<T, keyof BaseRecord>;
type NullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? K : never }[keyof T];

/**
 * What `insert()` takes: the fields of the record, except the ones the storage sets (the `id` may be
 * given). Fields whose type allows null can be left out; they are stored as null.
 */
export type NewRecord<T extends BaseRecord> = { id?: string } & Omit<
  Fields<T>,
  NullableKeys<Fields<T>>
> &
  Partial<Pick<Fields<T>, NullableKeys<Fields<T>>>>;

/** What `update()` takes: any of the fields of the record, except the base fields. */
export type RecordPatch<T extends BaseRecord> = Partial<Omit<T, keyof BaseRecord>>;

// ---------------------------------------------------------------- queries

export type Primitive = string | number | boolean | null;

/**
 * Which records `list()` returns.
 *
 * - `where`: every entry has to match (AND). `{ field: value }` matches when the field equals the value
 *   (`null` matches an empty field), `{ field: { in: [a, b] } }` when it equals one of the values.
 *   Allowed fields: the declared fields except `json` ones, and `id`, `createdAt`, `updatedAt`, `rev`.
 * - `orderBy`: fields to sort by, in order. Allowed fields are the same. Without it (and for equal
 *   values) records come back in the order of `createdAt`, then `id`, so the order is always stable.
 *   Empty values (null) sort before every other value when ascending, and after all of them when descending.
 * - `limit`: at most this many records (a positive integer). Without it: all.
 * - `offset`: skip this many records (zero or more), after sorting.
 * - `includeDeleted`: also return records that were removed. Default false.
 *
 * A field that is not allowed, a value of the wrong type or a malformed limit throws
 * `StorageError('invalid-query')`.
 */
export interface Query {
  where?: Record<string, Primitive | { in: readonly Primitive[] }>;
  orderBy?: ReadonlyArray<readonly [field: string, direction: 'asc' | 'desc']>;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

// ---------------------------------------------------------------- transactions

declare const TRANSACTION: unique symbol;

/**
 * A running transaction. Modules do not look inside: they get one from `StorageProvider.transaction()`
 * and pass it on in the `tx` option of the operations that belong to it.
 */
export interface Tx {
  readonly [TRANSACTION]: true;
}

/** Options that every operation takes. */
export interface Options {
  /**
   * Run inside this transaction: the operation sees the changes the transaction made so far, and its own
   * changes are kept or undone with the transaction. Without it, the operation runs on its own and is
   * kept at once.
   */
  tx?: Tx;
}

// ---------------------------------------------------------------- collections

/** The result of `adjust()`. */
export interface AdjustResult {
  /** True when the change was made; false when it would have crossed `min` or `max` (nothing changed then). */
  ok: boolean;
  /** The value of the field now: the new value when `ok`, the unchanged current value otherwise. */
  value: number;
}

/**
 * The operations on one collection. `T` is the shape of its records.
 *
 * Operations on a record that does not exist throw `StorageError('not-found')`, and so do operations on a
 * record that was removed (except `get()` with `includeDeleted`, `restore()` and `purge()`).
 *
 * An operation that throws changes nothing, and it does not end the transaction it was part of.
 */
export interface Collection<T extends BaseRecord = BaseRecord> {
  /**
   * The record with this id, or null when there is none. A removed record counts as none, unless
   * `includeDeleted` is set.
   */
  get(id: string, options?: Options & { includeDeleted?: boolean }): Promise<T | null>;

  /** The records that match the query (see `Query`). Without a query: all active records. */
  list(query?: Query, options?: Options): Promise<T[]>;

  /**
   * Stores a new record and returns it, complete with the base fields: `rev` is 1, `createdAt` and
   * `updatedAt` are now, `deletedAt` is null. Fields that are not given are stored as null.
   *
   * Throws `StorageError` with code:
   * - `duplicate-id`: a record with this id exists (a removed record counts),
   * - `unique-violation`: an active record has the same values for the fields of a `unique` group,
   * - `invalid-field`: a field that the collection does not declare, or a base field other than `id`,
   * - `invalid-value`: a value that does not fit the type of its field, or an id that is not allowed.
   */
  insert(record: NewRecord<T>, options?: Options): Promise<T>;

  /**
   * Changes the given fields and returns the whole record. Fields that are not in the patch stay as they
   * are; `undefined` counts as not given, `null` empties the field. Adds 1 to `rev` and sets `updatedAt`.
   *
   * Pass `ifRev` to make sure nobody else changed the record in the meantime: when the record has another
   * `rev`, nothing changes and `StorageError('conflict')` is thrown (its details have `expected` and
   * `actual`). The other errors are the same as for `insert()`, without `duplicate-id`.
   */
  update(id: string, patch: RecordPatch<T>, options?: Options & { ifRev?: number }): Promise<T>;

  /**
   * Adds `delta` to a `number` field, in one step that cannot be interrupted: two callers at the same
   * moment never push the value across `min` or `max`. This is the way to count down a stock.
   *
   * - The new value has to be at least `min` and at most `max` (each only when given). Otherwise nothing
   *   changes and the result has `ok: false`.
   * - When the change is made, `rev` goes up by 1 and `updatedAt` is set.
   * - A field that is not a `number` field, or whose value is null, throws `StorageError('invalid-field')`
   *   or `StorageError('invalid-value')`: decide what an empty value means before you adjust.
   */
  adjust(
    id: string,
    field: string,
    delta: number,
    options?: Options & { min?: number; max?: number },
  ): Promise<AdjustResult>;

  /**
   * Removes the record without losing it ("soft delete"): sets `deletedAt` and `updatedAt`, adds 1 to
   * `rev`. The record disappears from `get()` and `list()` and no longer counts for `unique`. Removing a
   * record that is already removed changes nothing.
   */
  remove(id: string, options?: Options): Promise<void>;

  /**
   * Brings a removed record back: clears `deletedAt`, sets `updatedAt`, adds 1 to `rev`. Throws
   * `StorageError('unique-violation')` when an active record has taken its place. Restoring a record that
   * is not removed changes nothing.
   */
  restore(id: string, options?: Options): Promise<void>;

  /** Deletes the record for good, whether it was removed or not. Only for deliberate clean-ups. */
  purge(id: string, options?: Options): Promise<void>;
}

/**
 * How a module describes a collection.
 *
 * - `name`: `<moduleId>_<name>`, for example `stock_levels`. The part before the first "_" is the id of the
 *   module that owns the collection (module ids have no "_"). The rest is lowercase letters, digits and
 *   "_", starting with a letter. A module may only define and use its own collections.
 * - `schemaVersion`: the version of the shape, 1 or more. Raise it when the shape changes.
 * - `fields`: the fields of a record, with their types. Names start with a letter and use letters,
 *   digits and "_". The base fields (see `BASE_FIELDS`) are added by the storage and cannot be declared.
 * - `unique`: groups of fields whose values may only occur once among the active records. A group with
 *   several fields means the combination (two records may share one of them). A record with an empty
 *   (null) field in the group never conflicts.
 * - `indexes`: groups of fields that are searched or sorted often. Only a hint for speed.
 * - `migrations`: how to bring existing data from one version to the next. `migrations[N]` upgrades
 *   from version N-1 to N and runs in a transaction, in order, for every N above the stored version up
 *   to `schemaVersion`. A collection that is created fresh starts at `schemaVersion` without running any.
 *
 * Fields that a newer version adds are created by the storage (empty for existing records). Changing or
 * dropping fields needs a migration; the storage never throws away data on its own.
 */
export interface CollectionDef {
  name: string;
  schemaVersion: number;
  fields: Record<string, FieldType>;
  unique?: string[][];
  indexes?: string[][];
  migrations?: Record<number, (tx: Tx) => Promise<void>>;
}

// ---------------------------------------------------------------- the provider

/** The contract of the capability `storage@1`. */
export interface StorageProvider {
  /**
   * Announces a collection. Modules call this in `register()`. It only records the definition: nothing
   * is created yet. Defining the same collection again with the same definition changes nothing; with a
   * different one it throws `StorageError('invalid-collection')`, as does a definition that breaks the
   * rules of `CollectionDef` (see `validateCollectionDef`).
   */
  defineCollection(definition: CollectionDef): Promise<void>;

  /**
   * Creates the collections that were defined, brings existing ones to their `schemaVersion` (running
   * the migrations) and makes them usable. Only the core calls this: once, after every module registered
   * and before the first one starts.
   */
  migrate(): Promise<void>;

  /**
   * The operations on a collection. Throws `StorageError('invalid-collection')` when it was not defined.
   * A module can get its collections in `register()`, but may only use them from `start()` on, after
   * `migrate()` ran; before that, operations throw `StorageError('invalid-collection')`.
   */
  collection<T extends BaseRecord = BaseRecord>(name: string): Collection<T>;

  /**
   * Runs `work` as one unit. When it returns, every change made with the given `tx` is kept at once; when
   * it throws, all of them are undone and the error is thrown on unchanged. Transactions run one after
   * another: a second one starts when the first has finished. Calls that are not given the `tx` are not
   * part of the transaction, even while one is running. They may wait until it has finished, so inside
   * `work` always pass the `tx` and never wait for a call without it. Do not start a transaction inside
   * `work`: it would wait for the one it is in.
   */
  transaction<R>(work: (tx: Tx) => Promise<R>): Promise<R>;
}

// ---------------------------------------------------------------- errors

export type StorageErrorCode =
  | 'not-found'
  | 'conflict'
  | 'unique-violation'
  | 'duplicate-id'
  | 'invalid-field'
  | 'invalid-value'
  | 'invalid-query'
  | 'invalid-collection';

const BRAND: unique symbol = Symbol.for('mcrs.storageError');

/** What every storage module throws when an operation cannot be done. The code says why. */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly details: unknown;
  readonly [BRAND] = true;

  constructor(code: StorageErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
  }

  /** Works across copies of this package (see Reject): the check looks for a marker. */
  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<symbol, unknown>)[BRAND] === true
    );
  }
}

export function isStorageError(value: unknown): value is StorageError {
  return value instanceof StorageError;
}

// ---------------------------------------------------------------- rules every storage module applies

/** A collection name: the id of the owning module, "_", then a name. */
const COLLECTION_NAME = /^([a-z0-9][a-z0-9-]*)_([a-z][a-z0-9_]*)$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]*$/;
const FIELD_TYPES: readonly string[] = ['string', 'number', 'boolean', 'json', 'datetime'];

/** Ids that callers may choose: 1 to 64 characters, letters, digits, "-" and "_". */
export const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The id of the module that owns a collection, or null when the name does not have the right shape. */
export function ownerOfCollection(name: string): string | null {
  return COLLECTION_NAME.exec(name)?.[1] ?? null;
}

/**
 * What is wrong with a collection definition? An empty list means nothing. Storage modules call this in
 * `defineCollection()`; pass `owner` (the id of the calling module) to also check that the collection
 * belongs to it.
 */
export function validateCollectionDef(
  definition: unknown,
  options: { owner?: string } = {},
): string[] {
  if (typeof definition !== 'object' || definition === null)
    return ['the definition has to be an object'];
  const def = definition as Partial<Record<keyof CollectionDef, unknown>>;
  const problems: string[] = [];

  if (typeof def.name !== 'string' || !COLLECTION_NAME.test(def.name)) {
    problems.push(
      '"name" has to look like <moduleId>_<name>, for example "stock_levels" (lowercase letters, digits and "_")',
    );
  } else if (options.owner !== undefined && ownerOfCollection(def.name) !== options.owner) {
    problems.push(
      `"name" has to start with "${options.owner}_", because module "${options.owner}" owns the collection`,
    );
  }

  if (!Number.isInteger(def.schemaVersion) || (def.schemaVersion as number) < 1) {
    problems.push('"schemaVersion" has to be a whole number, 1 or more');
  }

  const declared = new Set<string>();
  if (typeof def.fields !== 'object' || def.fields === null || Array.isArray(def.fields)) {
    problems.push('"fields" has to be an object that maps field names to types');
  } else {
    for (const [field, type] of Object.entries(def.fields)) {
      if (!FIELD_NAME.test(field))
        problems.push(
          `field "${field}": the name has to start with a lowercase letter and use letters, digits and "_"`,
        );
      else if ((BASE_FIELDS as readonly string[]).includes(field))
        problems.push(`field "${field}" belongs to every record and cannot be declared`);
      else declared.add(field);
      if (typeof type !== 'string' || !FIELD_TYPES.includes(type))
        problems.push(`field "${field}": the type has to be one of ${FIELD_TYPES.join(', ')}`);
    }
  }

  const fieldTypes = (def.fields ?? {}) as Record<string, unknown>;
  for (const key of ['unique', 'indexes'] as const) {
    const groups = def[key];
    if (groups === undefined) continue;
    if (!Array.isArray(groups)) {
      problems.push(`"${key}" has to be a list of field groups`);
      continue;
    }
    groups.forEach((group: unknown, index) => {
      if (!Array.isArray(group) || group.length === 0) {
        problems.push(`${key}[${index}] has to be a list of field names with at least one entry`);
        return;
      }
      for (const field of group) {
        if (typeof field !== 'string' || !declared.has(field))
          problems.push(`${key}[${index}]: "${String(field)}" is not a declared field`);
        else if (fieldTypes[field] === 'json')
          problems.push(`${key}[${index}]: "${field}" is a json field and cannot be used here`);
      }
    });
  }

  if (def.migrations !== undefined) {
    const migrations = def.migrations;
    if (typeof migrations !== 'object' || migrations === null || Array.isArray(migrations)) {
      problems.push('"migrations" has to be an object that maps version numbers to functions');
    } else {
      const latest = Number.isInteger(def.schemaVersion) ? (def.schemaVersion as number) : Infinity;
      for (const [version, work] of Object.entries(migrations)) {
        const n = Number(version);
        if (!Number.isInteger(n) || n < 2 || n > latest)
          problems.push(
            `migrations[${version}]: the key has to be a version from 2 up to the schemaVersion`,
          );
        if (typeof work !== 'function')
          problems.push(`migrations[${version}] has to be a function`);
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------- ids

/**
 * A new record id: a UUIDv7, which starts with the time, so ids created later sort later. It works in
 * browsers too (also over plain HTTP, where `crypto.randomUUID` does not), because it only needs
 * `crypto.getRandomValues`. Clients use it to choose the id of an order before they send it.
 */
export function createId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  // 48 bits of time (milliseconds since 1970), then the random bytes
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
