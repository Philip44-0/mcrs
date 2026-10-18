const BRAND: unique symbol = Symbol.for('mcrs.apiError');

/**
 * An error that a route handler throws on purpose, and that the client gets to see:
 * `throw new ApiError(404, 'catalog.itemNotFound', 'There is no such item.', { id })`.
 * Everything else that a handler throws is answered with a general 500 error.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly [BRAND] = true;

  constructor(status: number, code: string, message: string, details?: unknown) {
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new RangeError(
        `the status of an ApiError has to be between 400 and 599, not ${String(status)}`,
      );
    }
    super(message);
    this.name = 'ApiError';
    this.status = status;
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

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
