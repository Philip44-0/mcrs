import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBlueprint } from './blueprint';

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

/** Writes the given files (objects become JSON) into a temporary folder; returns the config path. */
async function project(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mcrs-test-'));
  folders.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return path.join(root, 'mcrs.config.json');
}

const manifest = (overrides: Record<string, unknown> = {}) => ({
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  mcrs: '^1.0.0',
  parts: ['server'],
  ...overrides,
});

const demoEntry = (extra: Record<string, unknown> = {}) => ({
  id: 'demo',
  path: 'modules/demo',
  ...extra,
});

describe('loadBlueprint', () => {
  it('loads a valid blueprint and fills in defaults', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry({ config: {} })] },
      'modules/demo/module.json': manifest({
        configSchema: { type: 'object', properties: { retries: { type: 'integer', default: 3 } } },
      }),
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toEqual([]);
    expect(result.blueprint?.config.port).toBe(3000);
    expect(result.blueprint?.config.mismatchPolicy).toBe('block');
    expect(result.blueprint?.modules[0]?.config).toEqual({ retries: 3 });
  });

  it('reports a missing config file', async () => {
    const result = await loadBlueprint(
      path.join(tmpdir(), 'mcrs-does-not-exist', 'mcrs.config.json'),
    );

    expect(result.blueprint).toBeNull();
    expect(result.errors[0]?.message).toContain('file not found');
  });

  it('reports invalid JSON with the file name', async () => {
    const config = await project({ 'mcrs.config.json': '{ "modules": [ }' });

    const result = await loadBlueprint(config);

    expect(result.blueprint).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe(config);
    expect(result.errors[0]?.message).toContain('invalid JSON');
  });

  it('names the property path of a missing required property', async () => {
    const config = await project({ 'mcrs.config.json': { port: 4000 } });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: config, path: 'modules', message: 'is required' }),
    );
  });

  it('names the property path of a wrong value', async () => {
    const config = await project({
      'mcrs.config.json': { port: 'abc', modules: [{ id: 'Not Valid', path: 'x' }] },
    });

    const result = await loadBlueprint(config);
    const paths = result.errors.map((error) => error.path);

    expect(paths).toContain('port');
    expect(paths).toContain('modules[0].id');
  });

  it('warns about unknown properties instead of failing', async () => {
    const config = await project({ 'mcrs.config.json': { modules: [], colour: 'red' } });

    const result = await loadBlueprint(config);

    expect(result.errors).toEqual([]);
    expect(result.blueprint).not.toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({ path: 'colour' }));
  });

  it('requires exactly one of path and package', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [{ id: 'demo', path: 'x', package: 'y' }] },
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'modules[0]' }));
    expect(result.errors[0]?.message).toContain('exactly one');
  });

  it('reports structure errors and rule violations in one run', async () => {
    const config = await project({
      'mcrs.config.json': {
        port: 'abc',
        modules: [
          { id: 'demo', path: 'modules/a' },
          { id: 'demo', path: 'modules/b' },
        ],
      },
    });

    const result = await loadBlueprint(config);

    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['port', 'modules[1].id']),
    );
  });

  it('rejects duplicate module ids', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry(), { id: 'demo', path: 'modules/other' }] },
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'modules[1].id' }));
  });

  it('reports a missing module.json with the module it belongs to', async () => {
    const config = await project({ 'mcrs.config.json': { modules: [demoEntry()] } });

    const result = await loadBlueprint(config);

    expect(result.errors[0]?.file).toContain('module.json');
    expect(result.errors[0]?.message).toContain('file not found');
    expect(result.errors[0]?.message).toContain('modules[0]');
  });

  it('names file and path of an invalid manifest', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry()] },
      'modules/demo/module.json': manifest({ id: 'Demo Module', version: '1' }),
    });

    const result = await loadBlueprint(config);

    expect(result.blueprint).toBeNull();
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['id', 'version']),
    );
    expect(result.errors.every((error) => error.file.endsWith('module.json'))).toBe(true);
  });

  it('rejects a manifest id that differs from the config', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry()] },
      'modules/demo/module.json': manifest({ id: 'other' }),
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'id' }));
    expect(result.errors[0]?.message).toContain('other');
  });

  it('rejects a module that needs a different skeleton API', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry()] },
      'modules/demo/module.json': manifest({ mcrs: '^2.0.0' }),
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'mcrs' }));
    expect(result.errors[0]?.message).toContain('skeleton API');
  });

  it('checks the config block against the module configSchema', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry({ config: { retries: 'many' } })] },
      'modules/demo/module.json': manifest({
        configSchema: { type: 'object', properties: { retries: { type: 'integer' } } },
      }),
    });

    const result = await loadBlueprint(config);

    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: config, path: 'modules[0].config.retries' }),
    );
  });

  it('accepts provides in both forms and rejects bad capabilities', async () => {
    const config = await project({
      'mcrs.config.json': { modules: [demoEntry()] },
      'modules/demo/module.json': manifest({
        provides: ['stock@1', { name: 'output.target@1', multi: true }, 'nonsense'],
      }),
    });

    const result = await loadBlueprint(config);

    expect(result.errors.map((error) => error.path)).toEqual(['provides[2]']);
  });
});
