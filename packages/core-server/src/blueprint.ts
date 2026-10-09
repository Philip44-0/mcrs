import path from 'node:path';
import type { McrsConfig, ModuleManifest } from '@mcrs/shared';
import type { Problem } from './problems';
import { readJsonFile } from './read-json';
import { validateConfig, validateManifest, validateModuleConfig } from './validate';

export interface LoadedModule {
  id: string;
  /** Absolute path of the module folder. */
  dir: string;
  /** Absolute path of the module's module.json. */
  manifestFile: string;
  manifest: ModuleManifest;
  /** The module's config block, validated, with defaults applied. */
  config: Record<string, unknown>;
}

/** Everything that was read from mcrs.config.json and the module.json files. */
export interface Blueprint {
  configFile: string;
  config: McrsConfig;
  modules: LoadedModule[];
}

export interface BlueprintResult {
  /** The blueprint, or null when there are errors. */
  blueprint: Blueprint | null;
  errors: Problem[];
  warnings: Problem[];
}

/**
 * Reads mcrs.config.json and the module.json of every listed module and validates them.
 * All problems are collected, so the caller can report them in one go.
 */
export async function loadBlueprint(configFile: string): Promise<BlueprintResult> {
  const file = path.resolve(configFile);
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  const read = await readJsonFile(file);
  if (!read.ok) return { blueprint: null, errors: [read.problem], warnings };

  const validated = validateConfig(file, read.value);
  errors.push(...validated.errors);
  warnings.push(...validated.warnings);
  if (validated.value === null) return { blueprint: null, errors, warnings };

  const config = validated.value;
  const baseDir = path.dirname(file);
  const modules: LoadedModule[] = [];

  for (const [index, entry] of config.modules.entries()) {
    const where = `modules[${index}]`;

    if (entry.package !== undefined) {
      errors.push({
        file,
        path: `${where}.package`,
        message:
          'npm package sources are not supported yet (see the issue "Load modules from anywhere")',
      });
      continue;
    }

    const dir = path.resolve(baseDir, entry.path as string);
    const manifestFile = path.join(dir, 'module.json');

    const manifestRead = await readJsonFile(manifestFile);
    if (!manifestRead.ok) {
      const { problem } = manifestRead;
      errors.push({
        ...problem,
        message: `${problem.message} (module "${entry.id}", listed at ${where} in ${path.basename(file)})`,
      });
      continue;
    }

    const manifest = validateManifest(manifestFile, manifestRead.value);
    errors.push(...manifest.errors);
    warnings.push(...manifest.warnings);
    if (manifest.value === null) continue;

    if (manifest.value.id !== entry.id) {
      errors.push({
        file: manifestFile,
        path: 'id',
        message: `is "${manifest.value.id}", but ${path.basename(file)} lists this module as "${entry.id}"`,
      });
      continue;
    }

    const moduleConfig = validateModuleConfig(
      file,
      manifest.value,
      entry.config,
      `${where}.config`,
    );
    errors.push(...moduleConfig.errors);
    warnings.push(...moduleConfig.warnings);
    if (moduleConfig.value === null) continue;

    modules.push({
      id: entry.id,
      dir,
      manifestFile,
      manifest: manifest.value,
      config: moduleConfig.value,
    });
  }

  return {
    blueprint: errors.length === 0 ? { configFile: file, config, modules } : null,
    errors,
    warnings,
  };
}
