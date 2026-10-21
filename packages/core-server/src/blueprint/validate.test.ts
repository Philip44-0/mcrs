import { describe, expect, it } from 'vitest';
import type { ModuleManifest } from '@mcrs/shared';
import { validateConfig, validateManifest, validateModuleConfig } from './validate';

const FILE = '/project/module.json';
const CONFIG = '/project/mcrs.config.json';

const manifest = (overrides: Record<string, unknown> = {}) => ({
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  mcrs: '^1.0.0',
  parts: ['server'],
  ...overrides,
});

describe('validateConfig', () => {
  it('fills in the defaults', () => {
    const { value, errors } = validateConfig(CONFIG, { modules: [] });

    expect(errors).toEqual([]);
    expect(value).toEqual({
      port: 3000,
      dataDir: './data',
      currency: 'EUR',
      mismatchPolicy: 'block',
      modules: [],
    });
  });

  it('refuses a file that is not an object', () => {
    for (const data of [null, [], 'text', 5]) {
      const result = validateConfig(CONFIG, data);

      expect(result.value).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('says which values are allowed when a choice is wrong', () => {
    const { errors } = validateConfig(CONFIG, { modules: [], mismatchPolicy: 'maybe' });

    expect(errors).toEqual([
      expect.objectContaining({
        file: CONFIG,
        path: 'mismatchPolicy',
        message: 'must be one of: "block", "warn"',
      }),
    ]);
  });

  it('names a value that has the wrong format', () => {
    const { errors } = validateConfig(CONFIG, { modules: [], currency: 'euro' });

    expect(errors).toEqual([expect.objectContaining({ path: 'currency' })]);
    expect(errors[0]?.message).toContain('has an invalid format');
  });

  it('does not stumble over a module entry that is not an object, and reports the others', () => {
    const { errors } = validateConfig(CONFIG, {
      modules: ['text', { id: 'a', path: 'x', package: 'y' }],
    });

    expect(errors.map((error) => error.path)).toEqual(['modules[0]', 'modules[1]']);
  });

  it('turns unknown properties into warnings', () => {
    const { value, warnings } = validateConfig(CONFIG, {
      modules: [{ id: 'a', path: 'x', colour: 'red' }],
      theme: 'dark',
    });

    expect(value).not.toBeNull();
    expect(warnings.map((warning) => warning.path).sort()).toEqual(['modules[0].colour', 'theme']);
  });
});

describe('validateManifest', () => {
  it('accepts a complete manifest', () => {
    const result = validateManifest(
      FILE,
      manifest({
        provides: ['x@1', { name: 'o.t@1', multi: true }],
        requires: ['y@1'],
        optional: ['z@1'],
      }),
    );

    expect(result.errors).toEqual([]);
    expect(result.value).not.toBeNull();
  });

  it('refuses something that is not an object', () => {
    for (const data of [null, [], 'text', 5]) {
      const result = validateManifest(FILE, data);

      expect(result.value).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('does not stumble when a field has the wrong type, and still checks the others', () => {
    const { errors } = validateManifest(
      FILE,
      manifest({ version: 1, mcrs: 2, provides: 'x@1', configSchema: 'text' }),
    );

    expect(errors.map((error) => error.path).sort()).toEqual([
      'configSchema',
      'mcrs',
      'provides',
      'version',
    ]);
  });

  it('refuses an mcrs value that is not a semver range', () => {
    const { errors } = validateManifest(FILE, manifest({ mcrs: 'not a range' }));

    expect(errors).toEqual([expect.objectContaining({ path: 'mcrs' })]);
    expect(errors[0]?.message).toContain('is not a semver range');
  });

  it('checks the long form of provides: name, multi and unknown properties', () => {
    const { errors, warnings, value } = validateManifest(
      FILE,
      manifest({ provides: [{ name: 'bad name', multi: 'yes', extra: 1 }] }),
    );

    expect(value).toBeNull();
    expect(errors.map((error) => error.path)).toEqual(['provides[0].name', 'provides[0].multi']);
    expect(warnings.map((warning) => warning.path)).toEqual(['provides[0].extra']);
  });

  it('refuses a configSchema that is not a JSON Schema', () => {
    const { errors } = validateManifest(FILE, manifest({ configSchema: { type: 'nonsense' } }));

    expect(errors).toEqual([expect.objectContaining({ file: FILE, path: 'configSchema' })]);
    expect(errors[0]?.message).toContain('JSON Schema');
  });

  it('accepts a configSchema with keywords it does not know', () => {
    const { errors } = validateManifest(
      FILE,
      manifest({ configSchema: { type: 'object', 'x-note': 'for humans' } }),
    );

    expect(errors).toEqual([]);
  });
});

describe('validateModuleConfig', () => {
  const withSchema = (configSchema: Record<string, unknown>) =>
    manifest({ configSchema }) as unknown as ModuleManifest;

  it('passes a copy of the config on when there is no schema', () => {
    const input = { a: 1 };

    const { value, errors } = validateModuleConfig(
      CONFIG,
      manifest() as unknown as ModuleManifest,
      input,
      'modules[0].config',
    );

    expect(errors).toEqual([]);
    expect(value).toEqual({ a: 1 });
    expect(value).not.toBe(input);
  });

  it('treats a missing config like an empty one and fills in defaults without changing the input', () => {
    const schema = withSchema({
      type: 'object',
      properties: { retries: { type: 'integer', default: 3 } },
    });
    const input = {};

    const { value } = validateModuleConfig(CONFIG, schema, undefined, 'modules[0].config');
    validateModuleConfig(CONFIG, schema, input, 'modules[0].config');

    expect(value).toEqual({ retries: 3 });
    expect(input).toEqual({});
  });

  it('names the setting that is wrong, inside the config file', () => {
    const schema = withSchema({
      type: 'object',
      properties: { retries: { type: 'integer' } },
      required: ['name'],
    });

    const { value, errors } = validateModuleConfig(
      CONFIG,
      schema,
      { retries: 'many' },
      'modules[2].config',
    );

    expect(value).toBeNull();
    expect(errors.map((error) => [error.file, error.path])).toEqual([
      [CONFIG, 'modules[2].config.name'],
      [CONFIG, 'modules[2].config.retries'],
    ]);
  });

  it('only warns about a setting that the schema does not know', () => {
    const schema = withSchema({
      type: 'object',
      properties: { retries: { type: 'integer' } },
      additionalProperties: false,
    });

    const { value, errors, warnings } = validateModuleConfig(
      CONFIG,
      schema,
      { retries: 1, retires: 2 },
      'modules[0].config',
    );

    expect(errors).toEqual([]);
    expect(value).not.toBeNull();
    expect(warnings.map((warning) => warning.path)).toEqual(['modules[0].config.retires']);
  });
});
