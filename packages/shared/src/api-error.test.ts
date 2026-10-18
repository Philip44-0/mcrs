import { describe, expect, it } from 'vitest';
import { ApiError, isApiError } from './api-error';

describe('ApiError', () => {
  it('carries status, code, message and details', () => {
    const error = new ApiError(404, 'catalog.itemNotFound', 'There is no such item.', { id: '7' });

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.code).toBe('catalog.itemNotFound');
    expect(error.message).toBe('There is no such item.');
    expect(error.details).toEqual({ id: '7' });
  });

  it('only accepts error statuses', () => {
    expect(() => new ApiError(200, 'x', 'x')).toThrow('between 400 and 599');
    expect(() => new ApiError(404.5, 'x', 'x')).toThrow('between 400 and 599');
    expect(() => new ApiError(600, 'x', 'x')).toThrow('between 400 and 599');
  });

  it('is recognised, also when it comes from another copy of the class', () => {
    const foreign = Object.assign(new Error('x'), {
      status: 400,
      [Symbol.for('mcrs.apiError')]: true,
    });

    expect(isApiError(new ApiError(400, 'a', 'b'))).toBe(true);
    expect(foreign instanceof ApiError).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(undefined)).toBe(false);
  });
});
