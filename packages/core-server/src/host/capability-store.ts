import type { LoadedModule } from '../blueprint';
import type { CapabilityAccess } from '../module-api';

interface Entry {
  moduleId: string;
  implementation: unknown;
}

/** The capabilities that modules offered while they registered, and the rules for using them. */
export class CapabilityStore {
  private readonly provided = new Map<string, Entry[]>();
  private registering: string | null = null;

  /** Names the module that is allowed to provide capabilities right now (null: nobody). */
  setRegistering(moduleId: string | null): void {
    this.registering = moduleId;
  }

  /** The capabilities a module has provided so far. */
  providedBy(moduleId: string): string[] {
    return [...this.provided]
      .filter(([, entries]) => entries.some((entry) => entry.moduleId === moduleId))
      .map(([name]) => name);
  }

  /** For the core: the (first) implementation of a capability, whoever provided it. */
  find<T>(name: string): T | undefined {
    return this.provided.get(name)?.[0]?.implementation as T | undefined;
  }

  /** The view of the store that one module gets. It only allows what the module declared. */
  accessFor(module: LoadedModule): CapabilityAccess {
    const id = module.id;
    const declared = new Set(
      (module.manifest.provides ?? []).map((item) => (typeof item === 'string' ? item : item.name)),
    );
    const required = new Set(module.manifest.requires ?? []);
    const optional = new Set(module.manifest.optional ?? []);
    const entriesOf = (name: string): Entry[] => this.provided.get(name) ?? [];

    const mustBeListed = (name: string, lists: Array<Set<string>>, where: string): void => {
      if (!lists.some((list) => list.has(name))) {
        throw new Error(`module "${id}" asks for "${name}" but does not list it in ${where}`);
      }
    };

    return {
      provide: (name, implementation) => {
        if (!declared.has(name)) {
          throw new Error(
            `module "${id}" provides "${name}" but does not declare it in "provides" of its module.json`,
          );
        }
        if (this.registering !== id) {
          throw new Error(
            `module "${id}" can only provide capabilities while it registers (inside register())`,
          );
        }
        if (entriesOf(name).some((entry) => entry.moduleId === id)) {
          throw new Error(`module "${id}" already provided "${name}"`);
        }
        this.provided.set(name, [...entriesOf(name), { moduleId: id, implementation }]);
      },

      get: <T>(name: string): T => {
        mustBeListed(name, [required], '"requires" (use tryGet() for optional capabilities)');
        const entries = entriesOf(name);
        if (entries.length === 0)
          throw new Error(`nothing provided "${name}" (module "${id}" requires it)`);
        if (entries.length > 1) {
          throw new Error(
            `"${name}" has several providers (${entries.map((entry) => entry.moduleId).join(', ')}); use getAll()`,
          );
        }
        return (entries[0] as Entry).implementation as T;
      },

      tryGet: <T>(name: string): T | undefined => {
        mustBeListed(name, [required, optional], '"requires" or "optional"');
        const entries = entriesOf(name);
        if (entries.length > 1) {
          throw new Error(
            `"${name}" has several providers (${entries.map((entry) => entry.moduleId).join(', ')}); use getAll()`,
          );
        }
        return entries[0]?.implementation as T | undefined;
      },

      getAll: <T>(name: string): T[] => {
        mustBeListed(name, [required, optional], '"requires" or "optional"');
        return entriesOf(name).map((entry) => entry.implementation as T);
      },
    };
  }
}
