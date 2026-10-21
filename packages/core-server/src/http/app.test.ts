import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError, Reject, type AuthProvider, type AuthUser } from '@mcrs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, type LogSink } from '../common';
import type { RouteDefinition } from '../module-api';
import { createHttpApp, type HttpApp, type HttpAppOptions } from './app';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

type Lines = { info: unknown[][]; warn: unknown[][]; error: unknown[][] };

/** Starts the app on a free port. `configure` adds the routes of the test. */
async function start(
  configure: (http: HttpApp) => void = () => {},
  options: Partial<HttpAppOptions> = {},
) {
  const lines: Lines = { info: [], warn: [], error: [] };
  const sink: LogSink = {
    debug() {},
    info: (...args: unknown[]) => void lines.info.push(args),
    warn: (...args: unknown[]) => void lines.warn.push(args),
    error: (...args: unknown[]) => void lines.error.push(args),
  };
  const http = createHttpApp({
    log: createLogger('http', sink),
    auth: () => undefined,
    ...options,
  });
  configure(http);
  http.finish();

  const server = http.app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return { http, lines, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

const users: Record<string, AuthUser> = {
  anna: { id: '1', username: 'anna', displayName: 'Anna', roles: ['waiter'] },
  ben: { id: '2', username: 'ben', displayName: 'Ben', roles: ['admin'] },
};
/** A stand-in for the auth module: the user is named in the header X-Test-User. */
const auth: AuthProvider = {
  user: (request) => {
    const name = (request as { header(name: string): string | undefined }).header('x-test-user');
    return name === undefined ? null : (users[name] ?? null);
  },
};

const add = (http: HttpApp, owner: string, route: Partial<RouteDefinition>) =>
  http.routes
    .scoped(owner)
    .add({ method: 'GET', path: '/', access: 'public', handler: () => {}, ...route });

type Body = { error: { code: string; message: string; details?: unknown; requestId?: string } };

describe('HTTP app basics', () => {
  it('answers the health check with security headers and a request id', async () => {
    const { url } = await start();

    const response = await fetch(`${url}/api/_core/health`);
    const csp = response.headers.get('content-security-policy') ?? '';

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ status: 'ok' }));
    expect(response.headers.get('x-request-id')).toHaveLength(36);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests'); // would break plain HTTP on a local network
  });

  it('keeps a safe request id from the client and replaces an unsafe one', async () => {
    const { url } = await start();

    const kept = await fetch(`${url}/api/_core/health`, { headers: { 'x-request-id': 'my-id-1' } });
    const replaced = await fetch(`${url}/api/_core/health`, {
      headers: { 'x-request-id': 'bad id with spaces' },
    });

    expect(kept.headers.get('x-request-id')).toBe('my-id-1');
    expect(replaced.headers.get('x-request-id')).toHaveLength(36);
  });

  it('mounts the routes of a module under /api/<moduleId>', async () => {
    const { url } = await start((http) => {
      add(http, 'catalog', { path: '/', handler: (_req, res) => void res.json({ at: 'root' }) });
      add(http, 'catalog', {
        path: '/items/:id',
        handler: (req, res) => void res.json({ id: req.params.id }),
      });
    });

    expect(await (await fetch(`${url}/api/catalog`)).json()).toEqual({ at: 'root' });
    expect(await (await fetch(`${url}/api/catalog/items/42`)).json()).toEqual({ id: '42' });
  });

  it('parses JSON bodies', async () => {
    const { url } = await start((http) => {
      add(http, 'demo', {
        method: 'POST',
        path: '/echo',
        handler: (req, res) => void res.json(req.body),
      });
    });

    const response = await fetch(`${url}/api/demo/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(await response.json()).toEqual({ hello: 'world' });
  });
});

describe('access rules', () => {
  const protectedRoutes = (http: HttpApp) => {
    add(http, 'demo', {
      path: '/open',
      access: 'public',
      handler: (_req, res) => void res.json({ ok: true }),
    });
    add(http, 'demo', {
      path: '/members',
      access: 'authenticated',
      handler: (_req, res) => void res.json({ user: res.locals.user?.id }),
    });
    add(http, 'demo', {
      path: '/admin',
      access: { roles: ['admin'] },
      handler: (_req, res) => void res.json({ ok: true }),
    });
  };

  it('lets only public routes through when there is no auth module', async () => {
    const { url } = await start(protectedRoutes);

    expect((await fetch(`${url}/api/demo/open`)).status).toBe(200);
    const response = await fetch(`${url}/api/demo/members`);
    expect(response.status).toBe(401);
    expect(((await response.json()) as Body).error.code).toBe('auth.required');
    expect(
      (await fetch(`${url}/api/demo/admin`, { headers: { 'x-test-user': 'ben' } })).status,
    ).toBe(401);
  });

  it('asks the auth module and passes the user on to the handler', async () => {
    const { url } = await start(protectedRoutes, { auth: () => auth });

    expect((await fetch(`${url}/api/demo/members`)).status).toBe(401);
    const response = await fetch(`${url}/api/demo/members`, { headers: { 'x-test-user': 'anna' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: '1' });
  });

  it('keeps users without the role out of an admin route', async () => {
    const { url } = await start(protectedRoutes, { auth: () => auth });

    const waiter = await fetch(`${url}/api/demo/admin`, { headers: { 'x-test-user': 'anna' } });
    expect(waiter.status).toBe(403);
    expect(((await waiter.json()) as Body).error.code).toBe('auth.forbidden');
    expect(
      (await fetch(`${url}/api/demo/admin`, { headers: { 'x-test-user': 'ben' } })).status,
    ).toBe(200);
    expect((await fetch(`${url}/api/demo/admin`)).status).toBe(401);
  });

  it('does not let a failing auth module through', async () => {
    const broken: AuthProvider = { user: () => Promise.reject(new Error('database is down')) };
    const { url } = await start(protectedRoutes, { auth: () => broken });

    const response = await fetch(`${url}/api/demo/members`, { headers: { 'x-test-user': 'anna' } });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('database is down');
  });

  it('refuses to start with a route that has no access rule', async () => {
    await expect(start((http) => add(http, 'demo', { access: undefined }))).rejects.toThrow(
      'has no access rule',
    );
  });
});

describe('one error format', () => {
  const failing = (http: HttpApp) => {
    add(http, 'demo', {
      path: '/api-error',
      handler: () => {
        throw new ApiError(404, 'demo.notFound', 'Nothing here.', { id: '7' });
      },
    });
    add(http, 'demo', {
      path: '/reject',
      handler: async () => {
        throw new Reject('stock.soldOut', { itemId: 'schnitzel' });
      },
    });
    add(http, 'demo', {
      path: '/boom',
      handler: async () => {
        throw new Error('secret internals');
      },
    });
  };

  it('shows an ApiError with its code, message and details', async () => {
    const { url } = await start(failing);

    const response = await fetch(`${url}/api/demo/api-error`);
    const body = (await response.json()) as Body;

    expect(response.status).toBe(404);
    expect(body.error).toEqual({
      code: 'demo.notFound',
      message: 'Nothing here.',
      details: { id: '7' },
      requestId: response.headers.get('x-request-id'),
    });
  });

  it('shows a Reject as a conflict with its code', async () => {
    const { url } = await start(failing);

    const response = await fetch(`${url}/api/demo/reject`);

    expect(response.status).toBe(409);
    expect(((await response.json()) as Body).error).toEqual(
      expect.objectContaining({ code: 'stock.soldOut', details: { itemId: 'schnitzel' } }),
    );
  });

  it('hides the details of a bug, but logs them with the request', async () => {
    const { url, lines } = await start(failing);

    const response = await fetch(`${url}/api/demo/boom`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('secret internals');
    expect(JSON.parse(text)).toEqual({
      error: expect.objectContaining({ code: 'server.internalError' }),
    });
    expect(String(lines.error[0]?.[1])).toContain('GET /api/demo/boom failed'); // [tag, message, error]
  });

  it('answers unknown endpoints with 404 in the same format', async () => {
    const { url } = await start();

    for (const path of ['/api/nothing/here', '/somewhere/else']) {
      const response = await fetch(`${url}${path}`);
      expect(response.status).toBe(404);
      expect(((await response.json()) as Body).error.code).toBe('api.notFound');
    }
  });

  it('answers a body that is not valid JSON with 400', async () => {
    const { url } = await start((http) =>
      add(http, 'demo', {
        method: 'POST',
        path: '/echo',
        handler: (req, res) => void res.json(req.body),
      }),
    );

    const response = await fetch(`${url}/api/demo/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ nope',
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as Body).error.code).toBe('request.invalidJson');
  });

  it('refuses a body that is bigger than the limit', async () => {
    const { url } = await start(
      (http) =>
        add(http, 'demo', {
          method: 'POST',
          path: '/echo',
          handler: (req, res) => void res.json(req.body),
        }),
      { bodyLimit: '1kb' },
    );

    const response = await fetch(`${url}/api/demo/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(5000) }),
    });

    expect(response.status).toBe(413);
    expect(((await response.json()) as Body).error.code).toBe('request.tooLarge');
  });
});

describe('request log', () => {
  it('writes one line per request with method, path, status and request id, but no query', async () => {
    const { url, lines } = await start((http) =>
      add(http, 'demo', { path: '/hello', handler: (_req, res) => void res.json({}) }),
    );

    const response = await fetch(`${url}/api/demo/hello?token=secret`);
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const [, message, data] = lines.info[lines.info.length - 1] ?? []; // [tag, message, data]
    expect(String(message)).toMatch(/^GET \/api\/demo\/hello 200 \d+ms$/);
    expect(JSON.stringify(lines)).not.toContain('secret');
    expect(data).toEqual({ requestId: response.headers.get('x-request-id') });
  });

  it('warns about client errors and reports server errors as errors', async () => {
    const { url, lines } = await start((http) =>
      add(http, 'demo', {
        path: '/boom',
        handler: () => {
          throw new Error('x');
        },
      }),
    );

    await (await fetch(`${url}/api/nothing`)).text();
    await (await fetch(`${url}/api/demo/boom`)).text();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lines.warn.map((entry) => String(entry[1]))).toContainEqual(
      expect.stringMatching(/^GET \/api\/nothing 404/),
    );
    expect(lines.error.map((entry) => String(entry[1]))).toContainEqual(
      expect.stringMatching(/^GET \/api\/demo\/boom 500/),
    );
  });
});

describe('after the start', () => {
  it('does not accept new routes', async () => {
    const { http } = await start();

    expect(() => add(http, 'late', {})).toThrow('added too late');
  });
});
