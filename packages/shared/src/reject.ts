const BRAND: unique symbol = Symbol.for('mcrs.reject');

/**
 * Thrown by a guard to refuse an action: `throw new Reject('stock.soldOut', { itemId })`.
 * The code is what the client gets to see; the details are for the code that handles it.
 */
export class Reject extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly [BRAND] = true;

  constructor(code: string, details?: unknown, message?: string) {
    super(message ?? code);
    this.name = 'Reject';
    this.code = code;
    this.details = details;
  }

  /**
   * Modules are loaded from outside the server bundle and can carry their own copy of this package,
   * so `instanceof Reject` must not depend on which copy of the class created the error.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<symbol, unknown>)[BRAND] === true
    );
  }
}

export function isReject(value: unknown): value is Reject {
  return value instanceof Reject;
}
