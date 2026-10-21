import { Reject } from '@mcrs/shared';
import { describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import { HookError } from '../hooks';
import { ModuleHost } from '../host';
import { clientModulesOf, performHandshake } from '../handshake';
import { RouteRegistry } from '../http';
import type { ServerModule } from '../module-api';
import { planModules } from '../plan';
import { ModuleRegistry } from '../registry';
import { FakeStore, fakeModule, silentSink, type FakeTransaction } from '../testing';

/** Plans the modules, registers them in start order and freezes the registry. */
function registryFor(modules: LoadedModule[]): ModuleRegistry {
  const plan = planModules(modules);
  expect(plan.errors).toEqual([]);
  const registry = new ModuleRegistry();
  plan.order.forEach((module) => registry.register(module));
  return registry.freeze();
}

function hostFor(
  registry: ModuleRegistry,
  implementations: Record<string, ServerModule>,
  routes?: RouteRegistry,
) {
  return new ModuleHost(registry, {
    dataDir: '/data',
    sink: silentSink,
    load: async (module) => implementations[module.id] ?? null,
    routes,
  });
}

describe('starting and stopping an installation', () => {
  /** A module that records what happens to it and provides the capabilities it declares. */
  const providing = (calls: string[], id: string, ...capabilities: string[]): ServerModule => ({
    register: (context) => {
      calls.push(`${id}.register`);
      capabilities.forEach((capability) => context.capabilities.provide(capability, {}));
    },
    start: () => void calls.push(`${id}.start`),
    stop: () => void calls.push(`${id}.stop`),
  });

  it('starts providers before the modules that need them, whatever the config order, and stops in reverse', async () => {
    const calls: string[] = [];
    const modules = [
      fakeModule('orders', { requires: ['storage@1', 'catalog@1'], provides: ['orders@1'] }),
      fakeModule('catalog', { requires: ['storage@1'], provides: ['catalog@1'] }),
      fakeModule('storage', { provides: ['storage@1'] }),
    ];
    const host = hostFor(registryFor(modules), {
      orders: providing(calls, 'orders', 'orders@1'),
      catalog: providing(calls, 'catalog', 'catalog@1'),
      storage: providing(calls, 'storage', 'storage@1'),
    });

    await host.start();
    await host.stop();

    expect(calls).toEqual([
      'storage.register',
      'catalog.register',
      'orders.register',
      'storage.start',
      'catalog.start',
      'orders.start',
      'orders.stop',
      'catalog.stop',
      'storage.stop',
    ]);
  });

  it('has the same fingerprints for any order of the modules', () => {
    const modules = () => [
      fakeModule('storage', { provides: ['storage@1'], parts: ['server'] }),
      fakeModule('auth', { parts: ['server', 'client'] }),
      fakeModule('catalog', { version: '1.2.0', parts: ['server', 'client'] }),
    ];

    const forward = registryFor(modules());
    const backward = registryFor(modules().reverse());

    expect(backward.fingerprint).toBe(forward.fingerprint);
    expect(backward.clientFingerprint).toBe(forward.clientFingerprint);
  });

  it('stops the startup when a route has no access rule, and starts no module', async () => {
    const calls: string[] = [];
    const routes = new RouteRegistry({ auth: () => undefined });
    const modules = [fakeModule('good'), fakeModule('bad')];
    const host = hostFor(
      registryFor(modules),
      {
        good: providing(calls, 'good'),
        bad: {
          register: (context) =>
            context.routes.add({ method: 'GET', path: '/oops', handler: () => {} } as never),
          start: () => void calls.push('bad.start'),
        },
      },
      routes,
    );

    const error = await host.start().catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('module "bad" failed in register()');
    expect((error as Error).message).toContain(
      'route GET /oops of module "bad": has no access rule',
    );
    expect(calls).toEqual(['good.register']); // nobody was started
  });

  it('starts a module whose routes all have an access rule', async () => {
    const routes = new RouteRegistry({ auth: () => undefined });
    const host = hostFor(
      registryFor([fakeModule('shop')]),
      {
        shop: {
          register: (context) => {
            context.routes.add({
              method: 'GET',
              path: '/menu',
              access: 'public',
              handler: () => {},
            });
            context.routes.add({
              method: 'POST',
              path: '/menu',
              access: { roles: ['admin'] },
              handler: () => {},
            });
          },
        },
      },
      routes,
    );

    await expect(host.start()).resolves.toBeUndefined();
  });
});

describe('a failing guard rolls everything back', () => {
  type OrdersApi = {
    send(order: {
      orderId: string;
      tableId: string;
      lines: Array<{ itemId: string; qty: number }>;
    }): Promise<void>;
  };

  /** orders (sends), stock (reserves, priority 10), limits (refuses big orders, priority 20), audit (listens). */
  async function shop(options: { stock?: number; buggyGuard?: boolean } = {}) {
    const store = new FakeStore();
    store.seed('stock', options.stock ?? 10);
    const heard: Array<{ orderId: string; storedAlready: boolean }> = [];

    const modules = [
      fakeModule('storage', { provides: ['storage@1'] }),
      fakeModule('orders', { requires: ['storage@1'], provides: ['orders@1'] }),
      fakeModule('stock', { requires: ['storage@1'] }),
      fakeModule('limits'),
      fakeModule('audit', { requires: ['storage@1'] }),
      ...(options.buggyGuard ? [fakeModule('buggy')] : []),
    ];

    const implementations: Record<string, ServerModule> = {
      storage: { register: (context) => context.capabilities.provide('storage@1', store) },
      orders: {
        register: (context) => {
          const db = context.capabilities.get<FakeStore>('storage@1');
          context.capabilities.provide<OrdersApi>('orders@1', {
            send: async (order) => {
              const outbox = context.events.outbox();
              await db.transaction(async (transaction) => {
                transaction.set(`order:${order.orderId}`, order);
                outbox.emit('orders.order.sent', order); // collected, announced only after the commit
                await context.hooks.runGuards('orders.order.sending', order, transaction);
              });
              outbox.flush();
            },
          });
        },
      },
      stock: {
        register: (context) =>
          void context.hooks.guard(
            'orders.order.sending',
            (order, transaction) => {
              const wanted = order.lines.reduce((sum, line) => sum + line.qty, 0);
              const left = store.get('stock') as number;
              if (left < wanted) throw new Reject('stock.soldOut', { left });
              (transaction as FakeTransaction).set('stock', left - wanted);
            },
            { priority: 10 },
          ),
      },
      limits: {
        register: (context) =>
          void context.hooks.guard(
            'orders.order.sending',
            (order) => {
              if (order.lines.some((line) => line.qty > 5))
                throw new Reject('limits.tooMany', { max: 5 });
            },
            { priority: 20 },
          ),
      },
      audit: {
        register: (context) => {
          const db = context.capabilities.get<FakeStore>('storage@1');
          context.events.on('orders.order.sent', (order) => {
            const { orderId } = order as { orderId: string };
            heard.push({ orderId, storedAlready: db.get(`order:${orderId}`) !== undefined });
          });
        },
      },
      buggy: {
        register: (context) =>
          void context.hooks.guard(
            'orders.order.sending',
            () => {
              throw new Error('bug in a guard');
            },
            { priority: 30 },
          ),
      },
    };

    const host = hostFor(registryFor(modules), implementations);
    await host.start();
    return { host, store, heard, orders: host.findCapability<OrdersApi>('orders@1') as OrdersApi };
  }

  const order = (qty: number) => ({
    orderId: 'o1',
    tableId: 'b3',
    lines: [{ itemId: 'schnitzel', qty }],
  });

  it('commits the order, reserves the stock and announces it only after the commit', async () => {
    const { host, store, heard, orders } = await shop();

    await orders.send(order(2));
    await host.events.idle();

    expect(store.snapshot()).toEqual({ stock: 8, 'order:o1': order(2) });
    expect(heard).toEqual([{ orderId: 'o1', storedAlready: true }]);
  });

  it('undoes the order and the reservation of an earlier guard when a later guard refuses', async () => {
    const { host, store, heard, orders } = await shop();

    const error = await orders.send(order(6)).catch((caught: unknown) => caught); // the stock guard (10) reserves, then limits (20) refuses
    await host.events.idle();

    expect(error).toBeInstanceOf(Reject);
    expect((error as Reject).code).toBe('limits.tooMany');
    expect((error as Reject).details).toEqual({ max: 5 });
    expect(store.snapshot()).toEqual({ stock: 10 }); // nothing of the order is left, the stock is back
    expect(heard).toEqual([]); // the event that was collected before the refusal is never announced
  });

  it('refuses when the stock is not enough, and changes nothing', async () => {
    const { host, store, heard, orders } = await shop({ stock: 1 });

    const error = await orders.send(order(2)).catch((caught: unknown) => caught);
    await host.events.idle();

    expect((error as Reject).code).toBe('stock.soldOut');
    expect(store.snapshot()).toEqual({ stock: 1 });
    expect(heard).toEqual([]);
  });

  it('also rolls back when a guard is broken, and names the module', async () => {
    const { host, store, heard, orders } = await shop({ buggyGuard: true });

    const error = await orders.send(order(2)).catch((caught: unknown) => caught);
    await host.events.idle();

    expect(error).toBeInstanceOf(HookError);
    expect((error as HookError).message).toBe(
      'guard "orders.order.sending" of module "buggy" failed: bug in a guard',
    );
    expect(store.snapshot()).toEqual({ stock: 10 });
    expect(heard).toEqual([]);
  });

  it('lets the next order through after a refused one', async () => {
    const { host, store, orders } = await shop();
    await orders.send(order(6)).catch(() => undefined);

    await orders.send({ ...order(2), orderId: 'o2' });
    await host.events.idle();

    expect(store.snapshot()).toEqual({ stock: 8, 'order:o2': { ...order(2), orderId: 'o2' } });
  });
});

describe('clients and servers', () => {
  const registry = () =>
    registryFor([
      fakeModule('storage', { provides: ['storage@1'] }),
      fakeModule('auth', { parts: ['server', 'client'] }),
      fakeModule('catalog', { version: '1.2.0', parts: ['server', 'client'] }),
    ]);

  it('says "compatible" to a client built from the same modules, in any order', () => {
    const server = registry();
    const built = [...clientModulesOf(server)].reverse();

    expect(performHandshake(server, 'block', { clientApi: '1', modules: built }).compatible).toBe(
      true,
    );
  });

  it('points out the modules of an older client build', () => {
    const server = registry();

    const result = performHandshake(server, 'block', {
      clientApi: '1',
      modules: [
        { id: 'auth', version: '1.0.0' },
        { id: 'catalog', version: '1.1.0' },
      ],
    });

    expect(result.compatible).toBe(false);
    expect(result.diff.versionMismatch).toEqual([
      { id: 'catalog', server: '1.2.0', client: '1.1.0' },
    ]);
  });
});
