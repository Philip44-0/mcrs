import {
  BASE_FIELDS,
  RECORD_ID,
  StorageError,
  createId,
  validateCollectionDef,
  type AdjustResult,
  type BaseRecord,
  type Collection,
  type CollectionDef,
  type FieldType,
  type NewRecord,
  type Options,
  type Primitive,
  type Query,
  type RecordPatch,
  type StorageProvider,
  type Tx,
} from '../src/storage';

/**
 * A storage module that keeps everything in memory. It follows the storage contract exactly, so it is
 * the reference the conformance suite is checked against, and a handy stand-in in the tests of other
 * modules: `const storage = createMemoryStorage()`. Nothing is kept after the process ends.
 */
export function createMemoryStorage(): StorageProvider {
  return new MemoryStorage();
}

type Row = Record<string, unknown>;
type Data = Map<string, Map<string, Row>>;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isIso = (value: string): boolean =>
  ISO.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

const BASE_QUERYABLE: Record<string, FieldType> = {
  id: 'string',
  createdAt: 'datetime',
  updatedAt: 'datetime',
  rev: 'number',
};

class TxHandle {
  active = true;
}

class MemoryStorage implements StorageProvider {
  private readonly definitions = new Map<string, CollectionDef>();
  private data: Data = new Map();
  private current: Promise<void> | null = null;

  async defineCollection(definition: CollectionDef): Promise<void> {
    const problems = validateCollectionDef(definition);
    if (problems.length > 0)
      throw new StorageError('invalid-collection', problems.join('; '), { problems });

    const known = this.definitions.get(definition.name);
    if (known !== undefined) {
      if (JSON.stringify(shape(known)) !== JSON.stringify(shape(definition))) {
        throw new StorageError(
          'invalid-collection',
          `collection "${definition.name}" was already defined differently`,
        );
      }
      return;
    }
    this.definitions.set(definition.name, definition);
    this.data.set(definition.name, new Map());
  }

  async migrate(): Promise<void> {
    // Nothing is stored between runs, so every collection starts fresh at its schemaVersion.
  }

  collection<T extends BaseRecord = BaseRecord>(name: string): Collection<T> {
    const definition = this.definitions.get(name);
    if (definition === undefined)
      throw new StorageError('invalid-collection', `collection "${name}" was not defined`);
    return new MemoryCollection<T>(this, definition) as unknown as Collection<T>;
  }

  async transaction<R>(work: (tx: Tx) => Promise<R>): Promise<R> {
    while (this.current !== null) await this.current; // one after another
    const handle = new TxHandle();
    const before = structuredClone(this.data);
    let release!: () => void;
    this.current = new Promise<void>((resolve) => (release = resolve));
    try {
      return await work(handle as unknown as Tx);
    } catch (error) {
      this.data = before;
      throw error;
    } finally {
      handle.active = false;
      this.current = null;
      release();
    }
  }

  /** Runs one operation: at once inside its transaction, otherwise after the running transaction. */
  async run<R>(options: Options | undefined, operation: () => R): Promise<R> {
    const tx = options?.tx as unknown as TxHandle | undefined;
    if (tx !== undefined) {
      if (!(tx instanceof TxHandle) || !tx.active)
        throw new StorageError('invalid-value', 'the transaction is not active any more');
      return operation();
    }
    while (this.current !== null) await this.current;
    return operation();
  }

  rows(name: string): Map<string, Row> {
    return this.data.get(name) as Map<string, Row>;
  }
}

function shape(definition: CollectionDef) {
  return {
    name: definition.name,
    schemaVersion: definition.schemaVersion,
    fields: definition.fields,
    unique: definition.unique ?? [],
    indexes: definition.indexes ?? [],
    migrations: Object.keys(definition.migrations ?? {}),
  };
}

class MemoryCollection<T extends BaseRecord> {
  private readonly storage: MemoryStorage;
  private readonly definition: CollectionDef;

  constructor(storage: MemoryStorage, definition: CollectionDef) {
    this.storage = storage;
    this.definition = definition;
  }

  private get rows(): Map<string, Row> {
    return this.storage.rows(this.definition.name);
  }

  private find(id: string): Row {
    const row = this.rows.get(id);
    if (row === undefined || row.deletedAt !== null)
      throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
    return row;
  }

  get(id: string, options?: Options & { includeDeleted?: boolean }): Promise<T | null> {
    return this.storage.run(options, () => {
      const row = this.rows.get(id);
      if (row === undefined || (row.deletedAt !== null && options?.includeDeleted !== true))
        return null;
      return structuredClone(row) as unknown as T;
    });
  }

