import { Reject } from '@mcrs/shared';
import { assertOwnName, assertValidName, type Logger } from '../common';
import type { HookOptions, ModuleHooks } from '../module-api';

export const DEFAULT_PRIORITY = 100;

type GuardHandler = (payload: unknown, transaction: unknown) => void | Promise<void>;
type FilterHandler = (value: unknown, ...context: unknown[]) => unknown;

interface Registration<Handler> {
  owner: string;
  handler: Handler;
  priority: number;
  /** Registration number; decides between hooks with the same priority. */
  order: number;
}

/** A guard or filter that failed with something other than a rejection. */
export class HookError extends Error {
  readonly kind: 'guard' | 'filter';
  readonly hook: string;
  readonly owner: string;

  constructor(kind: 'guard' | 'filter', hook: string, owner: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`${kind} "${hook}" of module "${owner}" failed: ${reason}`, { cause });
    this.name = 'HookError';
    this.kind = kind;
    this.hook = hook;
    this.owner = owner;
  }
}

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function';

/**
 * Guards and filters: the two ways a module can take part in something another module does.
 *
 * A guard runs before an action, inside its transaction, and can refuse it with a `Reject`. A filter
 * changes a value on its way through. Both run in priority order (lower numbers first, then in the
 * order they were added).
 */
export class HookRegistry {
  private readonly guards = new Map<string, Array<Registration<GuardHandler>>>();
  private readonly filters = new Map<string, Array<Registration<FilterHandler>>>();
  private readonly log: Logger;
  private counter = 0;

  constructor(log: Logger) {
    this.log = log;
  }

  /** Returns a function that removes the guard again. */
  addGuard(
    name: string,
    handler: GuardHandler,
    options: HookOptions = {},
    owner = 'core',
  ): () => void {
    return this.add(this.guards, 'guard', name, handler, options, owner);
  }

  /** Returns a function that removes the filter again. */
  addFilter(
    name: string,
    handler: FilterHandler,
    options: HookOptions = {},
    owner = 'core',
  ): () => void {
    return this.add(this.filters, 'filter', name, handler, options, owner);
  }

  /**
   * Runs the guards one after the other and waits for each. The first `Reject` is thrown as it is.
   * Any other error also aborts (a broken guard must not let an action through) and is thrown as a
   * HookError that names the module.
   */
  async runGuards(name: string, payload?: unknown, transaction?: unknown): Promise<void> {
    for (const registration of this.guards.get(name) ?? []) {
      try {
        await registration.handler(payload, transaction);
      } catch (error) {
        if (error instanceof Reject) throw error;
        throw new HookError('guard', name, registration.owner, error);
      }
    }
  }

  /** Passes the value through the filters. A filter that fails is logged and skipped. */
  applyFilters(name: string, value: unknown, ...context: unknown[]): unknown {
    let current = value;
    for (const registration of this.filters.get(name) ?? []) {
      try {
        const result = registration.handler(current, ...context);
        if (isPromiseLike(result)) {
          result.then(undefined, () => undefined); // do not leave an unhandled rejection behind
          this.log.error(
            `filter "${name}" of module "${registration.owner}" returned a promise; filters have to be synchronous, so its result is ignored`,
          );
          continue;
        }
        current = result;
      } catch (error) {
        this.log.error(new HookError('filter', name, registration.owner, error).message);
      }
    }
    return current;
  }

  /** The view that one module gets: it may only run guards and filters that start with its own id. */
  scoped(owner: string): ModuleHooks {
    return {
      guard: ((name: string, handler: GuardHandler, options?: HookOptions) =>
        this.addGuard(name, handler, options, owner)) as ModuleHooks['guard'],
      filter: ((name: string, handler: FilterHandler, options?: HookOptions) =>
        this.addFilter(name, handler, options, owner)) as ModuleHooks['filter'],
      runGuards: (async (name: string, payload?: unknown, transaction?: unknown) => {
        assertOwnName(owner, 'guard', name, 'run');
        await this.runGuards(name, payload, transaction);
      }) as ModuleHooks['runGuards'],
      applyFilters: ((name: string, value: unknown, ...context: unknown[]) => {
        assertOwnName(owner, 'filter', name, 'apply');
        return this.applyFilters(name, value, ...context);
      }) as ModuleHooks['applyFilters'],
    };
  }

  private add<Handler>(
    store: Map<string, Array<Registration<Handler>>>,
    kind: 'guard' | 'filter',
    name: string,
    handler: Handler,
    options: HookOptions,
    owner: string,
  ): () => void {
    assertValidName(kind, name);
    const priority = options.priority ?? DEFAULT_PRIORITY;
    if (!Number.isFinite(priority))
      throw new Error(`the priority of ${kind} "${name}" has to be a number`);

    const registration: Registration<Handler> = { owner, handler, priority, order: this.counter++ };
    const list = [...(store.get(name) ?? []), registration].sort(
      (a, b) => a.priority - b.priority || a.order - b.order,
    );
    store.set(name, list);

    return () => {
      const remaining = (store.get(name) ?? []).filter((candidate) => candidate !== registration);
      if (remaining.length > 0) store.set(name, remaining);
      else store.delete(name);
    };
  }
}
