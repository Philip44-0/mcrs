import { computeFingerprints } from '@mcrs/shared';
import type { Blueprint, LoadedModule } from './blueprint';

/** Thrown when a module is registered after the registry was frozen. */
export class RegistryFrozenError extends Error {
  constructor(moduleId: string) {
    super(`the module registry is frozen: module "${moduleId}" cannot be registered after startup`);
    this.name = 'RegistryFrozenError';
  }
}

interface Snapshot {
  modules: readonly LoadedModule[];
  fingerprint: string;
  clientFingerprint: string;
}

/**
 * The list of installed modules. Modules are registered while the server starts; then the registry
 * is frozen. From that moment the list cannot change (changing modules means a restart), and the
 * fingerprints of the installation are fixed.
 */
export class ModuleRegistry {
  private readonly entries = new Map<string, LoadedModule>();
  private snapshot: Snapshot | null = null;

  /** Registers the modules of a blueprint in start order and freezes the registry. */
  static fromBlueprint(blueprint: Blueprint): ModuleRegistry {
    const registry = new ModuleRegistry();
    for (const module of blueprint.loadOrder) registry.register(module);
    return registry.freeze();
  }

  get frozen(): boolean {
    return this.snapshot !== null;
  }

  /** The modules in registration order. Cannot be changed once the registry is frozen. */
  get modules(): readonly LoadedModule[] {
    return this.snapshot?.modules ?? [...this.entries.values()];
  }

  /** Over all modules. Only available after the registry was frozen. */
  get fingerprint(): string {
    return this.frozenSnapshot().fingerprint;
  }

  /** Over the modules that have a client part. Only available after the registry was frozen. */
  get clientFingerprint(): string {
    return this.frozenSnapshot().clientFingerprint;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): LoadedModule | undefined {
    return this.entries.get(id);
  }

  register(module: LoadedModule): void {
    if (this.snapshot !== null) throw new RegistryFrozenError(module.id);
    if (this.entries.has(module.id)) throw new Error(`module "${module.id}" is already registered`);
    this.entries.set(module.id, module);
  }

  /** Locks the registry, makes the modules read-only and computes the fingerprints. */
  freeze(): this {
    if (this.snapshot !== null) return this;

    const modules = Object.freeze([...this.entries.values()].map((module) => deepFreeze(module)));
    const { fingerprint, clientFingerprint } = computeFingerprints(
      modules.map((module) => ({
        id: module.id,
        version: module.manifest.version,
        parts: module.manifest.parts,
      })),
    );
    this.snapshot = Object.freeze({ modules, fingerprint, clientFingerprint });
    return this;
  }

  private frozenSnapshot(): Snapshot {
    if (this.snapshot === null)
      throw new Error('the module registry is not frozen yet, so there are no fingerprints');
    return this.snapshot;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
