import { describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import type { ModuleContext, ServerModule } from '../module-api';
import { ModuleError, ModuleHost, type HostOptions } from './host';
import type { LogSink } from '../common';
import { ModuleRegistry } from '../registry';

type Deps = {
  provides?: Array<string | { name: string; multi?: boolean }>;
  requires?: string[];
  optional?: string[];
  parts?: Array<'server' | 'client'>;
  config?: Record<string, unknown>;
};

function mod(id: string, deps: Deps = {}): LoadedModule {
  const { config = {}, parts = ['server'], ...rest } = deps;
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version: '1.0.0', mcrs: '^1.0.0', parts, ...rest },
    config,
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

const silent: LogSink = { debug() {}, info() {}, warn() {}, error() {} };

/** The modules are registered in the given order, which is the start order. */
function host(
  modules: LoadedModule[],
  implementations: Record<string, ServerModule>,
  options: Partial<HostOptions> = {},
) {
  const registry = new ModuleRegistry();
  modules.forEach((module) => registry.register(module));
  registry.freeze();
  return new ModuleHost(registry, {
    dataDir: '/data',
    sink: silent,
    load: async (module) => implementations[module.id] ?? null,
    ...options,
  });
}

/** A module that writes what happens to it into `calls`. */
function recording(
  calls: string[],
  id: string,
  overrides: Partial<ServerModule> = {},
): ServerModule {
  return {
    register: () => {
      calls.push(`${id}.register`);
    },
    start: () => {
      calls.push(`${id}.start`);
    },
    stop: () => {
      calls.push(`${id}.stop`);
    },
    ...overrides,
  };
}

const fail = (message: string) => () => {
  throw new Error(message);
};

describe('ModuleHost lifecycle', () => {
  it('registers in order, then migrates, then starts', async () => {
    const calls: string[] = [];
    const h = host(
      [mod('a'), mod('b')],
      { a: recording(calls, 'a'), b: recording(calls, 'b') },
      {
        migrate: () => {
          calls.push('migrate');
        },
      },
    );

    await h.start();

    expect(calls).toEqual(['a.register', 'b.register', 'migrate', 'a.start', 'b.start']);
  });

  it('stops in reverse order', async () => {
    const calls: string[] = [];
    const h = host([mod('a'), mod('b'), mod('c')], {
      a: recording(calls, 'a'),
      b: recording(calls, 'b'),
      c: recording(calls, 'c'),
    });
    await h.start();
    calls.length = 0;

    const errors = await h.stop();

    expect(errors).toEqual([]);
    expect(calls).toEqual(['c.stop', 'b.stop', 'a.stop']);
  });

  it('works with modules that have no start() and no stop()', async () => {
    const h = host([mod('a')], { a: { register: () => {} } });

    await h.start();

    expect(await h.stop()).toEqual([]);
  });

  it('skips modules without a server part', async () => {
    const loaded: string[] = [];
    const h = host(
      [mod('a'), mod('theme', { parts: ['client'] })],
      { a: { register: () => {} } },
      {
        load: async (module) => {
          loaded.push(module.id);
          return { register: () => {} };
        },
      },
    );

    await h.start();

    expect(loaded).toEqual(['a']);
  });

  it('can only be started once', async () => {
    const h = host([mod('a')], { a: { register: () => {} } });
    await h.start();

    await expect(h.start()).rejects.toThrow('the host is running');
  });

  it('stops safely when it never started, and stopping twice does nothing more', async () => {
    const calls: string[] = [];
    const never = host([mod('a')], { a: recording(calls, 'a') });
    expect(await never.stop()).toEqual([]);

    const h = host([mod('a')], { a: recording(calls, 'a') });
    await h.start();
    await h.stop();
    await h.stop();

    expect(calls.filter((call) => call === 'a.stop')).toHaveLength(1);
  });
});

describe('ModuleHost errors', () => {
  it('names the module when register() fails, and starts nothing', async () => {
    const calls: string[] = [];
    const h = host([mod('a'), mod('b'), mod('c')], {
      a: recording(calls, 'a'),
      b: recording(calls, 'b', { register: fail('boom') }),
      c: recording(calls, 'c'),
    });

    const error = await h.start().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ModuleError);
    expect((error as ModuleError).message).toBe('module "b" failed in register(): boom');
    expect((error as ModuleError).moduleId).toBe('b');
    expect((error as ModuleError).phase).toBe('register');
    expect(calls).toEqual(['a.register']);
  });

  it('names the module when it cannot be loaded, before anything is registered', async () => {
    const calls: string[] = [];
    const implementations = { a: recording(calls, 'a'), b: recording(calls, 'b') };
    const h = host([mod('a'), mod('b')], implementations, {
      load: async (module) => {
        if (module.id === 'b') throw new Error('no server entry');
        return implementations.a;
      },
    });

    await expect(h.start()).rejects.toThrow('module "b" could not be loaded: no server entry');
    expect(calls).toEqual([]);
  });

  it('stops the modules that already started when start() fails', async () => {
    const calls: string[] = [];
    const h = host([mod('a'), mod('b'), mod('c')], {
      a: recording(calls, 'a'),
      b: recording(calls, 'b'),
      c: recording(calls, 'c', { start: fail('no port') }),
    });

    await expect(h.start()).rejects.toThrow('module "c" failed in start(): no port');

    expect(calls).toEqual([
      'a.register',
      'b.register',
      'c.register',
      'a.start',
      'b.start',
      'b.stop',
      'a.stop',
    ]);
  });

  it('aborts when the migrations fail', async () => {
    const calls: string[] = [];
    const h = host([mod('a')], { a: recording(calls, 'a') }, { migrate: fail('disk full') });

    await expect(h.start()).rejects.toThrow('the migrations failed: disk full');
    expect(calls).toEqual(['a.register']);
  });

  it('keeps stopping when one module fails to stop, and reports it', async () => {
    const calls: string[] = [];
    const h = host([mod('a'), mod('b')], {
      a: recording(calls, 'a'),
      b: recording(calls, 'b', { stop: fail('stuck') }),
    });
    await h.start();
    calls.length = 0;

    const errors = await h.stop();

    expect(calls).toEqual(['a.stop']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('module "b" failed in stop(): stuck');
  });

  it('does not wait forever for a module that does not stop', async () => {
    const h = host(
      [mod('a')],
      { a: { register: () => {}, stop: () => new Promise<void>(() => {}) } },
      { stopTimeoutMs: 20 },
    );
    await h.start();

    const errors = await h.stop();

    expect(errors[0]?.message).toContain('did not stop within 20 ms');
  });
});

describe('ModuleHost context', () => {
  it('gives each module its id, config, data directory and a log with its name', async () => {
    const lines: unknown[][] = [];
    const sink: LogSink = { ...silent, info: (...args: unknown[]) => void lines.push(args) };
    let seen: ModuleContext | undefined;
    const h = host(
      [mod('a', { config: { retries: 3 } })],
      { a: { register: (context) => void (seen = context) } },
      { sink },
    );

    await h.start();
    seen?.log.info('hello', 42);

    expect(seen?.id).toBe('a');
    expect(seen?.config).toEqual({ retries: 3 });
    expect(seen?.dataDir).toBe('/data');
    expect(Object.isFrozen(seen)).toBe(true);
    expect(lines).toContainEqual(['[a]', 'hello', 42]);
  });

  it('says which issue completes the routes', async () => {
    const h = host([mod('a')], {
      a: {
        register: (context) =>
          context.routes.add({ method: 'GET', path: '/x', access: 'public', handler: () => {} }),
      },
    });

    await expect(h.start()).rejects.toThrow(
      'module "a" failed in register(): ctx.routes is not available yet',
    );
  });
});

describe('ModuleHost events and hooks', () => {
  it('delivers events between modules', async () => {
    const received: unknown[] = [];
    const h = host([mod('shop'), mod('stock')], {
      shop: {
        register: (context) =>
          void context.events.on('stock.changed', (payload) => void received.push(payload)),
      },
      stock: {
        register: () => {},
        start: (context) =>
          context.events.emit('stock.changed', { itemId: 'schnitzel', quantity: 3 }),
      },
    });

    await h.start();
    await h.events.idle();

    expect(received).toEqual([{ itemId: 'schnitzel', quantity: 3 }]);
  });

  it('lets running listeners finish before the modules are stopped', async () => {
    const calls: string[] = [];
    const h = host([mod('a')], {
      a: {
        register: (context) =>
          void context.events.on('a.thing.happened', async () => {
            await new Promise((resolve) => setTimeout(resolve, 30));
            calls.push('listener done');
          }),
        start: (context) => context.events.emit('a.thing.happened'),
        stop: () => void calls.push('a.stop'),
      },
    });
    await h.start();

    await h.stop();

    expect(calls).toEqual(['listener done', 'a.stop']);
  });

  it('gives modules guards and filters for their own names', async () => {
    let result: unknown;
    const h = host([mod('catalog'), mod('stock')], {
      stock: {
        register: (context) =>
          void context.hooks.filter('catalog.items.list', (items) =>
            items.map((item) => ({ ...item, available: false })),
          ),
      },
      catalog: {
        register: () => {},
        start: (context) =>
          void (result = context.hooks.applyFilters('catalog.items.list', [
            { id: '1', name: 'Soup', available: true },
          ])),
      },
    });

    await h.start();

    expect(result).toEqual([{ id: '1', name: 'Soup', available: false }]);
  });

  it('refuses a module that emits an event of another module', async () => {
    const h = host([mod('stock')], {
      stock: { register: (context) => context.events.emit('orders.order.sent', { orderId: '1' }) },
    });

    await expect(h.start()).rejects.toThrow('module "stock" cannot emit event "orders.order.sent"');
  });
});

describe('ModuleHost capabilities', () => {
  it('lets a module use what an earlier module provided', async () => {
    let received: unknown;
    const h = host(
      [mod('storage', { provides: ['storage@1'] }), mod('catalog', { requires: ['storage@1'] })],
      {
        storage: {
          register: (context) => context.capabilities.provide('storage@1', { kind: 'sqlite' }),
        },
        catalog: { register: (context) => void (received = context.capabilities.get('storage@1')) },
      },
    );

    await h.start();

    expect(received).toEqual({ kind: 'sqlite' });
  });

  it('also works in start()', async () => {
    let received: unknown;
    const h = host(
      [mod('storage', { provides: ['storage@1'] }), mod('catalog', { requires: ['storage@1'] })],
      {
        storage: { register: (context) => context.capabilities.provide('storage@1', 'impl') },
        catalog: {
          register: () => {},
          start: (context) => void (received = context.capabilities.get('storage@1')),
        },
      },
    );

    await h.start();

    expect(received).toBe('impl');
  });

  it('refuses a capability the module did not declare', async () => {
    const h = host([mod('a')], {
      a: { register: (context) => context.capabilities.provide('x@1', 1) },
    });

    await expect(h.start()).rejects.toThrow(
      'module "a" failed in register(): module "a" provides "x@1" but does not declare it',
    );
  });

  it('refuses to provide outside register()', async () => {
    const h = host([mod('a', { provides: ['x@1'] })], {
      a: {
        register: (context) => context.capabilities.provide('x@1', 1),
        start: (context) => context.capabilities.provide('x@1', 2),
      },
    });

    await expect(h.start()).rejects.toThrow('module "a" failed in start()');
  });

  it('notices a declared capability that was never provided', async () => {
    const h = host([mod('a', { provides: ['x@1'] })], { a: { register: () => {} } });

    await expect(h.start()).rejects.toThrow(
      'declares that it provides "x@1", but did not call capabilities.provide()',
    );
  });

  it('refuses get() for something that is not listed in requires', async () => {
    const h = host([mod('a', { optional: ['x@1'] })], {
      a: { register: (context) => void context.capabilities.get('x@1') },
    });

    await expect(h.start()).rejects.toThrow('does not list it in "requires"');
  });

  it('returns undefined from tryGet() for an optional capability that nobody provides', async () => {
    let received: unknown = 'unset';
    const h = host([mod('a', { optional: ['x@1'] })], {
      a: { register: (context) => void (received = context.capabilities.tryGet('x@1')) },
    });

    await h.start();

    expect(received).toBeUndefined();
  });

  it('collects the providers of a multi capability with getAll()', async () => {
    const target = { name: 'output.target@1', multi: true };
    let received: unknown;
    const h = host(
      [
        mod('printer', { provides: [target] }),
        mod('display', { provides: [target] }),
        mod('output', { requires: ['output.target@1'] }),
      ],
      {
        printer: {
          register: (context) => context.capabilities.provide('output.target@1', 'printer'),
        },
        display: {
          register: (context) => context.capabilities.provide('output.target@1', 'display'),
        },
        output: {
          register: (context) => void (received = context.capabilities.getAll('output.target@1')),
        },
      },
    );

    await h.start();

    expect(received).toEqual(['printer', 'display']);
  });

  it('points to getAll() when get() meets several providers', async () => {
    const target = { name: 'output.target@1', multi: true };
    const h = host(
      [
        mod('printer', { provides: [target] }),
        mod('display', { provides: [target] }),
        mod('output', { requires: ['output.target@1'] }),
      ],
      {
        printer: { register: (context) => context.capabilities.provide('output.target@1', 1) },
        display: { register: (context) => context.capabilities.provide('output.target@1', 2) },
        output: { register: (context) => void context.capabilities.get('output.target@1') },
      },
    );

    await expect(h.start()).rejects.toThrow('use getAll()');
  });
});
