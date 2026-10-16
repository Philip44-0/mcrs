import { describe, expect, it } from 'vitest';
import { createLogger, type LogSink } from '../common';
import { EventBus } from './event-bus';

function setup() {
  const errors: string[] = [];
  const sink: LogSink = {
    debug() {},
    info() {},
    warn() {},
    error: (_tag: unknown, message: unknown) => void errors.push(String(message)),
  };
  return { bus: new EventBus(createLogger('mcrs', sink)), errors };
}

const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('EventBus', () => {
  it('delivers asynchronously', async () => {
    const { bus } = setup();
    const received: unknown[] = [];
    bus.on('stock.changed', (payload) => void received.push(payload));

    bus.emit('stock.changed', { itemId: 'a' });
    expect(received).toEqual([]); // not yet: the sender is not held up
    await bus.idle();

    expect(received).toEqual([{ itemId: 'a' }]);
  });

  it('calls every listener, in the order they were added', async () => {
    const { bus } = setup();
    const calls: string[] = [];
    bus.on('stock.changed', () => void calls.push('first'));
    bus.on('stock.changed', () => void calls.push('second'));
    bus.on('other.thing.happened', () => void calls.push('other'));

    bus.emit('stock.changed');
    await bus.idle();

    expect(calls).toEqual(['first', 'second']);
  });

  it('logs a failing listener and ignores it', async () => {
    const { bus, errors } = setup();
    const calls: string[] = [];
    bus.on(
      'stock.changed',
      () => {
        throw new Error('sync boom');
      },
      'stock',
    );
    bus.on(
      'stock.changed',
      async () => {
        throw new Error('async boom');
      },
      'orders',
    );
    bus.on('stock.changed', () => void calls.push('still called'));

    expect(() => bus.emit('stock.changed')).not.toThrow();
    await bus.idle();

    expect(calls).toEqual(['still called']);
    expect(errors).toEqual([
      'listener of module "stock" for event "stock.changed" failed: sync boom',
      'listener of module "orders" for event "stock.changed" failed: async boom',
    ]);
  });

  it('can remove a listener again', async () => {
    const { bus } = setup();
    const calls: string[] = [];
    const remove = bus.on('stock.changed', () => void calls.push('called'));

    remove();
    bus.emit('stock.changed');
    await bus.idle();

    expect(calls).toEqual([]);
  });

  it('does nothing when nobody listens', async () => {
    const { bus } = setup();

    expect(() => bus.emit('stock.changed')).not.toThrow();
    await bus.idle();
  });

  it('rejects names that are not valid', () => {
    const { bus } = setup();

    expect(() => bus.on('Bad Name', () => {})).toThrow('is not valid');
    expect(() => bus.emit('nodots')).toThrow('is not valid');
  });

  it('waits in idle() for slow listeners', async () => {
    const { bus } = setup();
    let done = false;
    bus.on('stock.changed', async () => {
      await tick(30);
      done = true;
    });

    bus.emit('stock.changed');
    await bus.idle();

    expect(done).toBe(true);
  });
});

describe('EventBus outbox', () => {
  it('announces nothing until it is flushed', async () => {
    const { bus } = setup();
    const received: unknown[] = [];
    bus.on('orders.order.sent', (payload) => void received.push(payload));
    const outbox = bus.outbox();

    outbox.emit('orders.order.sent', { orderId: '1' });
    await tick();
    expect(received).toEqual([]);

    outbox.flush();
    await bus.idle();
    expect(received).toEqual([{ orderId: '1' }]);
  });

  it('drops everything when discarded', async () => {
    const { bus } = setup();
    const received: unknown[] = [];
    bus.on('orders.order.sent', (payload) => void received.push(payload));
    const outbox = bus.outbox();

    outbox.emit('orders.order.sent', 1);
    outbox.discard();
    outbox.flush();
    await bus.idle();

    expect(received).toEqual([]);
  });

  it('cannot be used after it was flushed', () => {
    const { bus } = setup();
    const outbox = bus.outbox();
    outbox.flush();

    expect(() => outbox.emit('orders.order.sent', 1)).toThrow('already flushed or discarded');
  });
});

describe('EventBus scoped to a module', () => {
  it('lets a module listen to any event and names it in the log when its listener fails', async () => {
    const { bus, errors } = setup();
    bus.scoped('stock').on('orders.order.sent', () => {
      throw new Error('boom');
    });

    bus.emit('orders.order.sent');
    await bus.idle();

    expect(errors).toEqual([
      'listener of module "stock" for event "orders.order.sent" failed: boom',
    ]);
  });

  it('lets a module emit only events that start with its own id', () => {
    const { bus } = setup();
    const stock = bus.scoped('stock');

    expect(() => stock.emit('stock.changed', { itemId: 'a', quantity: 1 })).not.toThrow();
    expect(() => stock.emit('orders.order.sent')).toThrow(
      'module "stock" cannot emit event "orders.order.sent"',
    );
    expect(() => stock.outbox().emit('orders.order.sent')).toThrow('cannot emit event');
  });

  it('knows the payload types of declared events at compile time', () => {
    const { bus } = setup();
    const stock = bus.scoped('stock');

    const neverCalled = () => {
      stock.on('stock.changed', (payload) => void payload.quantity);
      // @ts-expect-error itemId has to be a string
      stock.emit('stock.changed', { itemId: 1, quantity: 1 });
      stock.emit('stock.something.else', { anything: true }); // undeclared names accept any payload
    };

    expect(typeof neverCalled).toBe('function');
  });
});
