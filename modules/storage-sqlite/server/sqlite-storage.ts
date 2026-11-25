import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  StorageError,
  assertWritableField,
  checkFieldValue,
  checkQuery,
  checkRecordId,
  createId,
  validateCollectionDef,
  type AdjustResult,
  type BaseRecord,
  type Collection,
  type CollectionDef,
  type FieldType,
  type NewRecord,
  type Options,
  type Query,
  type RecordPatch,
  type StorageProvider,
  type Tx,
} from '@mcrs/shared';

type Row = Record<string, unknown>;
type SqlValue = string | number | null;

/** Names are checked by the contract (letters, digits, "-" and "_"), so quoting them is enough. */
const quote = (name: string): string => `"${name}"`;
const META = quote('_mcrs_collections');

const COLUMN_TYPE: Record<FieldType, string> = {
  string: 'TEXT',
  number: 'REAL',
  boolean: 'INTEGER',
  json: 'TEXT',
  datetime: 'TEXT',
};

/** A value as SQLite stores it (booleans as 0 and 1, json as text). */
function toSql(type: FieldType, value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (type === 'boolean') return value ? 1 : 0;
  if (type === 'json') return JSON.stringify(value);
  return value as string | number;
}

function fromSql(type: FieldType, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (type === 'boolean') return value === 1;
  if (type === 'json') return JSON.parse(value as string);
  return value;
}

/** Groups of fields in a fixed order, so that writing them in another order is not a change. */
function normalized(groups: string[][] | undefined): string[][] {
  return (groups ?? [])
    .map((group) => [...group].sort())
    .sort((a, b) => (a.join(',') < b.join(',') ? -1 : 1));
}

/** What identifies the shape of a collection (not the version, not the migrations). */
function shapeOf(definition: CollectionDef): string {
  const fields = Object.entries(definition.fields).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify({
    fields,
    unique: normalized(definition.unique),
    indexes: normalized(definition.indexes),
  });
}

/** A database error that means "this value is taken" becomes the matching StorageError. */
function translate(error: unknown): unknown {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('UNIQUE constraint failed')) {
    return new StorageError(message.endsWith('.id') ? 'duplicate-id' : 'unique-violation', message);
  }
  return error;
}

class TxHandle {
  active = true;
}

/**
 * The storage contract (`storage@1`) on top of SQLite (`node:sqlite`). One table per collection; the
 * unique groups are also partial unique indexes (`WHERE deletedAt IS NULL`), as a second line of
 * defence next to the checks in this code. The database is only used by this process.
 */
export class SqliteStorage implements StorageProvider {
  private readonly db: DatabaseSync;
  private readonly definitions = new Map<string, CollectionDef>();
  private readonly statements = new Map<string, StatementSync>();
  private current: Promise<void> | null = null;
  private migrated = false;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async defineCollection(definition: CollectionDef): Promise<void> {
    const problems = validateCollectionDef(definition);
    if (problems.length > 0)
      throw new StorageError('invalid-collection', problems.join('; '), { problems });

    const known = this.definitions.get(definition.name);
    if (known !== undefined) {
      if (
        shapeOf(known) !== shapeOf(definition) ||
        known.schemaVersion !== definition.schemaVersion
      ) {
        throw new StorageError(
          'invalid-collection',
          `collection "${definition.name}" was already defined differently`,
        );
      }
      return;
    }
    if (this.migrated) {
      throw new StorageError(
        'invalid-collection',
        `collection "${definition.name}" was defined too late: define collections in register(), before migrate()`,
      );
    }
    this.definitions.set(definition.name, definition);
  }

