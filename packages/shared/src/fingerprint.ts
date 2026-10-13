import { sha256Hex } from './sha256';

/** Version marker at the start of the hashed text. Changing the algorithm means a new marker. */
export const FINGERPRINT_PREFIX = 'mcrs-fp1\n';

/** What a fingerprint needs to know about a module. */
export interface FingerprintModule {
  id: string;
  version: string;
}

export interface FingerprintInput extends FingerprintModule {
  parts: readonly string[];
}

export interface Fingerprints {
  /** Over all modules. */
  fingerprint: string;
  /** Over the modules that have a client part. */
  clientFingerprint: string;
}

/**
 * The fingerprint of a list of modules: SHA-256 over "mcrs-fp1\n" and the lines "<id>@<version>",
 * sorted by module id, joined with "\n". The order of the input does not matter.
 *
 * Ids are compared code unit by code unit (not locale-aware), so the result is the same on every
 * machine.
 */
export function fingerprintOf(modules: readonly FingerprintModule[]): string {
  const lines = [...modules]
    .sort((a, b) => compare(a.id, b.id) || compare(a.version, b.version))
    .map((module) => `${module.id}@${module.version}`);
  return sha256Hex(FINGERPRINT_PREFIX + lines.join('\n'));
}

/** Both fingerprints of an installation. */
export function computeFingerprints(modules: readonly FingerprintInput[]): Fingerprints {
  return {
    fingerprint: fingerprintOf(modules),
    clientFingerprint: fingerprintOf(modules.filter((module) => module.parts.includes('client'))),
  };
}

/** The first 12 characters, for display. */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint.slice(0, 12);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
