import { fingerprintOf } from '@mcrs/shared';
import { describe, expect, it } from 'vitest';
import type { Blueprint, LoadedModule } from '../blueprint';
import { ModuleRegistry, RegistryFrozenError } from './registry';

function mod(
  id: string,
  version = '1.0.0',
  parts: Array<'server' | 'client'> = ['server'],
): LoadedModule {
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version, mcrs: '^1.0.0', parts },
    config: { setting: { nested: true } },
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

describe('ModuleRegistry', () => {
  it('holds the registered modules and freezes', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));
    registry.register(mod('catalog'));

    expect(registry.frozen).toBe(false);
    expect(registry.freeze().frozen).toBe(true);
    expect(registry.modules.map((module) => module.id)).toEqual(['auth', 'catalog']);
    expect(registry.has('auth')).toBe(true);
    expect(registry.get('catalog')?.id).toBe('catalog');
  });

  it('lists the modules registered so far, also before it is frozen', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));
    registry.register(mod('catalog'));

    expect(registry.modules.map((module) => module.id)).toEqual(['auth', 'catalog']);
  });

  it('refuses to register a module after the freeze', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));
    registry.freeze();

    expect(() => registry.register(mod('late'))).toThrow(RegistryFrozenError);
    expect(() => registry.register(mod('late'))).toThrow('"late"');
    expect(registry.has('late')).toBe(false);
  });

  it('can be frozen twice', () => {
    const registry = new ModuleRegistry().freeze();

    expect(() => registry.freeze()).not.toThrow();
  });

  it('refuses a module id that is already registered', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));

    expect(() => registry.register(mod('auth'))).toThrow('already registered');
  });

  it('makes the modules read-only once frozen', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));
    registry.freeze();

    expect(() => (registry.modules as LoadedModule[]).push(mod('other'))).toThrow();
    expect(() => {
      (registry.modules[0] as { id: string }).id = 'changed';
    }).toThrow();
    expect(() => {
      (registry.modules[0]?.manifest as { version: string }).version = '9.9.9';
    }).toThrow();
    expect(() => {
      (registry.modules[0]?.config.setting as { nested: boolean }).nested = false;
    }).toThrow();
  });

  it('has no fingerprint before the freeze', () => {
    const registry = new ModuleRegistry();
    registry.register(mod('auth'));

    expect(() => registry.fingerprint).toThrow('not frozen');
    expect(() => registry.clientFingerprint).toThrow('not frozen');
  });

  it('computes the fingerprints from id and version, whatever the registration order', () => {
    const modules = [
      mod('auth', '1.0.0', ['server', 'client']),
      mod('storage', '2.1.0'),
      mod('catalog', '1.2.0', ['client']),
    ];

    const forward = new ModuleRegistry();
    modules.forEach((module) => forward.register(module));
    const backward = new ModuleRegistry();
    [...modules]
      .reverse()
      .forEach((module) =>
        backward.register(mod(module.id, module.manifest.version, module.manifest.parts)),
      );

    expect(forward.freeze().fingerprint).toBe(
      fingerprintOf([
        { id: 'auth', version: '1.0.0' },
        { id: 'storage', version: '2.1.0' },
        { id: 'catalog', version: '1.2.0' },
      ]),
    );
    expect(backward.freeze().fingerprint).toBe(forward.fingerprint);
    expect(forward.clientFingerprint).toBe(
      fingerprintOf([
        { id: 'auth', version: '1.0.0' },
        { id: 'catalog', version: '1.2.0' },
      ]),
    );
  });

  it('does not depend on where a module comes from', () => {
    const fromPath = new ModuleRegistry();
    fromPath.register(mod('auth'));

    const fromPackage = new ModuleRegistry();
    fromPackage.register({
      ...mod('auth'),
      dir: '/node_modules/mcrs-auth',
      source: { kind: 'package', specifier: 'mcrs-auth' },
    });

    expect(fromPath.freeze().fingerprint).toBe(fromPackage.freeze().fingerprint);
  });

  it('is created and frozen from a blueprint, in start order', () => {
    const blueprint = {
      configFile: '/mcrs.config.json',
      modules: [mod('stock'), mod('catalog')],
      loadOrder: [mod('catalog'), mod('stock')],
      capabilities: new Map<string, string[]>(),
    } as unknown as Blueprint;

    const registry = ModuleRegistry.fromBlueprint(blueprint);

    expect(registry.frozen).toBe(true);
    expect(registry.modules.map((module) => module.id)).toEqual(['catalog', 'stock']);
    expect(registry.fingerprint).toHaveLength(64);
  });
});
