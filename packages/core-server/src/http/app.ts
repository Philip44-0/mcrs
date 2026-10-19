import { ApiError, type AuthProvider } from '@mcrs/shared';
import express from 'express';
import type { ErrorRequestHandler, Express, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import type { Logger } from '../common';
import { describeError, errorBody } from './errors';
import { resolveRequestId } from './request-id';
import { addCoreRoutes, type CoreInfo } from './core-routes';
import { RouteRegistry } from './route-registry';

export interface HttpAppOptions {
  /** Request lines and errors are written here. */
  log: Logger;
  /** The auth module's capability, if there is one. Without it, only public routes can be reached. */
  auth: () => AuthProvider | undefined;
  /** The largest JSON body that is accepted. Default "100kb". */
  bodyLimit?: string;
  /** The installed modules. Without it, health only says "ok" and there is no handshake endpoint. */
  core?: CoreInfo;
}

export interface HttpApp {
  app: Express;
  routes: RouteRegistry;
  /** Call once all modules started: locks the routes and adds the "not found" and error handlers. */
  finish(): void;
}

const pathOf = (request: Request): string => request.originalUrl.split('?')[0] ?? '';
const requestIdOf = (response: Response): string | undefined =>
  response.locals.requestId as string | undefined;

const requestId: RequestHandler = (request, response, next) => {
  const id = resolveRequestId(request.header('x-request-id'));
  response.locals.requestId = id;
  response.setHeader('X-Request-Id', id);
  next();
};

/** One line per request, when it is done: method, path (without the query), status, time. */
function requestLogger(log: Logger): RequestHandler {
  return (request, response, next) => {
    const started = process.hrtime.bigint();
    response.on('finish', () => {
      const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const status = response.statusCode;
      const line = `${request.method} ${pathOf(request)} ${status} ${ms}ms`;
      const user = response.locals.user as { id?: string } | undefined;
      const data = {
        requestId: requestIdOf(response),
        ...(user?.id !== undefined ? { userId: user.id } : {}),
      };
      if (status >= 500) log.error(line, data);
      else if (status >= 400) log.warn(line, data);
      else log.info(line, data);
    });
    next();
  };
}

/** Everything that no route answered. */
const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'api.notFound', 'There is no such endpoint.'));
};

function errorHandler(log: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const info = describeError(error);
    if (info.unexpected) log.error(`${request.method} ${pathOf(request)} failed`, error);
    response.status(info.status).json(errorBody(info, requestIdOf(response)));
  };
}

/**
 * The Express app of the server: request ids, request logging, security headers, JSON bodies with a
 * size limit, the route registry under /api, and one error format for everything.
 */
export function createHttpApp(options: HttpAppOptions): HttpApp {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(requestLogger(options.log));
  app.use(
    helmet({
      // MCRS is often served over plain HTTP on a local network. The default
      // "upgrade-insecure-requests" would make browsers load everything over HTTPS there, and fail.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { 'upgrade-insecure-requests': null },
      },
    }),
  );

  const routes = new RouteRegistry({ auth: options.auth });
  app.use('/api', express.json({ limit: options.bodyLimit ?? '100kb' }), routes.router);

  addCoreRoutes(routes, { log: options.log, core: options.core });

  return {
    app,
    routes,
    finish() {
      routes.freeze();
      app.use(notFound);
      app.use(errorHandler(options.log));
    },
  };
}
