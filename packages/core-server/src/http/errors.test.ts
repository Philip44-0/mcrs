import { ApiError, Reject } from '@mcrs/shared';
import { describe, expect, it } from 'vitest';
import { describeError, errorBody } from './errors';

describe('describeError', () => {
  it('shows an ApiError as it is', () => {
    expect(
      describeError(
        new ApiError(404, 'catalog.itemNotFound', 'There is no such item.', { id: '7' }),
      ),
    ).toEqual({
      status: 404,
      code: 'catalog.itemNotFound',
      message: 'There is no such item.',
      details: { id: '7' },
      unexpected: false,
    });
  });

  it('answers a Reject with 409 and its code and details', () => {
    const info = describeError(new Reject('stock.soldOut', { itemId: 'schnitzel' }));

    expect(info).toEqual(
      expect.objectContaining({
        status: 409,
        code: 'stock.soldOut',
        details: { itemId: 'schnitzel' },
        unexpected: false,
      }),
    );
    expect(info.message).toBe('The action was refused.');
    expect(describeError(new Reject('stock.soldOut', undefined, 'Sold out.')).message).toBe(
      'Sold out.',
    );
  });

  it('knows the errors of the JSON body parser', () => {
    expect(
      describeError(Object.assign(new Error('x'), { type: 'entity.too.large', status: 413 })),
    ).toEqual(expect.objectContaining({ status: 413, code: 'request.tooLarge' }));
    expect(
      describeError(Object.assign(new Error('x'), { type: 'entity.parse.failed', status: 400 })),
    ).toEqual(expect.objectContaining({ status: 400, code: 'request.invalidJson' }));
    expect(describeError(Object.assign(new Error('x'), { type: 'charset.unsupported' }))).toEqual(
      expect.objectContaining({ status: 415, code: 'request.unsupported' }),
    );
  });

  it('turns other client errors of Express into request.invalid', () => {
    expect(
      describeError(Object.assign(new Error('Failed to decode param'), { status: 400 })),
    ).toEqual(expect.objectContaining({ status: 400, code: 'request.invalid', unexpected: false }));
  });

  it('hides everything about errors nobody planned for', () => {
    const info = describeError(new Error('password is hunter2'));

    expect(info).toEqual({
      status: 500,
      code: 'server.internalError',
      message: 'Something went wrong on the server.',
      unexpected: true,
    });
    expect(describeError('a string')).toEqual(
      expect.objectContaining({ status: 500, unexpected: true }),
    );
    expect(describeError(Object.assign(new Error('x'), { status: 503 }))).toEqual(
      expect.objectContaining({ status: 500, unexpected: true }),
    );
  });
});

describe('errorBody', () => {
  it('always has the same shape', () => {
    expect(errorBody({ status: 404, code: 'a.b', message: 'm', unexpected: false }, 'rid')).toEqual(
      {
        error: { code: 'a.b', message: 'm', requestId: 'rid' },
      },
    );
    expect(
      errorBody({ status: 409, code: 'a.b', message: 'm', details: { x: 1 }, unexpected: false }),
    ).toEqual({
      error: { code: 'a.b', message: 'm', details: { x: 1 } },
    });
  });
});
