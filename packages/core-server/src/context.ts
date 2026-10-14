import type { Logger } from './logger';

/**
 * What a module gets in `register()`, `start()` and `stop()`.
 *
 * `events`, `hooks` and `routes` have their final shape here, but they are completed in their own
 * issues. Until then they throw an error that names the issue.
 */
export interface ModuleContext {
  readonly id: string;
  /** The module's `config` block from mcrs.config.json: validated, with defaults, read-only. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Absolute path of the data directory (database, secrets, uploads). */
  readonly dataDir: string;
  readonly log: Logger;
  readonly routes: RouteRegistry;
  readonly events: EventBus;
  readonly hooks: HookRegistry;
  readonly capabilities: CapabilityAccess;
}

/** What a module's server part looks like. `register` is required, `start` and `stop` are not. */
export interface ServerModule {
  register(context: ModuleContext): void | Promise<void>;
  start?(context: ModuleContext): void | Promise<void>;
  stop?(context: ModuleContext): void | Promise<void>;
}

export interface CapabilityAccess {
  /** Offers a capability. Only allowed inside `register()`, and only for what `provides` declares. */
  provide<T>(name: string, implementation: T): void;
  /** A required capability (listed in `requires`). Throws when it has several providers. */
  get<T>(name: string): T;
  /** A capability listed in `requires` or `optional`; undefined when nobody provides it. */
  tryGet<T>(name: string): T | undefined;
  /** All providers of a capability listed in `requires` or `optional` (for `multi` capabilities). */
  getAll<T>(name: string): T[];
}

/** Completed in the issue "Say it with events, guard with hooks". */
export interface EventBus {
  on(name: string, handler: (payload: unknown) => void | Promise<void>): void;
  emit(name: string, payload?: unknown): void;
}

/** Completed in the issue "Say it with events, guard with hooks". */
export interface HookRegistry {
  guard(
    name: string,
    handler: (payload: unknown, transaction?: unknown) => void | Promise<void>,
    options?: { priority?: number },
  ): void;
  filter<T>(
    name: string,
    handler: (value: T, ...context: unknown[]) => T,
    options?: { priority?: number },
  ): void;
}

export type RouteAccess = 'public' | 'authenticated' | { roles: string[] };

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to /api/<moduleId>. */
  path: string;
  /** Every route has to say who may call it. */
  access: RouteAccess;
  handler: (request: never, response: never) => unknown;
}

/** Completed in the issue "No open doors: route registry with mandatory access rules". */
export interface RouteRegistry {
  add(route: RouteDefinition): void;
}

function pending(what: string, issue: string): never {
  throw new Error(`${what} is not available yet (it is built in the issue "${issue}")`);
}

export const pendingEvents: EventBus = {
  on: () => pending('ctx.events', 'Say it with events, guard with hooks'),
  emit: () => pending('ctx.events', 'Say it with events, guard with hooks'),
};

export const pendingHooks: HookRegistry = {
  guard: () => pending('ctx.hooks', 'Say it with events, guard with hooks'),
  filter: () => pending('ctx.hooks', 'Say it with events, guard with hooks'),
};

export const pendingRoutes: RouteRegistry = {
  add: () => pending('ctx.routes', 'No open doors: route registry with mandatory access rules'),
};
