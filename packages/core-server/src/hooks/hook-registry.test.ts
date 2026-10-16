import { Reject } from '@mcrs/shared';
import { describe, expect, it } from 'vitest';
import { createLogger, type LogSink } from '../common';
import { HookError, HookRegistry } from './hook-registry';

function setup() {
  const errors: string[] = [];
  const sink: LogSink = {
    debug() {},
    info() {},
    warn() {},
    error: (_tag: unknown, message: unknown) => void errors.push(String(message)),
  };
  return { hooks: new HookRegistry(createLogger('mcrs', sink)), errors };
}

const caught = async (action: () => Promise<unknown>): Promise<unknown> => {
  try {
    await action();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('guards', () => {
  it('run in priority order, lower numbers first, then in registration order', async () => {
    const { hooks } = setup();
    const calls: string[] = [];
    hooks.addGuard('orders.order.sending', () => void calls.push('default'));
    hooks.addGuard('orders.order.sending', () => void calls.push('late'), { priority: 200 });
    hooks.addGuard('orders.order.sending', () => void calls.push('early'), { priority: 10 });
    hooks.addGuard('orders.order.sending', () => void calls.push('default 2'));

    await hooks.runGuards('orders.order.sending');

    expect(calls).toEqual(['early', 'default', 'default 2', 'late']);
  });

  it('get the payload and the transaction, and are awaited one after the other', async () => {
    const { hooks } = setup();
    const seen: unknown[] = [];
    hooks.addGuard('orders.order.sending', async (payload, transaction) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      seen.push(['first', payload, transaction]);
    });
    hooks.addGuard(
      'orders.order.sending',
      (payload, transaction) => void seen.push(['second', payload, transaction]),
    );

    await hooks.runGuards('orders.order.sending', { orderId: '1' }, 'tx');

    expect(seen).toEqual([
      ['first', { orderId: '1' }, 'tx'],
      ['second', { orderId: '1' }, 'tx'],
    ]);
  });

  it('abort the action with the code and details of a Reject, and skip the guards after it', async () => {
    const { hooks } = setup();
    const calls: string[] = [];
    hooks.addGuard(
      'orders.order.sending',
      () => {
        throw new Reject('stock.soldOut', { itemId: 'schnitzel' });
      },
      { priority: 1 },
    );
    hooks.addGuard('orders.order.sending', () => void calls.push('never'));

    const error = await caught(() => hooks.runGuards('orders.order.sending'));

    expect(error instanceof Reject).toBe(true);
    expect((error as Reject).code).toBe('stock.soldOut');
    expect((error as Reject).details).toEqual({ itemId: 'schnitzel' });
    expect(calls).toEqual([]);
  });

  it('also recognise a Reject that was created by another copy of the class', async () => {
    const { hooks } = setup();
    const foreign = Object.assign(new Error('x'), {
      code: 'other.copy',
      [Symbol.for('mcrs.reject')]: true,
    });
    hooks.addGuard('orders.order.sending', () => {
      throw foreign;
    });

    const error = await caught(() => hooks.runGuards('orders.order.sending'));

    expect(error).toBe(foreign);
  });

  it('abort with a HookError that names the module when a guard breaks', async () => {
    const { hooks } = setup();
    hooks.addGuard(
      'orders.order.sending',
      () => {
        throw new Error('bug');
      },
      {},
      'stock',
    );

    const error = await caught(() => hooks.runGuards('orders.order.sending'));

    expect(error).toBeInstanceOf(HookError);
    expect((error as HookError).message).toBe(
      'guard "orders.order.sending" of module "stock" failed: bug',
    );
  });

  it('can be removed again', async () => {
    const { hooks } = setup();
    const calls: string[] = [];
    const remove = hooks.addGuard('orders.order.sending', () => void calls.push('called'));

    remove();
    await hooks.runGuards('orders.order.sending');

    expect(calls).toEqual([]);
  });

  it('do nothing when there are none', async () => {
    const { hooks } = setup();

    await hooks.runGuards('orders.order.sending');
  });
});

describe('filters', () => {
  it('pass the value through, in priority order', () => {
    const { hooks } = setup();
    hooks.addFilter('catalog.items.list', (value) => `${String(value)}b`);
    hooks.addFilter('catalog.items.list', (value) => `${String(value)}a`, { priority: 1 });

    expect(hooks.applyFilters('catalog.items.list', '>')).toBe('>ab');
  });

  it('get the extra context', () => {
    const { hooks } = setup();
    hooks.addFilter('catalog.items.list', (value, request) => `${String(value)}${String(request)}`);

    expect(hooks.applyFilters('catalog.items.list', 'x', 'request')).toBe('xrequest');
  });

  it('keep the unfiltered value when a filter throws, and log it', () => {
    const { hooks, errors } = setup();
    hooks.addFilter('catalog.items.list', (value) => `${String(value)}1`, { priority: 1 });
    hooks.addFilter(
      'catalog.items.list',
      () => {
        throw new Error('bug');
      },
      { priority: 2 },
      'stock',
    );
    hooks.addFilter('catalog.items.list', (value) => `${String(value)}3`, { priority: 3 });

    expect(hooks.applyFilters('catalog.items.list', '>')).toBe('>13');
    expect(errors).toEqual(['filter "catalog.items.list" of module "stock" failed: bug']);
  });

  it('ignore a filter that returns a promise, and log it', () => {
    const { hooks, errors } = setup();
    hooks.addFilter('catalog.items.list', async () => 'changed', {}, 'stock');

    expect(hooks.applyFilters('catalog.items.list', 'original')).toBe('original');
    expect(errors[0]).toContain('have to be synchronous');
  });

  it('return the value unchanged when there are none', () => {
    const { hooks } = setup();

    expect(hooks.applyFilters('catalog.items.list', 42)).toBe(42);
  });
});

describe('hook rules', () => {
  it('reject a priority that is not a number', () => {
    const { hooks } = setup();

    expect(() =>
      hooks.addGuard('orders.order.sending', () => {}, { priority: Number.NaN }),
    ).toThrow('has to be a number');
  });

  it('reject names that are not valid', () => {
    const { hooks } = setup();

    expect(() => hooks.addFilter('Bad Name', (value) => value)).toThrow('is not valid');
  });

  it('let a module add guards and filters anywhere, but run only its own', async () => {
    const { hooks } = setup();
    const stock = hooks.scoped('stock');

    expect(() => stock.guard('orders.order.sending', () => {})).not.toThrow();
    expect(() => stock.filter('catalog.items.list', (items) => items)).not.toThrow();
    await expect(
      stock.runGuards('orders.order.sending', { orderId: '1', tableId: 't', lines: [] }),
    ).rejects.toThrow('module "stock" cannot run guard "orders.order.sending"');
    expect(() => stock.applyFilters('catalog.items.list', [])).toThrow(
      'module "stock" cannot apply filter',
    );
  });

  it('let a module run the guards of its own actions', async () => {
    const { hooks } = setup();
    const calls: string[] = [];
    hooks.addGuard('orders.order.sending', () => void calls.push('guard'));

    await hooks
      .scoped('orders')
      .runGuards('orders.order.sending', { orderId: '1', tableId: 't', lines: [] });

    expect(calls).toEqual(['guard']);
  });
});
