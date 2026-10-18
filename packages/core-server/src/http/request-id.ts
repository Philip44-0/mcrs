import { randomUUID } from 'node:crypto';

/** Request ids from clients are only trusted when they are short and harmless (they end up in logs). */
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** The id of a request: the one the client sent, if it is safe, otherwise a new one. */
export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
}