  async migrate(): Promise<void> {
    if (this.migrated) return;
    await this.transaction(async () => {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${META} ("name" TEXT PRIMARY KEY NOT NULL, "schemaVersion" INTEGER NOT NULL, "shape" TEXT NOT NULL)`,
      );
      for (const definition of this.definitions.values()) this.prepareCollection(definition);
    });
    this.migrated = true;
  }

  collection<T extends BaseRecord = BaseRecord>(name: string): Collection<T> {
    const definition = this.definitions.get(name);
    if (definition === undefined)
      throw new StorageError('invalid-collection', `collection "${name}" was not defined`);
    return new SqliteCollection<T>(this, definition) as unknown as Collection<T>;
  }

  async transaction<R>(work: (tx: Tx) => Promise<R>): Promise<R> {
    while (this.current !== null) await this.current; // one after another
    const handle = new TxHandle();
    let release!: () => void;
    this.current = new Promise<void>((resolve) => (release = resolve));
    try {
      this.db.exec('BEGIN IMMEDIATE');
      let result: R;
      try {
        result = await work(handle as unknown as Tx);
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      try {
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
      return result;
    } finally {
      handle.active = false;
      this.current = null;
      release();
    }
  }

  /** Closes the database. The storage cannot be used afterwards. */
  close(): void {
    this.statements.clear();
    this.db.close();
  }

  // ---------------------------------------------------------------- used by the collections

  /** Runs one operation: at once inside its transaction, otherwise after the running transaction. */
  async run<R>(options: Options | undefined, operation: () => R): Promise<R> {
    if (!this.migrated) {
      throw new StorageError(
        'invalid-collection',
        'the storage has not been migrated yet: use collections from start() on, after migrate()',
      );
    }
    const tx = options?.tx as unknown as TxHandle | undefined;
    if (tx !== undefined) {
      if (!(tx instanceof TxHandle) || !tx.active)
        throw new StorageError('invalid-value', 'the transaction is not active any more');
      return operation();
    }
    while (this.current !== null) await this.current;
    return operation();
  }

  all(sql: string, params: SqlValue[] = []): Row[] {
    return this.statement(sql).all(...params) as Row[];
  }

  first(sql: string, params: SqlValue[] = []): Row | undefined {
    return this.statement(sql).get(...params) as Row | undefined;
  }

  /** Runs a statement that changes data. Returns how many rows it changed. */
  write(sql: string, params: SqlValue[] = []): number {
    try {
      return Number(this.statement(sql).run(...params).changes);
    } catch (error) {
      throw translate(error);
    }
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (statement === undefined) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  // ---------------------------------------------------------------- tables

  private prepareCollection(definition: CollectionDef): void {
    const stored = this.first(`SELECT "schemaVersion", "shape" FROM ${META} WHERE "name" = ?`, [
      definition.name,
    ]);
    const shape = shapeOf(definition);

    if (stored === undefined) {
      this.createTable(definition);
      this.write(`INSERT INTO ${META} ("name", "schemaVersion", "shape") VALUES (?, ?, ?)`, [
        definition.name,
        definition.schemaVersion,
        shape,
      ]);
      return;
    }

    const version = Number(stored.schemaVersion);
    if (version > definition.schemaVersion) {
      throw new StorageError(
        'invalid-collection',
        `the database has ${definition.name} at version ${version}, which is newer than the code (version ${definition.schemaVersion})`,
      );
    }
    if (version < definition.schemaVersion) {
      throw new StorageError(
        'invalid-collection',
        `${definition.name} is at version ${version} in the database and the code has version ${definition.schemaVersion}: upgrading is not supported yet`,
      );
    }
    if (stored.shape !== shape) {
      throw new StorageError(
        'invalid-collection',
        `the definition of ${definition.name} changed without raising its schemaVersion (${version})`,
      );
    }
    this.createIndexes(definition); // makes sure they exist
  }

  private createTable(definition: CollectionDef): void {
    const columns = [
      '"id" TEXT PRIMARY KEY NOT NULL',
      '"createdAt" TEXT NOT NULL',
      '"updatedAt" TEXT NOT NULL',
      '"deletedAt" TEXT',
      '"rev" INTEGER NOT NULL',
      ...Object.entries(definition.fields).map(
        ([field, type]) => `${quote(field)} ${COLUMN_TYPE[type]}`,
      ),
    ];
    this.db.exec(`CREATE TABLE ${quote(definition.name)} (${columns.join(', ')})`);
    this.createIndexes(definition);
  }

  private createIndexes(definition: CollectionDef): void {
    const table = quote(definition.name);
    normalized(definition.unique).forEach((group, index) => {
      this.db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quote(`${definition.name}__u${index}`)} ON ${table} (${group.map(quote).join(', ')}) WHERE "deletedAt" IS NULL`,
      );
    });
    normalized(definition.indexes).forEach((group, index) => {
      this.db.exec(
        `CREATE INDEX IF NOT EXISTS ${quote(`${definition.name}__i${index}`)} ON ${table} (${group.map(quote).join(', ')})`,
      );
    });
  }
}

export function createSqliteStorage(db: DatabaseSync): SqliteStorage {
  return new SqliteStorage(db);
}

// ====================================================================== collections

