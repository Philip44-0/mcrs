import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoadedModule } from './blueprint';
import type { ServerModule } from './context';

/**
 * Where the server part of a module lives, in the order they are tried:
 * built JavaScript first, TypeScript source last (that needs a runtime that can run it, such as `tsx`).
 */
export const SERVER_ENTRY_CANDIDATES = [
  'server/index.js',
  'server/index.mjs',
  'server/index.ts',
] as const;

export async function findServerEntry(dir: string): Promise<string | null> {
  for (const candidate of SERVER_ENTRY_CANDIDATES) {
    const file = path.join(dir, candidate);
    try {
      await access(file);
      return file;
    } catch {
      // try the next one
    }
  }
  return null;
}

/**
 * Imports the server part of a module. Returns null for modules that have none (client-only).
 * The entry exports the module as default export, or as named exports `register`, `start`, `stop`.
 */
export async function loadServerModule(loaded: LoadedModule): Promise<ServerModule | null> {
  if (!loaded.manifest.parts.includes('server')) return null;

  const entry = await findServerEntry(loaded.dir);
  if (entry === null) {
    throw new Error(
      `no server entry found (looked for ${SERVER_ENTRY_CANDIDATES.join(', ')} in ${loaded.dir})`,
    );
  }

  const imported = (await import(/* @vite-ignore */ pathToFileURL(entry).href)) as Record<
    string,
    unknown
  >;
  const candidate = (imported.default ?? imported) as Partial<ServerModule>;
  if (typeof candidate.register !== 'function') {
    throw new Error(
      `${path.basename(entry)} has to export a register() function (as default export or as named export)`,
    );
  }
  return candidate as ServerModule;
}
