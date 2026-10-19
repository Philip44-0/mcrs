import { ApiError, type HandshakeResponse } from '@mcrs/shared';
import { shortFingerprint } from '@mcrs/shared';
import type { Logger } from '../common';
import { parseHandshake, performHandshake } from '../handshake';
import type { ModuleRegistry } from '../registry';
import type { RouteRegistry } from './route-registry';

/** What the core routes need to report the installed modules. */
export interface CoreInfo {
  registry: Pick<ModuleRegistry, 'modules' | 'fingerprint' | 'clientFingerprint'>;
  mismatchPolicy: HandshakeResponse['policy'];
}

const MAX_REMEMBERED = 100;

/** The routes of the core itself, under /api/_core: health and (with module information) handshake. */
export function addCoreRoutes(
  routes: RouteRegistry,
  options: { log: Logger; core?: CoreInfo },
): void {
  const { log, core } = options;

  routes.add(
    {
      method: 'GET',
      path: '/health',
      access: 'public',
      handler: (_request, response) => {
        response.json({
          status: 'ok',
          uptimeSeconds: Math.round(process.uptime()),
          time: new Date().toISOString(),
          ...(core === undefined
            ? {}
            : {
                fingerprint: core.registry.fingerprint,
                clientFingerprint: core.registry.clientFingerprint,
              }),
        });
      },
    },
    '_core',
  );

  if (core === undefined) return;

  // A client that does not match is typically a phone with an old version of the app, and it asks
  // again on every reload. Each distinct mismatch is reported once as a warning, the repeats quietly.
  const reported = new Set<string>();

  routes.add(
    {
      method: 'POST',
      path: '/handshake',
      access: 'public',
      handler: (request, response) => {
        const parsed = parseHandshake(request.body);
        if (!parsed.ok) {
          throw new ApiError(400, 'handshake.invalid', 'The handshake request is not valid.', {
            problems: parsed.problems,
          });
        }

        const result = performHandshake(core.registry, core.mismatchPolicy, parsed);

        if (!result.compatible) {
          const key = `${result.api.client}/${result.client.clientFingerprint}`;
          const first = !reported.has(key);
          if (first && reported.size < MAX_REMEMBERED) reported.add(key);

          const message =
            `a client does not match the server (client fingerprint ${shortFingerprint(result.client.clientFingerprint)}, ` +
            `server ${shortFingerprint(result.server.clientFingerprint)}, api ${result.api.client} / ${result.api.server})`;
          const data = {
            serverClientFingerprint: result.server.clientFingerprint,
            clientClientFingerprint: result.client.clientFingerprint,
            diff: result.diff,
            requestId: response.locals.requestId as string | undefined,
          };
          if (first) log.warn(message, data);
          else log.debug(message, data);
        }

        response.json(result);
      },
    },
    '_core',
  );
}
