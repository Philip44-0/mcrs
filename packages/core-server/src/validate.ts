import Ajv from 'ajv';
import type { ErrorObject, SchemaObject } from 'ajv';
import semver from 'semver';
import type { McrsConfig, ModuleEntry, ModuleManifest } from '@mcrs/shared';
import { pointerToPath, type Problem } from './problems';
import { CAPABILITY_PATTERN, configSchema, manifestSchema } from './schemas';

/** The version of the skeleton API. A module's `mcrs` range has to include it. */
export const CORE_API_VERSION = '1.0.0';

export interface Validation<T> {
  /** The validated value, or null when there are errors. */
  value: T | null;
  errors: Problem[];
  warnings: Problem[];
}

type Found = { errors: Problem[]; warnings: Problem[] };

// Our own schemas: strict, and defaults are filled in.
const own = new Ajv({ allErrors: true, useDefaults: true, allowUnionTypes: true });
const checkConfigFile = own.compile(configSchema);
const checkManifest = own.compile(manifestSchema);

// Schemas written by module authors: lenient, so unusual keywords do not stop the server.
const lenient = new Ajv({ allErrors: true, useDefaults: true, strict: false });

const capabilityRegex = new RegExp(CAPABILITY_PATTERN);

const join = (base: string, rest: string): string =>
  base && rest ? `${base}.${rest}` : base || rest;

/** Turns Ajv errors into problems. Unknown properties become warnings, everything else errors. */
function collect(
  file: string,
  ajvErrors: ErrorObject[] | null | undefined,
  basePath: string,
  into: Found,
): void {
  for (const e of ajvErrors ?? []) {
    const here = join(basePath, pointerToPath(e.instancePath));

    if (e.keyword === 'additionalProperties') {
      const property = String(e.params.additionalProperty);
      into.warnings.push({
        file,
        path: join(here, property),
        message: `unknown property "${property}" (ignored)`,
      });
    } else if (e.keyword === 'required') {
      into.errors.push({
        file,
        path: join(here, String(e.params.missingProperty)),
        message: 'is required',
      });
    } else if (e.keyword === 'enum') {
      const allowed = (e.params.allowedValues as unknown[])
        .map((value) => JSON.stringify(value))
        .join(', ');
      into.errors.push({ file, path: here, message: `must be one of: ${allowed}` });
    } else if (e.keyword === 'pattern') {
      into.errors.push({
        file,
        path: here,
        message: `has an invalid format (must match ${String(e.params.pattern)})`,
      });
    } else {
      into.errors.push({ file, path: here, message: e.message ?? 'is invalid' });
    }
  }
}

/**
 * Checks mcrs.config.json: structure first, then rules a schema cannot express. Both are reported
 * together, so that one run shows everything that has to be fixed.
 */
export function validateConfig(file: string, data: unknown): Validation<McrsConfig> {
  const found: Found = { errors: [], warnings: [] };

  if (!checkConfigFile(data)) collect(file, checkConfigFile.errors, '', found);

  const modules = (data as { modules?: unknown } | null)?.modules;
  if (Array.isArray(modules)) {
    const firstIndex = new Map<string, number>();

    modules.forEach((item: unknown, index) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return; // the schema reports it
      const entry = item as Partial<ModuleEntry>;
      const where = `modules[${index}]`;

      if (typeof entry.id === 'string') {
        const earlier = firstIndex.get(entry.id);
        if (earlier === undefined) {
          firstIndex.set(entry.id, index);
        } else {
          found.errors.push({
            file,
            path: `${where}.id`,
            message: `duplicate module id "${entry.id}" (already used by modules[${earlier}])`,
          });
        }
      }

      const sources = [entry.path, entry.package].filter((source) => source !== undefined).length;
      if (sources !== 1) {
        found.errors.push({
          file,
          path: where,
          message: `must have exactly one of "path" or "package" (found ${sources === 0 ? 'neither' : 'both'})`,
        });
      }
    });
  }

  return { value: found.errors.length === 0 ? (data as McrsConfig) : null, ...found };
}

