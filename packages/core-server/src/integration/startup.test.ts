import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBlueprint } from '../blueprint';
import { performHandshake } from '../handshake';
import { ModuleHost } from '../host';
import { RouteRegistry } from '../http';
import { ModuleRegistry } from '../registry';
import { silentSink } from '../testing';

/**
 * The whole way from files on disk to running modules: mcrs.config.json and module.json files are
 * read, checked and planned, and the server parts are really imported and started.
 */

const folders: string[] = [];
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  (globalThis as unknown as { __mcrsCalls: string[] }).__mcrsCalls = calls;
});

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

type ModuleSpec = {
  requires?: string[];
  provides?: string[];
  parts?: string[];
  version?: string;
  register?: string;
};

const manifest = (id: string, spec: ModuleSpec) =>
  JSON.stringify({
    id,
    name: id,
    version: spec.version ?? '1.0.0',
    mcrs: '^1.0.0',
    parts: spec.parts ?? ['server'],
    provides: spec.provides,
    requires: spec.requires,
  });

/** The server part of a fake module: it writes into globalThis.__mcrsCalls and provides what it declares. */
const serverPart = (id: string, spec: ModuleSpec) => `
export default {
  register(ctx) {
    globalThis.__mcrsCalls.push('${id}.register');
    ${(spec.provides ?? []).map((name) => `ctx.capabilities.provide('${name}', {});`).join('\n    ')}
    ${spec.register ?? ''}
  },
  start() { globalThis.__mcrsCalls.push('${id}.start'); },
  stop() { globalThis.__mcrsCalls.push('${id}.stop'); },
};
`;

/** Writes a project with the given modules (in config order) and returns the path of its config. */
async function project(modules: Record<string, ModuleSpec>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mcrs-startup-'));
  folders.push(root);
  const write = async (name: string, content: string) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  await write(
    'mcrs.config.json',
    JSON.stringify({ modules: Object.keys(modules).map((id) => ({ id, path: `modules/${id}` })) }),
  );
  for (const [id, spec] of Object.entries(modules)) {
    await write(`modules/${id}/module.json`, manifest(id, spec));
    if ((spec.parts ?? ['server']).includes('server'))
      await write(`modules/${id}/server/index.mjs`, serverPart(id, spec));
  }
  return path.join(root, 'mcrs.config.json');
}

describe('from files to running modules', () => {
  it('starts the modules in dependency order, although the config lists them the other way round', async () => {
    const config = await project({
      orders: { requires: ['storage@1'] },
      storage: { provides: ['storage@1'] },
    });

    const { blueprint, errors } = await loadBlueprint(config);
    expect(errors).toEqual([]);
    const host = new ModuleHost(ModuleRegistry.fromBlueprint(blueprint!), {
      dataDir: '/data',
      sink: silentSink,
    });
    await host.start();
    await host.stop();

    expect(blueprint?.modules.map((module) => module.id)).toEqual(['orders', 'storage']);
    expect(calls).toEqual([
      'storage.register',
      'orders.register',
      'storage.start',
      'orders.start',
      'orders.stop',
      'storage.stop',
    ]);
  });

  it('stops the startup when a route has no access rule', async () => {
    const config = await project({
      shop: { register: "ctx.routes.add({ method: 'GET', path: '/menu', handler: () => {} });" },
    });
    const { blueprint } = await loadBlueprint(config);
    const host = new ModuleHost(ModuleRegistry.fromBlueprint(blueprint!), {
      dataDir: '/data',
      sink: silentSink,
      routes: new RouteRegistry({ auth: () => undefined }),
    });

    await expect(host.start()).rejects.toThrow(
      'module "shop" failed in register(): route GET /menu of module "shop": has no access rule',
    );
    expect(calls).toEqual(['shop.register']);
  });

  it('refuses to start when a module needs a capability that nobody provides', async () => {
    const config = await project({ orders: { requires: ['storage@1'] } });

    const { blueprint, errors } = await loadBlueprint(config);

    expect(blueprint).toBeNull();
    expect(errors).toContainEqual(expect.objectContaining({ path: 'requires[0]' }));
    expect(errors[0]?.message).toContain('"storage@1"');
    expect(calls).toEqual([]);
  });

  it('reports a missing capability, a duplicate provider and a cycle together', async () => {
    const config = await project({
      lonely: { requires: ['missing@1'] },
      sqlite: { provides: ['storage@1'] },
      postgres: { provides: ['storage@1'] },
      ping: { provides: ['ping@1'], requires: ['pong@1'] },
      pong: { provides: ['pong@1'], requires: ['ping@1'] },
    });

    const { blueprint, errors } = await loadBlueprint(config);
    const text = errors.map((error) => error.message).join('\n');

    expect(blueprint).toBeNull();
    expect(errors).toHaveLength(3);
    expect(text).toContain('"missing@1"');
    expect(text).toContain('"storage@1" is also provided by');
    expect(text).toContain('dependency cycle: ping -> pong -> ping');
  });

  it('gives the same fingerprints for the same modules in a different config order', async () => {
    const forward = await loadBlueprint(
      await project({
        a: { parts: ['server', 'client'] },
        b: { version: '2.0.0' },
        c: { parts: ['client'] },
      }),
    );
    const backward = await loadBlueprint(
      await project({
        c: { parts: ['client'] },
        b: { version: '2.0.0' },
        a: { parts: ['server', 'client'] },
      }),
    );

    const one = ModuleRegistry.fromBlueprint(forward.blueprint!);
    const two = ModuleRegistry.fromBlueprint(backward.blueprint!);

    expect(two.fingerprint).toBe(one.fingerprint);
    expect(two.clientFingerprint).toBe(one.clientFingerprint);
  });

  it('answers the handshake of a client that has the right modules, and of one that does not', async () => {
    const config = await project({
      storage: {},
      auth: { parts: ['server', 'client'] },
      catalog: { parts: ['client'], version: '1.2.0' },
    });
    const { blueprint } = await loadBlueprint(config);
    const registry = ModuleRegistry.fromBlueprint(blueprint!);

    const right = performHandshake(registry, 'block', {
      clientApi: '1',
      modules: [
        { id: 'auth', version: '1.0.0' },
        { id: 'catalog', version: '1.2.0' },
      ],
    });
    const old = performHandshake(registry, 'block', {
      clientApi: '1',
      modules: [
        { id: 'auth', version: '1.0.0' },
        { id: 'catalog', version: '1.1.0' },
      ],
    });

    expect(right.compatible).toBe(true);
    expect(old.compatible).toBe(false);
    expect(old.diff.versionMismatch).toEqual([{ id: 'catalog', server: '1.2.0', client: '1.1.0' }]);
  });
});
