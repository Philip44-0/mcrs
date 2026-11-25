import {
  BASE_FIELDS,
  RECORD_ID,
  StorageError,
  type CollectionDef,
  type FieldType,
  type Primitive,
  type Query,
} from './storage';

/**
 * The checks that every storage module has to make in the same way. A storage module calls these and
 * then does the actual storing, so all of them throw the same errors for the same mistakes.
 */

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** True for a string in exactly the format of `Date.toISOString()`. */
export function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

/** An id that a caller chose: returned as it is, or `invalid-value`. */
export function checkRecordId(id: unknown): string {
  if (typeof id === 'string' && RECORD_ID.test(id)) return id;
  throw new StorageError('invalid-value', `"${String(id)}" is not an allowed id`);
}

/** A field a caller may set: declared by the collection, and not one of the base fields. */
export function assertWritableField(
  definition: CollectionDef,
  field: string,
  action: 'given' | 'changed',
): void {
  if ((BASE_FIELDS as readonly string[]).includes(field)) {
    throw new StorageError(
      'invalid-field',
      `"${field}" is set by the storage and cannot be ${action}`,
    );
  }
  if (!Object.hasOwn(definition.fields, field)) {
    throw new StorageError('invalid-field', `"${field}" is not a field of ${definition.name}`);
  }
}

/**
 * Checks that a value fits its field (null always does) and returns the value to store. `json` values
 * come back as a copy, so that the caller cannot change what is stored.
 */
export function checkFieldValue(definition: CollectionDef, field: string, value: unknown): unknown {
  if (value === null) return null;
  const type = definition.fields[field] as FieldType;

  const fine =
    (type === 'string' && typeof value === 'string') ||
    (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (type === 'boolean' && typeof value === 'boolean') ||
    (type === 'datetime' && isIsoDateTime(value)) ||
    (type === 'json' && jsonText(value) !== undefined);
  if (!fine)
    throw new StorageError('invalid-value', `the value of "${field}" is not a valid ${type}`);

  return type === 'json' ? JSON.parse(jsonText(value) as string) : value;
}

function jsonText(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- queries

/** One condition of a query: the field has to equal one of the values (null means empty). */
export interface WhereCondition {
  field: string;
  type: FieldType;
  values: Primitive[];
  /** True when it was written as `{ in: [...] }`. */
  many: boolean;
}

/** A query that was checked; the storage translates it to its own language. */
export interface CheckedQuery {
  where: WhereCondition[];
  /** The sorting the caller asked for. The storage adds `createdAt` and `id` after it. */
  orderBy: Array<{ field: string; descending: boolean }>;
  limit: number | undefined;
  offset: number | undefined;
  includeDeleted: boolean;
}

const QUERYABLE_BASE: Record<string, FieldType> = {
  id: 'string',
  createdAt: 'datetime',
  updatedAt: 'datetime',
  rev: 'number',
};

/** Checks a query against the collection (see `Query`). Throws `invalid-query` when it is not valid. */
export function checkQuery(definition: CollectionDef, query: Query): CheckedQuery {
  const bad = (message: string): never => {
    throw new StorageError('invalid-query', message);
  };
  const typeOf = (field: string): FieldType => {
    const type =
      QUERYABLE_BASE[field] ??
      (Object.hasOwn(definition.fields, field) ? definition.fields[field] : undefined);
    return type === undefined || type === 'json'
      ? bad(`"${field}" cannot be used in a query`)
      : type;
  };
  const fits = (type: FieldType, value: unknown): boolean =>
    value === null ||
    (type === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : type === 'boolean'
        ? typeof value === 'boolean'
        : typeof value === 'string');

  const where: WhereCondition[] = [];
  for (const [field, condition] of Object.entries(query.where ?? {})) {
    const type = typeOf(field);
    if (typeof condition === 'object' && condition !== null) {
      const list = (condition as { in?: unknown }).in;
      if (!Array.isArray(list) || !list.every((value) => fits(type, value)))
        bad(`"in" of "${field}" has to be a list of values of the right type`);
      where.push({ field, type, values: list as Primitive[], many: true });
    } else {
      if (!fits(type, condition)) bad(`the value for "${field}" is not a ${type}`);
      where.push({ field, type, values: [condition as Primitive], many: false });
    }
  }

  const orderBy = (query.orderBy ?? []).map(([field, direction]) => {
    typeOf(field);
    if (direction !== 'asc' && direction !== 'desc')
      bad(`the direction for "${field}" has to be "asc" or "desc"`);
    return { field, descending: direction === 'desc' };
  });

  const { limit, offset } = query;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0))
    bad('"limit" has to be a positive whole number');
  if (offset !== undefined && !(Number.isInteger(offset) && offset >= 0))
    bad('"offset" has to be a whole number, 0 or more');

  return { where, orderBy, limit, offset, includeDeleted: query.includeDeleted === true };
}
