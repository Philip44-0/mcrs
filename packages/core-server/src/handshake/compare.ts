import type { ModuleDiff, ModuleVersion } from '@mcrs/shared';

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What differs between the client modules of the server and the modules a client says it has. */
export function compareModules(
  server: readonly ModuleVersion[],
  client: readonly ModuleVersion[],
): ModuleDiff {
  const serverVersions = new Map(server.map((module) => [module.id, module.version]));
  const clientVersions = new Map(client.map((module) => [module.id, module.version]));

  return {
    missingOnClient: server
      .filter((module) => !clientVersions.has(module.id))
      .map((module) => `${module.id}@${module.version}`)
      .sort(byText),
    missingOnServer: client
      .filter((module) => !serverVersions.has(module.id))
      .map((module) => `${module.id}@${module.version}`)
      .sort(byText),
    versionMismatch: server
      .filter(
        (module) =>
          clientVersions.has(module.id) && clientVersions.get(module.id) !== module.version,
      )
      .map((module) => ({
        id: module.id,
        server: module.version,
        client: clientVersions.get(module.id) as string,
      }))
      .sort((a, b) => byText(a.id, b.id)),
  };
}

export function isSame(diff: ModuleDiff): boolean {
  return (
    diff.missingOnClient.length === 0 &&
    diff.missingOnServer.length === 0 &&
    diff.versionMismatch.length === 0
  );
}