  list(query?: Query, options?: Options): Promise<T[]> {
    return this.storage.run(options, () => this.query(query ?? {}) as unknown as T[]);
  }

  insert(record: NewRecord<T>, options?: Options): Promise<T> {
    return this.storage.run(options, () => {
      const input = record as Record<string, unknown>;
      const { id: given, ...fields } = input;
      for (const name of Object.keys(fields)) this.checkWritable(name);

      let id: string;
      if (given === undefined) id = createId();
      else if (typeof given === 'string' && RECORD_ID.test(given)) id = given;
      else throw new StorageError('invalid-value', `"${String(given)}" is not an allowed id`);
      if (this.rows.has(id))
        throw new StorageError(
          'duplicate-id',
          `a record "${id}" exists already in ${this.definition.name}`,
          { id },
        );

      const now = new Date().toISOString();
      const row: Row = { id, createdAt: now, updatedAt: now, deletedAt: null, rev: 1 };
      for (const name of Object.keys(this.definition.fields)) row[name] = null;
      for (const [name, value] of Object.entries(fields))
        if (value !== undefined) row[name] = this.checked(name, value);

      this.checkUnique(row);
      this.rows.set(id, row);
      return structuredClone(row) as unknown as T;
    });
  }

  update(id: string, patch: RecordPatch<T>, options?: Options & { ifRev?: number }): Promise<T> {
    return this.storage.run(options, () => {
      const row = this.find(id);
      const changes = patch as Record<string, unknown>;
      for (const name of Object.keys(changes)) this.checkWritable(name, true);
      if (options?.ifRev !== undefined && row.rev !== options.ifRev) {
        throw new StorageError(
          'conflict',
          `record "${id}" has revision ${String(row.rev)}, not ${options.ifRev}`,
          { expected: options.ifRev, actual: row.rev },
        );
      }

      const next: Row = { ...row };
      for (const [name, value] of Object.entries(changes))
        if (value !== undefined) next[name] = this.checked(name, value);
      this.checkUnique(next);

      next.rev = (row.rev as number) + 1;
      next.updatedAt = this.later(row);
      this.rows.set(id, next);
      return structuredClone(next) as unknown as T;
    });
  }

  adjust(
    id: string,
    field: string,
    delta: number,
    options?: Options & { min?: number; max?: number },
  ): Promise<AdjustResult> {
    return this.storage.run(options, () => {
      if (this.definition.fields[field] !== 'number')
        throw new StorageError(
          'invalid-field',
          `"${field}" is not a number field of ${this.definition.name}`,
        );
      const row = this.find(id);
      for (const [name, value] of [
        ['delta', delta],
        ['min', options?.min],
        ['max', options?.max],
      ] as const) {
        if (value !== undefined && !(typeof value === 'number' && Number.isFinite(value)))
          throw new StorageError('invalid-value', `${name} has to be a finite number`);
      }
      const current = row[field];
      if (typeof current !== 'number')
        throw new StorageError(
          'invalid-value',
          `"${field}" of record "${id}" is empty, so there is nothing to adjust`,
        );

      const value = current + delta;
      if (
        (options?.min !== undefined && value < options.min) ||
        (options?.max !== undefined && value > options.max)
      )
        return { ok: false, value: current };

      row[field] = value;
      row.rev = (row.rev as number) + 1;
      row.updatedAt = this.later(row);
      return { ok: true, value };
    });
  }

