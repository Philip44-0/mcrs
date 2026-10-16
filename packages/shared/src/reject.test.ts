import { describe, expect, it } from 'vitest';
import { isReject, Reject } from './reject';

describe('Reject', () => {
  it('carries a code and details', () => {
    const reject = new Reject('stock.soldOut', { itemId: 'schnitzel' });

    expect(reject).toBeInstanceOf(Error);
    expect(reject.code).toBe('stock.soldOut');
    expect(reject.details).toEqual({ itemId: 'schnitzel' });
    expect(reject.message).toBe('stock.soldOut');
  });

  it('is recognised as a Reject', () => {
    expect(isReject(new Reject('x'))).toBe(true);
    expect(isReject(new Error('x'))).toBe(false);
    expect(isReject(null)).toBe(false);
    expect(isReject('x')).toBe(false);
  });

  it('is recognised when it was created by another copy of the class', () => {
    const foreign = Object.assign(new Error('from another copy'), {
      code: 'x',
      [Symbol.for('mcrs.reject')]: true,
    });

    expect(foreign instanceof Reject).toBe(true);
  });

  it('is recognised in subclasses', () => {
    class OutOfStock extends Reject {}

    expect(new OutOfStock('stock.soldOut') instanceof Reject).toBe(true);
  });
});
