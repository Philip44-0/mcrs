import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ModuleEntry } from '@mcrs/shared';

/** Where a module comes from. Used for messages only; nothing else may depend on it. */
export type ModuleSource =
  { kind: 'path'; specifier: string } | { kind: 'package'; specifier: string };

export interface ResolvedModule {
  /** Absolute path of the module folder (links are followed for packages). */
  dir: string;
  source: ModuleSource;
}

export type Resolution =
  | { ok: true; value: ResolvedModule }
  | {
      ok: false;
      /** property of the entry the problem belongs to */ path: string;
      message: string;
    };

/**
 * Finds the folder of a module.
 *
 * - `path` is resolved relative to `baseDir` (the folder of mcrs.config.json); absolute paths work too.
 * - `package` is looked up the way Node does it: in `node_modules` of `baseDir`, then of each parent folder.
 *   Links (for example workspace packages or `npm install <folder>`) are followed.
 */
export async function resolveModuleDir(entry: ModuleEntry, baseDir: string): Promise<Resolution> {
  if (entry.path !== undefined) {
    return {
      ok: true,
      value: {
        dir: path.resolve(baseDir, entry.path),
        source: { kind: 'path', specifier: entry.path },
      },
    };
  }

  const name = entry.package as string;
  const dir = await findPackage(name, baseDir);
  if (dir === null) {
    return {
      ok: false,
      path: 'package',
      message: `package "${name}" was not found in any node_modules folder from ${baseDir} upwards (install it with: npm install ${name})`,
    };
  }
  return { ok: true, value: { dir, source: { kind: 'package', specifier: name } } };
}

async function findPackage(name: string, startDir: string): Promise<string | null> {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (await exists(path.join(candidate, 'package.json'))) return realpath(candidate);

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
