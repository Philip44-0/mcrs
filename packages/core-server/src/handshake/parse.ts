import type { HandshakeRequest } from '@mcrs/shared';

const MAX_MODULES = 200;
const MAX_PROBLEMS = 20;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,64}$/;
const API = /^[0-9]{1,3}$/;

export type ParsedHandshake = ({ ok: true } & HandshakeRequest) | { ok: false; problems: string[] };

/**
 * Checks the body of a handshake request. The endpoint is public, so everything is limited: the
 * number of modules, and what an id or a version may look like.
 */
export function parseHandshake(body: unknown): ParsedHandshake {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, problems: ['the body has to be an object with "clientApi" and "modules"'] };
  }
  const { clientApi, modules } = body as { clientApi?: unknown; modules?: unknown };
  const problems: string[] = [];

  if (typeof clientApi !== 'string' || !API.test(clientApi))
    problems.push('"clientApi" has to be a number as text, for example "1"');

  const accepted: HandshakeRequest['modules'] = [];
  if (!Array.isArray(modules)) {
    problems.push('"modules" has to be a list');
  } else if (modules.length > MAX_MODULES) {
    problems.push(`"modules" can have at most ${MAX_MODULES} entries`);
  } else {
    const seen = new Set<string>();
    modules.forEach((item: unknown, index) => {
      const entry = (typeof item === 'object' && item !== null ? item : {}) as {
        id?: unknown;
        version?: unknown;
      };
      const where = `modules[${index}]`;
      if (typeof entry.id !== 'string' || !ID.test(entry.id)) {
        problems.push(`${where}.id is not a module id`);
        return;
      }
      if (typeof entry.version !== 'string' || !VERSION.test(entry.version)) {
        problems.push(`${where}.version is not a version`);
        return;
      }
      if (seen.has(entry.id)) {
        problems.push(`${where}.id "${entry.id}" is listed twice`);
        return;
      }
      seen.add(entry.id);
      accepted.push({ id: entry.id, version: entry.version });
    });
  }

  if (problems.length > 0) return { ok: false, problems: problems.slice(0, MAX_PROBLEMS) };
  return { ok: true, clientApi: clientApi as string, modules: accepted };
}
