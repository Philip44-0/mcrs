import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import { findServerEntry, loadServerModule } from './load-module';

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

/** A module folder with the given files; returns the module. */
async function moduleWith(
  files: Record<string, string>,
  parts: Array<'server' | 'client'> = ['server'],
): Promise<LoadedModule> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mcrs-module-'));
  folders.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return {
    id: 'demo',
    dir,
    manifestFile: path.join(dir, 'module.json'),
    manifest: { id: 'demo', name: 'Demo', version: '1.0.0', mcrs: '^1.0.0', parts },
    config: {},
    source: { kind: 'path', specifier: dir },
  };
}

describe('loadServerModule', () => {
  it('returns null for a module without a server part', async () => {
    const loaded = await moduleWith({}, ['client']);

    expect(await loadServerModule(loaded)).toBeNull();
  });

  it('loads a module that is the default export', async () => {
    const loaded = await moduleWith({
      'server/index.mjs': 'export default { register() { return "registered"; } };',
    });

    const implementation = await loadServerModule(loaded);

    expect(implementation?.register({} as never)).toBe('registered');
  });

  it('loads a module that uses named exports', async () => {
    const loaded = await moduleWith({
      'server/index.mjs':
        'export function register() { return "named"; } export function stop() {}',
    });

    const implementation = await loadServerModule(loaded);

    expect(implementation?.register({} as never)).toBe('named');
    expect(typeof implementation?.stop).toBe('function');
  });

  it('tells where it looked when there is no server entry', async () => {
    const loaded = await moduleWith({});

    await expect(loadServerModule(loaded)).rejects.toThrow(
      'no server entry found (looked for server/index.js, server/index.mjs, server/index.ts',
    );
  });

  it('complains when register() is missing', async () => {
    const loaded = await moduleWith({ 'server/index.mjs': 'export default { start() {} };' });

    await expect(loadServerModule(loaded)).rejects.toThrow('has to export a register() function');
  });
});

describe('findServerEntry', () => {
  it('prefers built JavaScript over TypeScript source', async () => {
    const loaded = await moduleWith({ 'server/index.ts': '', 'server/index.js': '' });

    expect(await findServerEntry(loaded.dir)).toBe(path.join(loaded.dir, 'server/index.js'));
  });

  it('finds TypeScript source when nothing else exists', async () => {
    const loaded = await moduleWith({ 'server/index.ts': '' });

    expect(await findServerEntry(loaded.dir)).toBe(path.join(loaded.dir, 'server/index.ts'));
  });
});
