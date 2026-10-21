import type { LoadedModule } from '../blueprint';
import type { LogSink } from '../common';

export interface FakeModuleOptions {
  version?: string;
  parts?: Array<'server' | 'client'>;
  provides?: Array<string | { name: string; multi?: boolean }>;
  requires?: string[];
  optional?: string[];
  config?: Record<string, unknown>;
}

/** A module as the loader would hand it over, without any files. For tests. */
export function fakeModule(id: string, options: FakeModuleOptions = {}): LoadedModule {
  const { version = '1.0.0', parts = ['server'], config = {}, ...dependencies } = options;
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version, mcrs: '^1.0.0', parts, ...dependencies },
    config,
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

/** A log that swallows everything. */
export const silentSink: LogSink = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * A log that remembers what was written, line by line. Every entry is the list of arguments the
 * logger passed on: the tag (such as "[http]"), then the message, then the data.
 */
export function recordingSink() {
  const lines = {
    debug: [] as unknown[][],
    info: [] as unknown[][],
    warn: [] as unknown[][],
    error: [] as unknown[][],
  };
  const sink: LogSink = {
    debug: (...args: unknown[]) => void lines.debug.push(args),
    info: (...args: unknown[]) => void lines.info.push(args),
    warn: (...args: unknown[]) => void lines.warn.push(args),
    error: (...args: unknown[]) => void lines.error.push(args),
  };
  return { sink, lines };
}
