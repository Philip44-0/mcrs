import type { LoadedModule } from './blueprint';
import type { Problem } from './problems';

export interface Plan {
  /** The modules in the order they have to be started. Empty when there are errors. */
  order: LoadedModule[];
  /** Every provided capability with the ids of the modules that provide it (in config order). */
  capabilities: Map<string, string[]>;
  errors: Problem[];
  warnings: Problem[];
}

interface Provider {
  module: LoadedModule;
  multi: boolean;
  /** Index in the module's `provides` list (for messages). */
  index: number;
}

/**
 * Works out which module provides which capability, checks that everything a module needs is
 * provided, and computes the order in which the modules have to be started.
 *
 * - A capability has one provider, unless every provider declares it with `multi: true`.
 * - `requires` has to be satisfied; `optional` never stops anything.
 * - Providers are started before the modules that need them. Modules without a relation keep the
 *   order of mcrs.config.json.
 * - A cycle in `requires` is an error. An optional dependency that would close a cycle is ignored.
 *
 * All problems are collected, so the caller can report them together.
 */
export function planModules(modules: LoadedModule[]): Plan {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const position = new Map(modules.map((module, index) => [module.id, index]));
  const byId = new Map(modules.map((module) => [module.id, module]));

  // 1. Who provides what?
  const providers = new Map<string, Provider[]>();
  for (const module of modules) {
    const seen = new Set<string>();
    (module.manifest.provides ?? []).forEach((item, index) => {
      const name = typeof item === 'string' ? item : item.name;
      const multi = typeof item === 'string' ? false : item.multi === true;
      if (seen.has(name)) return; // listed twice by the same module
      seen.add(name);
      providers.set(name, [...(providers.get(name) ?? []), { module, multi, index }]);
    });
  }

  for (const [name, list] of providers) {
    if (list.length < 2 || list.every((provider) => provider.multi)) continue;
    const [first, ...others] = list;
    for (const other of others) {
      errors.push({
        file: other.module.manifestFile,
        path: `provides[${other.index}]`,
        message: `capability "${name}" is also provided by "${first.module.id}" (a capability has one provider, unless every provider declares it with "multi": true)`,
      });
    }
  }

  const otherMajors = new Map<string, string[]>(); // "catalog" -> ["catalog@2"]
  for (const name of providers.keys()) {
    const base = name.slice(0, name.lastIndexOf('@'));
    otherMajors.set(base, [...(otherMajors.get(base) ?? []), name]);
  }

  // 2. What does each module need?
  const needs = new Map<string, Set<string>>(); // module -> modules it needs (required only)
  const soft: Array<[provider: string, consumer: string]> = []; // optional: provider should start first

  for (const module of modules) {
    const hard = new Set<string>();

    (module.manifest.requires ?? []).forEach((capability, index) => {
      const list = providers.get(capability);
      if (list === undefined) {
        const base = capability.slice(0, capability.lastIndexOf('@'));
        const installed = (otherMajors.get(base) ?? []).map(
          (name) =>
            `${name} from ${(providers.get(name) ?? []).map((provider) => provider.module.id).join(', ')}`,
        );
        const hint =
          installed.length > 0
            ? ` (installed with another major version: ${installed.join('; ')})`
            : '';
        errors.push({
          file: module.manifestFile,
          path: `requires[${index}]`,
          message: `needs "${capability}", but no installed module provides it${hint}`,
        });
        return;
      }
      for (const provider of list) {
        if (provider.module.id === module.id) {
          warnings.push({
            file: module.manifestFile,
            path: `requires[${index}]`,
            message: `"${capability}" is provided by this module itself, so there is nothing to wait for`,
          });
        } else {
          hard.add(provider.module.id);
        }
      }
    });
    needs.set(module.id, hard);

    for (const capability of module.manifest.optional ?? []) {
      for (const provider of providers.get(capability) ?? []) {
        if (provider.module.id !== module.id && !hard.has(provider.module.id)) {
          soft.push([provider.module.id, module.id]);
        }
      }
    }
  }

  // 3. Cycles among the required dependencies
  for (const cycle of findCycles(needs, position)) {
    errors.push({
      file: byId.get(cycle[0] ?? '')?.manifestFile ?? '',
      path: '',
      message: `dependency cycle: ${cycle.join(' -> ')} (each module needs the next one)`,
    });
  }

  const capabilities = new Map<string, string[]>(
    [...providers].map(([name, list]) => [name, list.map((provider) => provider.module.id)]),
  );
  if (errors.length > 0) return { order: [], capabilities, errors, warnings };

  // 4. Start order: providers first. Optional dependencies count as long as they do not close a cycle.
  const before = new Map<string, Set<string>>(
    modules.map((module) => [module.id, new Set<string>()]),
  );
  for (const [consumer, wanted] of needs) {
    for (const provider of wanted) before.get(provider)?.add(consumer);
  }
  for (const [provider, consumer] of soft) {
    if (before.get(provider)?.has(consumer)) continue;
    if (reaches(before, consumer, provider)) {
      warnings.push({
        file: byId.get(consumer)?.manifestFile ?? '',
        path: 'optional',
        message: `the optional dependency on "${provider}" is ignored, because it would create a dependency cycle`,
      });
      continue;
    }
    before.get(provider)?.add(consumer);
  }

  const waiting = new Map<string, number>(modules.map((module) => [module.id, 0]));
  for (const consumers of before.values()) {
    for (const consumer of consumers) waiting.set(consumer, (waiting.get(consumer) ?? 0) + 1);
  }

  const ready = modules.filter((module) => waiting.get(module.id) === 0).map((module) => module.id);
  const order: LoadedModule[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    const id = ready.shift() as string;
    const module = byId.get(id);
    if (module !== undefined) order.push(module);
    for (const consumer of before.get(id) ?? []) {
      const left = (waiting.get(consumer) ?? 0) - 1;
      waiting.set(consumer, left);
      if (left === 0) ready.push(consumer);
    }
  }

  if (order.length !== modules.length) {
    errors.push({
      file: '',
      path: '',
      message: 'internal error: the modules could not be put in order',
    });
    return { order: [], capabilities, errors, warnings };
  }

  return { order, capabilities, errors, warnings };
}

