import {
  fingerprintOf,
  type HandshakeRequest,
  type HandshakeResponse,
  type ModuleVersion,
} from '@mcrs/shared';
import { CORE_API_MAJOR } from '../common';
import type { ModuleRegistry } from '../registry';
import { compareModules, isSame } from './compare';

type RegistryView = Pick<ModuleRegistry, 'modules' | 'fingerprint' | 'clientFingerprint'>;

/** The modules that have a client part: the ones a client build has to contain. */
export function clientModulesOf(registry: Pick<ModuleRegistry, 'modules'>): ModuleVersion[] {
  return registry.modules
    .filter((module) => module.manifest.parts.includes('client'))
    .map((module) => ({ id: module.id, version: module.manifest.version }));
}

/**
 * Compares what a client says it contains with what the server expects.
 * Server-only modules never show up in the answer (only a fingerprint over all modules does).
 */
export function performHandshake(
  registry: RegistryView,
  policy: HandshakeResponse['policy'],
  request: HandshakeRequest,
): HandshakeResponse {
  const diff = compareModules(clientModulesOf(registry), request.modules);
  const clientFingerprint = fingerprintOf(request.modules);
  const apiMatches = request.clientApi === CORE_API_MAJOR;

  return {
    compatible: apiMatches && clientFingerprint === registry.clientFingerprint && isSame(diff),
    policy,
    api: { server: CORE_API_MAJOR, client: request.clientApi },
    server: { fingerprint: registry.fingerprint, clientFingerprint: registry.clientFingerprint },
    client: { clientFingerprint },
    diff,
  };
}