class SqliteCollection<T extends BaseRecord> {
  private readonly storage: SqliteStorage;
  private readonly definition: CollectionDef;
  private readonly table: string;
  private readonly fieldNames: string[];

  constructor(storage: SqliteStorage, definition: CollectionDef) {
    this.storage = storage;
    this.definition = definition;
    this.table = quote(definition.name);
    this.fieldNames = Object.keys(definition.fields);
  }

  get(id: string, options?: Options & { includeDeleted?: boolean }): Promise<T | null> {
    return this.storage.run(options, () => {
      const record = this.select(id);
      if (record === undefined || (record.deletedAt !== null && options?.includeDeleted !== true))
        return null;
      return record as unknown as T;
    });
  }

  list(query?: Query, options?: Options): Promise<T[]> {
    return this.storage.run(options, () => {
      const checked = checkQuery(this.definition, query ?? {});
      const params: SqlValue[] = [];
      const conditions: string[] = [];
      if (!checked.includeDeleted) conditions.push('"deletedAt" IS NULL');

      for (const condition of checked.where) {
        const column = quote(condition.field);
        const present = condition.values.filter((value) => value !== null);
        const hasNull = present.length !== condition.values.length;
        const parts: string[] = [];
        if (present.length > 0) {
          parts.push(
            condition.many
              ? `${column} IN (${present.map(() => '?').join(', ')})`
              : `${column} = ?`,
          );
          params.push(...present.map((value) => toSql(condition.type, value)));
        }
        if (hasNull) parts.push(`${column} IS NULL`);
        conditions.push(parts.length === 0 ? '0' : `(${parts.join(' OR ')})`);
      }

      const order = [
        ...checked.orderBy.map(
          ({ field, descending }) => `${quote(field)} ${descending ? 'DESC' : 'ASC'}`,
        ),
        '"createdAt" ASC',
        '"id" ASC',
      ];
      let sql = `SELECT * FROM ${this.table}${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''} ORDER BY ${order.join(', ')}`;
      if (checked.limit !== undefined || checked.offset !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        params.push(checked.limit ?? -1, checked.offset ?? 0);
      }
      return this.storage.all(sql, params).map((row) => this.record(row)) as unknown as T[];
    });
  }