  remove(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      const row = this.rows.get(id);
      if (row === undefined)
        throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
      if (row.deletedAt !== null) return;
      const now = this.later(row);
      row.deletedAt = now;
      row.updatedAt = now;
      row.rev = (row.rev as number) + 1;
    });
  }

  restore(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      const row = this.rows.get(id);
      if (row === undefined)
        throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
      if (row.deletedAt === null) return;
      this.checkUnique({ ...row, deletedAt: null });
      row.deletedAt = null;
      row.updatedAt = this.later(row);
      row.rev = (row.rev as number) + 1;
    });
  }

  purge(id: string, options?: Options): Promise<void> {
    return this.storage.run(options, () => {
      if (!this.rows.delete(id))
        throw new StorageError('not-found', `no record "${id}" in ${this.definition.name}`);
    });
  }

  // ------------------------------------------------------------ helpers

  /** A timestamp that is never earlier than the last change of the row (the clock may step back). */
  private later(row: Row): string {
    const now = new Date().toISOString();
    return now < (row.updatedAt as string) ? (row.updatedAt as string) : now;
  }

  private checkWritable(name: string, forUpdate = false): void {
    if ((BASE_FIELDS as readonly string[]).includes(name)) {
      throw new StorageError(
        'invalid-field',
        `"${name}" is set by the storage and cannot be ${forUpdate ? 'changed' : 'given'}`,
      );
    }
    if (!(name in this.definition.fields))
      throw new StorageError(
        'invalid-field',
        `"${name}" is not a field of ${this.definition.name}`,
      );
  }

  private checked(name: string, value: unknown): unknown {
    if (value === null) return null;
    const type = this.definition.fields[name] as FieldType;
    const fine =
      (type === 'string' && typeof value === 'string') ||
      (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (type === 'boolean' && typeof value === 'boolean') ||
      (type === 'datetime' && typeof value === 'string' && isIso(value)) ||
      (type === 'json' && jsonText(value) !== undefined);
    if (!fine)
      throw new StorageError('invalid-value', `the value of "${name}" is not a valid ${type}`);
    return type === 'json' ? JSON.parse(jsonText(value) as string) : value;
  }

  private checkUnique(candidate: Row): void {
    for (const group of this.definition.unique ?? []) {
      const values = group.map((field) => candidate[field]);
      if (values.some((value) => value === null)) continue;
      for (const other of this.rows.values()) {
        if (other.id === candidate.id || other.deletedAt !== null) continue;
        if (group.every((field, index) => other[field] === values[index])) {
          throw new StorageError(
            'unique-violation',
            `another record has the same ${group.join(' and ')}`,
            { fields: group },
          );
        }
      }
    }
  }

  private fieldType(name: string): FieldType | undefined {
    const type = BASE_QUERYABLE[name] ?? this.definition.fields[name];
    return type === 'json' ? undefined : type;
  }

  private query(query: Query): Row[] {
    const bad = (message: string): never => {
      throw new StorageError('invalid-query', message);
    };
    const typeOf = (name: string): FieldType =>
      this.fieldType(name) ?? bad(`"${name}" cannot be used in a query`);
    const fits = (type: FieldType, value: unknown): boolean =>
      value === null ||
      (type === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : type === 'boolean'
          ? typeof value === 'boolean'
          : typeof value === 'string');

    const tests: Array<(row: Row) => boolean> = [];
    for (const [name, condition] of Object.entries(query.where ?? {})) {
      const type = typeOf(name);
      if (typeof condition === 'object' && condition !== null) {
        const list = (condition as { in?: unknown }).in;
        if (!Array.isArray(list) || !list.every((value) => fits(type, value)))
          bad(`"in" of "${name}" has to be a list of values of the right type`);
        tests.push((row) => (list as Primitive[]).includes(row[name] as Primitive));
      } else {
        if (!fits(type, condition)) bad(`the value for "${name}" is not a ${type}`);
        tests.push((row) => row[name] === condition);
      }
    }

    const order = [...(query.orderBy ?? []), ['createdAt', 'asc'], ['id', 'asc']] as Array<
      readonly [string, string]
    >;
    for (const [name, direction] of query.orderBy ?? []) {
      typeOf(name);
      if (direction !== 'asc' && direction !== 'desc')
        bad(`the direction for "${name}" has to be "asc" or "desc"`);
    }
    const { limit, offset } = query;
    if (limit !== undefined && !(Number.isInteger(limit) && limit > 0))
      bad('"limit" has to be a positive whole number');
    if (offset !== undefined && !(Number.isInteger(offset) && offset >= 0))
      bad('"offset" has to be a whole number, 0 or more');

    const compare = (a: unknown, b: unknown): number =>
      a === b ? 0 : a === null ? -1 : b === null ? 1 : (a as string) < (b as string) ? -1 : 1;
    const rows = [...this.rows.values()]
      .filter(
        (row) =>
          (query.includeDeleted === true || row.deletedAt === null) &&
          tests.every((test) => test(row)),
      )
      .sort((a, b) => {
        for (const [name, direction] of order) {
          const result = compare(a[name], b[name]);
          if (result !== 0) return direction === 'desc' ? -result : result;
        }
        return 0;
      });
    return structuredClone(
      rows.slice(offset ?? 0, limit === undefined ? undefined : (offset ?? 0) + limit),
    );
  }
}

/** The JSON text of a value, or undefined when it cannot be written as JSON. */
function jsonText(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
