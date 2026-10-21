import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HandshakeResponse } from '@mcrs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import { createLogger, type LogSink } from '../common';
import { ModuleRegistry } from '../registry';
import { createHttpApp } from './app';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

function mod(id: string, parts: Array<'server' | 'client'> = ['server', 'client']): LoadedModule {
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version: '1.0.0', mcrs: '^1.0.0', parts },
    config: {},
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

async function start(policy: 'block' | 'warn' = 'block') {
  const registry = new ModuleRegistry();
  [mod('storage-sqlite', ['server']), mod('auth'), mod('catalog')].forEach((module) =>
    registry.register(module),
  );
  registry.freeze();

  const lines = { warn: [] as unknown[][], debug: [] as unknown[][] };
  const sink: LogSink = {
    debug: (...args: unknown[]) => void lines.debug.push(args),
    info() {},
    warn: (...args: unknown[]) => void lines.warn.push(args),
    error() {},
  };
  const http = createHttpApp({
    log: createLogger('http', sink),
    auth: () => undefined,
    core: { registry, mismatchPolicy: policy },
  });
  http.finish();

  const server = http.app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const handshake = (body: unknown) =>
    fetch(`${url}/api/_core/handshake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  return { registry, lines, url, handshake };
}

const good = {
  clientApi: '1',
  modules: [
    { id: 'auth', version: '1.0.0' },
    { id: 'catalog', version: '1.0.0' },
  ],
};

describe('health', () => {
  it('reports both fingerprints', async () => {
    const { url, registry } = await start();

    const body = (await (await fetch(`${url}/api/_core/health`)).json()) as Record<string, unknown>;

    expect(body).toEqual(
      expect.objectContaining({
        status: 'ok',
        fingerprint: registry.fingerprint,
        clientFingerprint: registry.clientFingerprint,
      }),
    );
  });
});

describe('handshake', () => {
  it('says "compatible" to a client that matches, without logging a warning', async () => {
    const { handshake, lines, registry } = await start();

    const response = await handshake(good);
    const body = (await response.json()) as HandshakeResponse;

    expect(response.status).toBe(200);
    expect(body.compatible).toBe(true);
    expect(body.server.fingerprint).toBe(registry.fingerprint);
    expect(body.diff).toEqual({ missingOnClient: [], missingOnServer: [], versionMismatch: [] });
    expect(lines.warn).toEqual([]);
  });

  it('answers a client that does not match with the diff and the policy, and logs a warning', async () => {
    const { handshake, lines } = await start('warn');

    const body = (await (
      await handshake({ clientApi: '1', modules: [{ id: 'auth', version: '1.0.0' }] })
    ).json()) as HandshakeResponse;

    expect(body.compatible).toBe(false);
    expect(body.policy).toBe('warn');
    expect(body.diff.missingOnClient).toEqual(['catalog@1.0.0']);
    expect(lines.warn).toHaveLength(1);
    expect(String(lines.warn[0]?.[1])).toContain('a client does not match the server'); // [tag, message, data]
    expect(lines.warn[0]?.[2]).toEqual(
      expect.objectContaining({
        clientClientFingerprint: body.client.clientFingerprint,
        serverClientFingerprint: body.server.clientFingerprint,
      }),
    );
  });

  it('reports the same mismatch only once as a warning', async () => {
    const { handshake, lines } = await start();
    const bad = { clientApi: '1', modules: [] };

    await (await handshake(bad)).text();
    await (await handshake(bad)).text();

    expect(lines.warn).toHaveLength(1);
    expect(lines.debug.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a request that is not valid, with the problems', async () => {
    const { handshake } = await start();

    const response = await handshake({ clientApi: 'one', modules: 'none' });
    const body = (await response.json()) as {
      error: { code: string; details: { problems: string[] } };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('handshake.invalid');
    expect(body.error.details.problems).toHaveLength(2);
  });

  it('does not need a login', async () => {
    const { handshake } = await start();

    expect((await handshake(good)).status).toBe(200);
  });

  it('never names the server-only modules', async () => {
    const { handshake } = await start();

    const text = await (await handshake({ clientApi: '1', modules: [] })).text();

    expect(text).not.toContain('storage-sqlite');
  });
});