  insert(record: NewRecord<T>, options?: Options): Promise<T> {
    return this.storage.run(options, () => {
      const { id: given, ...fields } = record as Record<string, unknown>;
      for (const name of Object.keys(fields)) assertWritableField(this.definition, name, 'given');

      const id = given === undefined ? createId() : checkRecordId(given);
      if (this.select(id) !== undefined)
        throw new StorageError(
          'duplicate-id',
          `a record "${id}" exists already in ${this.definition.name}`,
          { id },
        );

      const now = new Date().toISOString();
      const row: Row = { id, createdAt: now, updatedAt: now, deletedAt: null, rev: 1 };
      for (const name of this.fieldNames) row[name] = null;
      for (const [name, value] of Object.entries(fields))
        if (value !== undefined) row[name] = checkFieldValue(this.definition, name, value);
      this.checkUnique(row, null);

      const columns = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'rev', ...this.fieldNames];
      this.storage.write(
        `INSERT INTO ${this.table} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => this.sqlValue(column, row[column])),
      );
      return row as unknown as T;
    });
  }

  update(id: string, patch: RecordPatch<T>, options?: Options & { ifRev?: number }): Promise<T> {
    return this.storage.run(options, () => {
      const current = this.active(id);
      const changes = patch as Record<string, unknown>;
      for (const name of Object.keys(changes))
        assertWritableField(this.definition, name, 'changed');
      if (options?.ifRev !== undefined && current.rev !== options.ifRev) {
        throw new StorageError(
          'conflict',
          `record "${id}" has revision ${String(current.rev)}, not ${options.ifRev}`,
          { expected: options.ifRev, actual: current.rev },
        );
      }

      const next: Row = { ...current };
      for (const [name, value] of Object.entries(changes))
        if (value !== undefined) next[name] = checkFieldValue(this.definition, name, value);
      this.checkUnique(next, id);
      next.rev = (current.rev as number) + 1;
      next.updatedAt = this.later(current);

      const columns = [...this.fieldNames, 'rev', 'updatedAt'];
      this.storage.write(
        `UPDATE ${this.table} SET ${columns.map((column) => `${quote(column)} = ?`).join(', ')} WHERE "id" = ?`,
        [...columns.map((column) => this.sqlValue(column, next[column])), id],
      );
      return next as unknown as T;
    });
  }

  adjust(
    id: string,
    field: string,
    delta: number,
    options?: Options & { min?: number; max?: number },
  ): Promise<AdjustResult> {
    return this.storage.run(options, () => {
      if (
        !Object.hasOwn(this.definition.fields, field) ||
        this.definition.fields[field] !== 'number'
      ) {
        throw new StorageError(
          'invalid-field',
          `"${field}" is not a number field of ${this.definition.name}`,
        );
      }
      const current = this.active(id);
      for (const [name, value] of [
        ['delta', delta],
        ['min', options?.min],
        ['max', options?.max],
      ] as const) {
        if (value !== undefined && !(typeof value === 'number' && Number.isFinite(value)))
          throw new StorageError('invalid-value', `${name} has to be a finite number`);
      }
      const before = current[field];
      if (typeof before !== 'number')
        throw new StorageError(
          'invalid-value',
          `"${field}" of record "${id}" is empty, so there is nothing to adjust`,
        );

      const value = before + delta;
      if (
        (options?.min !== undefined && value < options.min) ||
        (options?.max !== undefined && value > options.max)
      )
        return { ok: false, value: before };

      this.storage.write(
        `UPDATE ${this.table} SET ${quote(field)} = ?, "rev" = ?, "updatedAt" = ? WHERE "id" = ?`,
        [value, (current.rev as number) + 1, this.later(current), id],
      );
      return { ok: true, value };
    });
  }

  remove(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      const record = this.existing(id);
      if (record.deletedAt !== null) return;
      const now = this.later(record);
      this.storage.write(
        `UPDATE ${this.table} SET "deletedAt" = ?, "updatedAt" = ?, "rev" = ? WHERE "id" = ?`,
        [now, now, (record.rev as number) + 1, id],
      );
    });
  }

  restore(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      const record = this.existing(id);
      if (record.deletedAt === null) return;
      this.checkUnique(record, id);
      this.storage.write(
        `UPDATE ${this.table} SET "deletedAt" = NULL, "updatedAt" = ?, "rev" = ? WHERE "id" = ?`,
        [this.later(record), (record.rev as number) + 1, id],
      );
    });
  }

  purge(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      if (this.storage.write(`DELETE FROM ${this.table} WHERE "id" = ?`, [id]) === 0) {
        throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
      }
    });
  }

  // ---------------------------------------------------------------- helpers

  /** A row as a record: booleans and json turned back into values. */
  private record(row: Row): Row {
    const record: Row = {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
      rev: row.rev,
    };
    for (const name of this.fieldNames)
      record[name] = fromSql(this.definition.fields[name] as FieldType, row[name]);
    return record;
  }

  private select(id: string): Row | undefined {
    const row = this.storage.first(`SELECT * FROM ${this.table} WHERE "id" = ?`, [id]);
    return row === undefined ? undefined : this.record(row);
  }

  /** The record, also when it was removed. */
  private existing(id: string): Row {
    const record = this.select(id);
    if (record === undefined)
      throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
    return record;
  }

  private active(id: string): Row {
    const record = this.select(id);
    if (record === undefined || record.deletedAt !== null)
      throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
    return record;
  }

  private sqlValue(column: string, value: unknown): SqlValue {
    return Object.hasOwn(this.definition.fields, column)
      ? toSql(this.definition.fields[column] as FieldType, value)
      : (value as SqlValue);
  }

  /** A timestamp that is never earlier than the last change of the record (the clock may step back). */
  private later(record: Row): string {
    const now = new Date().toISOString();
    return now < (record.updatedAt as string) ? (record.updatedAt as string) : now;
  }

  private checkUnique(values: Row, ignoreId: string | null): void {
    for (const group of this.definition.unique ?? []) {
      const parts = group.map((field) => values[field]);
      if (parts.some((part) => part === null || part === undefined)) continue;
      const taken = this.storage.first(
        `SELECT 1 AS taken FROM ${this.table} WHERE "deletedAt" IS NULL AND "id" <> ? AND ${group.map((field) => `${quote(field)} = ?`).join(' AND ')} LIMIT 1`,
        [
          ignoreId ?? '',
          ...group.map((field, index) =>
            toSql(this.definition.fields[field] as FieldType, parts[index]),
          ),
        ],
      );
      if (taken !== undefined)
        throw new StorageError(
          'unique-violation',
          `another record has the same ${group.join(' and ')}`,
          { fields: group },
        );
    }
  }
}
