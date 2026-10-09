/** One entry of the `modules` list in mcrs.config.json. Exactly one of `path` or `package` is set. */
export interface ModuleEntry {
  id: string;
  /** Folder of the module, relative to the config file. */
  path?: string;
  /** Name of an npm package that contains the module. */
  package?: string;
  /** Settings of this module, validated against the module's own `configSchema`. */
  config?: Record<string, unknown>;
}

/** The content of mcrs.config.json (after defaults were applied). */
export interface McrsConfig {
  port: number;
  dataDir: string;
  currency: string;
  mismatchPolicy: 'block' | 'warn';
  modules: ModuleEntry[];
}

export type ModulePart = 'server' | 'client';

/** Long form of a provided capability, for example { "name": "output.target@1", "multi": true }. */
export interface CapabilityDescriptor {
  name: string;
  multi?: boolean;
}

/** The content of a module's module.json. */
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  /** Semver range of the skeleton API this module supports. */
  mcrs: string;
  parts: ModulePart[];
  provides?: Array<string | CapabilityDescriptor>;
  requires?: string[];
  optional?: string[];
  schemaVersion?: number;
  exportable?: boolean;
  /** JSON Schema (draft-07) for the module's `config` block. */
  configSchema?: Record<string, unknown>;
}
