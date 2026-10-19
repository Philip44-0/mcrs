import { computeFingerprints, fingerprintOf } from '@mcrs/shared';
import { describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import { CORE_API_MAJOR } from '../common';
import { ModuleRegistry } from '../registry';
import { compareModules, isSame } from './compare';
import { clientModulesOf, performHandshake } from './handshake';

function mod(
  id: string,
  version = '1.0.0',
  parts: Array<'server' | 'client'> = ['server', 'client'],
): LoadedModule {
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version, mcrs: '^1.0.0', parts },
    config: {},
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

function registryOf(...modules: LoadedModule[]): ModuleRegistry {
  const registry = new ModuleRegistry();
  modules.forEach((module) => registry.register(module));
  return registry.freeze();
}

const request = (modules: Array<{ id: string; version: string }>, clientApi = CORE_API_MAJOR) => ({
  clientApi,
  modules,
});

describe('compareModules', () => {
  it('finds no difference between identical lists, whatever the order', () => {
    const diff = compareModules(
      [
        { id: 'a', version: '1' },
        { id: 'b', version: '2' },
      ],
      [
        { id: 'b', version: '2' },
        { id: 'a', version: '1' },
      ],
    );

    expect(isSame(diff)).toBe(true);
  });

  it('lists what is missing on each side as id@version, sorted, and the version differences', () => {
    const diff = compareModules(
      [
        { id: 'stock', version: '1.0.0' },
        { id: 'orders', version: '1.1.0' },
        { id: 'auth', version: '1.0.0' },
      ],
      [
        { id: 'orders', version: '1.0.0' },
        { id: 'theme', version: '2.0.0' },
        { id: 'auth', version: '1.0.0' },
        { id: 'back-button', version: '1.0.0' },
      ],
    );

    expect(diff).toEqual({
      missingOnClient: ['stock@1.0.0'],
      missingOnServer: ['back-button@1.0.0', 'theme@2.0.0'],
      versionMismatch: [{ id: 'orders', server: '1.1.0', client: '1.0.0' }],
    });
    expect(isSame(diff)).toBe(false);
  });
});

describe('performHandshake', () => {
  const registry = registryOf(
    mod('storage-sqlite', '1.0.0', ['server']),
    mod('auth'),
    mod('catalog', '1.2.0'),
  );
  const clientList = [
    { id: 'auth', version: '1.0.0' },
    { id: 'catalog', version: '1.2.0' },
  ];

  it('knows the modules that have a client part', () => {
    expect(clientModulesOf(registry)).toEqual(clientList);
  });

  it('is compatible when the client has exactly the client modules, and reports the fingerprints', () => {
    const result = performHandshake(registry, 'block', request([...clientList].reverse()));

    expect(result.compatible).toBe(true);
    expect(result.policy).toBe('block');
    expect(result.api).toEqual({ server: CORE_API_MAJOR, client: CORE_API_MAJOR });
    expect(result.server).toEqual({
      fingerprint: registry.fingerprint,
      clientFingerprint: registry.clientFingerprint,
    });
    expect(result.client.clientFingerprint).toBe(registry.clientFingerprint);
    expect(result.diff).toEqual({ missingOnClient: [], missingOnServer: [], versionMismatch: [] });
  });

  it('computes the client fingerprint from the list the client sent', () => {
    const result = performHandshake(registry, 'warn', request([{ id: 'auth', version: '1.0.0' }]));

    expect(result.compatible).toBe(false);
    expect(result.policy).toBe('warn');
    expect(result.client.clientFingerprint).toBe(fingerprintOf([{ id: 'auth', version: '1.0.0' }]));
    expect(result.server.clientFingerprint).toBe(
      computeFingerprints(
        registry.modules.map((m) => ({
          id: m.id,
          version: m.manifest.version,
          parts: m.manifest.parts,
        })),
      ).clientFingerprint,
    );
    expect(result.diff.missingOnClient).toEqual(['catalog@1.2.0']);
  });

  it('reports a module the client has and the server does not', () => {
    const result = performHandshake(
      registry,
      'block',
      request([...clientList, { id: 'theme', version: '1.0.0' }]),
    );

    expect(result.compatible).toBe(false);
    expect(result.diff.missingOnServer).toEqual(['theme@1.0.0']);
  });

  it('reports a version that differs', () => {
    const result = performHandshake(
      registry,
      'block',
      request([
        { id: 'auth', version: '1.0.0' },
        { id: 'catalog', version: '1.1.0' },
      ]),
    );

    expect(result.compatible).toBe(false);
    expect(result.diff.versionMismatch).toEqual([
      { id: 'catalog', server: '1.2.0', client: '1.1.0' },
    ]);
  });

  it('is not compatible with a client that was built for another skeleton API', () => {
    const result = performHandshake(registry, 'block', request(clientList, '2'));

    expect(result.compatible).toBe(false);
    expect(result.api).toEqual({ server: CORE_API_MAJOR, client: '2' });
    expect(result.diff).toEqual({ missingOnClient: [], missingOnServer: [], versionMismatch: [] });
  });

  it('never names server-only modules, not even when the client lacks everything', () => {
    const result = performHandshake(registry, 'block', request([]));

    expect(JSON.stringify(result)).not.toContain('storage-sqlite');
    expect(result.diff.missingOnClient).toEqual(['auth@1.0.0', 'catalog@1.2.0']);
  });
});
