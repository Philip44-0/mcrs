import type { AuthProvider } from '@mcrs/shared';
import { ApiError } from '@mcrs/shared';
import express from 'express';
import type { RequestHandler, Router } from 'express';
import type { ModuleRoutes, RouteAccess, RouteDefinition } from '../module-api';
import { decideAccess } from './access';
import { validateRoute } from './route-validation';

export interface RouteRegistryOptions {
  /** The auth module's capability, if there is one. Asked for on every request that is not public. */
  auth: () => AuthProvider | undefined;
}

type RouterMethods = Record<string, (path: string, ...handlers: RequestHandler[]) => unknown>;

/**
 * Where modules put their routes. Every route has to say who may call it; a route without a valid
 * access rule is refused when it is added, so the server does not start with it. Routes live under
 * `/api/<moduleId>/`, and the rule is enforced here on the server for every request.
 */
export class RouteRegistry {
  /** All routes, to be mounted under /api. */
  readonly router: Router = express.Router();
  private readonly options: RouteRegistryOptions;
  private readonly seen = new Set<string>();
  private frozen = false;

  constructor(options: RouteRegistryOptions) {
    this.options = options;
  }

  /** Adds a route of a module (or of the core, with the owner `_core`). Throws when it is not acceptable. */
  add(route: RouteDefinition, owner: string): void {
    const label = `route ${String((route as Partial<RouteDefinition> | null)?.method)} ${String((route as Partial<RouteDefinition> | null)?.path)} of module "${owner}"`;
    if (this.frozen)
      throw new Error(
        `${label} was added too late: routes cannot be added once the server started`,
      );

    const problems = validateRoute(route);
    if (problems.length > 0) throw new Error(`${label}: ${problems.join('; ')}`);

    const fullPath = `/${owner}${route.path === '/' ? '' : route.path}`;
    const key = `${route.method} ${fullPath}`;
    if (this.seen.has(key)) throw new Error(`${label} is registered twice (${key})`);
    this.seen.add(key);

    const handler: RequestHandler = (request, response, next) => {
      Promise.resolve()
        .then(() => route.handler(request, response))
        .catch(next);
    };
    (this.router as unknown as RouterMethods)[route.method.toLowerCase()]?.(
      fullPath,
      this.accessCheck(route.access),
      handler,
    );
  }

  /** No routes can be added after this. */
  freeze(): void {
    this.frozen = true;
  }

  /** The view that one module gets. Its routes end up under /api/<moduleId>. */
  scoped(owner: string): ModuleRoutes {
    return { add: (route) => this.add(route, owner) };
  }

  private accessCheck(access: RouteAccess): RequestHandler {
    if (access === 'public') return (_request, _response, next) => next();

    return async (request, response, next) => {
      try {
        const provider = this.options.auth();
        const user = provider === undefined ? null : await provider.user(request);
        const decision = decideAccess(access, user);
        if (!decision.allowed) {
          next(new ApiError(decision.status, decision.code, decision.message));
          return;
        }
        response.locals.user = user;
        next();
      } catch (error) {
        next(error);
      }
    };
  }
}
