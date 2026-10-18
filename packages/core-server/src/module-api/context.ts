import type { EmitArgs, FilterValueOf, GuardPayloadOf, PayloadOf } from '@mcrs/shared';
import type { Request, Response } from 'express';
import type { Logger } from '../common';

/**
 * What a module gets in `register()`, `start()` and `stop()`.
 *
 * `routes` only works when the host was given a route registry (the server does that).
 */
export interface ModuleContext {
  readonly id: string;
  /** The module's `config` block from mcrs.config.json: validated, with defaults, read-only. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Absolute path of the data directory (database, secrets, uploads). */
  readonly dataDir: string;
  readonly log: Logger;
  readonly routes: ModuleRoutes;
  readonly events: ModuleEvents;
  readonly hooks: ModuleHooks;
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

/** What a module can do with events: listen, and announce what happened. */
export interface ModuleEvents {
  /** Listens to an event. Returns a function that removes the listener again. */
  on<N extends string>(
    name: N,
    handler: (payload: PayloadOf<N>) => void | Promise<void>,
  ): () => void;
  /**
   * Announces that something happened. Listeners are called asynchronously, and a listener that
   * fails never affects the caller. Only for events that start with the module's own id.
   */
  emit<N extends string>(name: N, ...payload: EmitArgs<N>): void;
  /** Collects events during a transaction. Call `flush()` after the commit, or `discard()` on rollback. */
  outbox(): EventOutbox;
}

export interface EventOutbox {
  emit<N extends string>(name: N, ...payload: EmitArgs<N>): void;
  /** Announces the collected events. Do this after the transaction committed. */
  flush(): void;
  /** Drops the collected events (the transaction was rolled back). */
  discard(): void;
}

export interface HookOptions {
  /** Lower numbers run first. Default 100. Hooks with the same priority run in registration order. */
  priority?: number;
}

/** What a module can do with hooks: add guards and filters, and run its own. */
export interface ModuleHooks {
  /**
   * Adds a guard: a check that runs before an action, inside its transaction. Throw
   * `new Reject(code, details)` to refuse the action. Returns a function that removes the guard.
   */
  guard<N extends string>(
    name: N,
    handler: (payload: GuardPayloadOf<N>, transaction: unknown) => void | Promise<void>,
    options?: HookOptions,
  ): () => void;
  /**
   * Adds a filter: a synchronous function that may change a value on its way through. If it throws,
   * the value is passed on unchanged. Returns a function that removes the filter.
   */
  filter<N extends string>(
    name: N,
    handler: (value: FilterValueOf<N>, ...context: unknown[]) => FilterValueOf<N>,
    options?: HookOptions,
  ): () => void;
  /** Runs the guards of one of the module's own actions. Throws the first `Reject`. */
  runGuards<N extends string>(
    name: N,
    payload: GuardPayloadOf<N>,
    transaction?: unknown,
  ): Promise<void>;
  /** Passes a value through the filters of one of the module's own filter points. */
  applyFilters<N extends string>(
    name: N,
    value: FilterValueOf<N>,
    ...context: unknown[]
  ): FilterValueOf<N>;
}

/** Who may call a route: everybody, every logged-in user, or users with one of these roles. */
export type RouteAccess = 'public' | 'authenticated' | { roles: string[] };

/** Express request and response. `response.locals.user` is the logged-in user on non-public routes. */
export type ApiRequest = Request;
export type ApiResponse = Response;
export type RouteHandler = (request: ApiRequest, response: ApiResponse) => unknown;

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to /api/<moduleId>, for example "/items/:id". "/" is /api/<moduleId> itself. */
  path: string;
  /** Required. A route without an access rule is refused, so the server does not start. */
  access: RouteAccess;
  handler: RouteHandler;
}

/** What a module can do with routes. */
export interface ModuleRoutes {
  /** Adds a route under /api/<moduleId>. Throws when the route is not acceptable. */
  add(route: RouteDefinition): void;
}

/** Anything that hands out the route view of a module (the RouteRegistry does). */
export interface RouteSource {
  scoped(owner: string): ModuleRoutes;
}

export const pendingRoutes: ModuleRoutes = {
  add: () => {
    throw new Error('ctx.routes is not available: this host was started without a route registry');
  },
};