/**
 * Checks a module.json: structure first, then versions, capabilities and the config schema. Both
 * are reported together; a rule is skipped only when the value it checks has the wrong type.
 */
export function validateManifest(file: string, data: unknown): Validation<ModuleManifest> {
  const found: Found = { errors: [], warnings: [] };
  const { errors, warnings } = found;

  if (!checkManifest(data)) collect(file, checkManifest.errors, '', found);
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { value: null, ...found };

  const manifest = data as Partial<ModuleManifest>;

  if (typeof manifest.version === 'string' && semver.valid(manifest.version) !== manifest.version) {
    errors.push({
      file,
      path: 'version',
      message: `"${manifest.version}" is not a semantic version (for example 1.0.0)`,
    });
  }

  if (typeof manifest.mcrs === 'string') {
    if (semver.validRange(manifest.mcrs) === null) {
      errors.push({
        file,
        path: 'mcrs',
        message: `"${manifest.mcrs}" is not a semver range (for example ^1.0.0)`,
      });
    } else if (!semver.satisfies(CORE_API_VERSION, manifest.mcrs)) {
      errors.push({
        file,
        path: 'mcrs',
        message: `needs skeleton API "${manifest.mcrs}", but this server provides ${CORE_API_VERSION}`,
      });
    }
  }

  if (Array.isArray(manifest.provides)) {
    manifest.provides.forEach((item: unknown, index) => {
      const where = `provides[${index}]`;
      if (typeof item === 'string') {
        if (!capabilityRegex.test(item)) {
          errors.push({
            file,
            path: where,
            message: `"${item}" is not a capability (expected name@major, for example "stock@1")`,
          });
        }
        return;
      }
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return; // the schema reports it

      const { name, multi, ...rest } = item as Record<string, unknown>;
      if (typeof name !== 'string' || !capabilityRegex.test(name)) {
        errors.push({
          file,
          path: `${where}.name`,
          message: 'must be a capability such as "output.target@1"',
        });
      }
      if (multi !== undefined && typeof multi !== 'boolean') {
        errors.push({ file, path: `${where}.multi`, message: 'must be true or false' });
      }
      for (const key of Object.keys(rest)) {
        warnings.push({
          file,
          path: `${where}.${key}`,
          message: `unknown property "${key}" (ignored)`,
        });
      }
    });
  }

  const configSchemaValue = manifest.configSchema as unknown;
  if (
    typeof configSchemaValue === 'object' &&
    configSchemaValue !== null &&
    !Array.isArray(configSchemaValue)
  ) {
    try {
      if (!lenient.validateSchema(configSchemaValue as SchemaObject)) {
        errors.push({
          file,
          path: 'configSchema',
          message: `is not a valid JSON Schema: ${lenient.errorsText(lenient.errors)}`,
        });
      }
    } catch (error) {
      errors.push({
        file,
        path: 'configSchema',
        message: `cannot be used as a JSON Schema: ${(error as Error).message}`,
      });
    }
  }

  return { value: errors.length === 0 ? (data as ModuleManifest) : null, ...found };
}

/**
 * Checks the `config` block of a module entry against the module's own configSchema and fills in
 * the defaults. `file` is the file the block lives in (mcrs.config.json), `basePath` its location.
 */
export function validateModuleConfig(
  file: string,
  manifest: ModuleManifest,
  config: Record<string, unknown> | undefined,
  basePath: string,
): Validation<Record<string, unknown>> {
  const found: Found = { errors: [], warnings: [] };
  const value = structuredClone(config ?? {});

  if (manifest.configSchema !== undefined) {
    try {
      const check = lenient.compile(manifest.configSchema as SchemaObject);
      if (!check(value)) collect(file, check.errors, basePath, found);
    } catch (error) {
      found.errors.push({
        file,
        path: basePath,
        message: `cannot be checked against the configSchema of "${manifest.id}": ${(error as Error).message}`,
      });
    }
  }

  return { value: found.errors.length === 0 ? value : null, ...found };
}