/** True when `to` can be reached from `from` by following the edges of `graph`. */
function reaches(graph: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>([from]);
  const todo = [from];
  while (todo.length > 0) {
    const current = todo.pop() as string;
    if (current === to) return true;
    for (const next of graph.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        todo.push(next);
      }
    }
  }
  return false;
}

/** One cycle (as a path such as ["a", "b", "a"]) for every group of modules that need each other. */
function findCycles(needs: Map<string, Set<string>>, position: Map<string, number>): string[][] {
  const at = (id: string): number => position.get(id) ?? 0;
  const number = (map: Map<string, number>, id: string): number => map.get(id) ?? 0;

  // Tarjan's algorithm: strongly connected components
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);

    for (const next of needs.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(number(low, node), number(low, next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(number(low, node), number(index, next)));
      }
    }

    if (low.get(node) === index.get(node)) {
      const group: string[] = [];
      let member: string;
      do {
        member = stack.pop() as string;
        onStack.delete(member);
        group.push(member);
      } while (member !== node);
      if (group.length > 1) groups.push(group);
    }
  };

  for (const node of needs.keys()) {
    if (!index.has(node)) visit(node);
  }

  return groups
    .map((group) => {
      const members = new Set(group);
      const start = [...group].sort((a, b) => at(a) - at(b))[0] as string;
      return pathBack(start, members, needs);
    })
    .sort((a, b) => at(a[0] ?? '') - at(b[0] ?? ''));
}

/** The shortest way from `start` through `members` back to `start`. */
function pathBack(start: string, members: Set<string>, needs: Map<string, Set<string>>): string[] {
  const parent = new Map<string, string>();
  const queue: string[] = [];

  for (const next of needs.get(start) ?? []) {
    if (members.has(next) && next !== start) {
      parent.set(next, start);
      queue.push(next);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of needs.get(current) ?? []) {
      if (!members.has(next)) continue;
      if (next === start) {
        const middle: string[] = [];
        for (let node = current; node !== start; node = parent.get(node) as string)
          middle.unshift(node);
        return [start, ...middle, start];
      }
      if (!parent.has(next)) {
        parent.set(next, current);
        queue.push(next);
      }
    }
  }
  return [start, start];
}
