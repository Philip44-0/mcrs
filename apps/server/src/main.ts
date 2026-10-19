import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  createHttpApp,
  createLogger,
  formatProblem,
  handleShutdownSignals,
  loadBlueprint,
  ModuleHost,
  ModuleRegistry,
  shortFingerprint,
  type AuthProvider,
} from '@mcrs/core-server';

/** MCRS_CONFIG if set, otherwise the first mcrs.config.json found in this or a parent folder. */
function findConfigFile(): string {
  if (process.env.MCRS_CONFIG) return path.resolve(process.env.MCRS_CONFIG);

  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, 'mcrs.config.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve('mcrs.config.json'); // not found: the loader reports it
    dir = parent;
  }
}

const log = createLogger('mcrs');

const { blueprint, errors, warnings } = await loadBlueprint(findConfigFile());

for (const warning of warnings) console.warn(`warning: ${formatProblem(warning)}`);

if (blueprint === null) {
  console.error('MCRS cannot start:');
  for (const error of errors) console.error(`  x ${formatProblem(error)}`);
  process.exit(1);
}

// From here on the list of modules cannot change (changing modules means a restart).
const registry = ModuleRegistry.fromBlueprint(blueprint);

for (const loaded of registry.modules) {
  const from =
    loaded.source.kind === 'package'
      ? `package ${loaded.source.specifier}`
      : `folder ${loaded.source.specifier}`;
  log.info(`module ${loaded.id}@${loaded.manifest.version} (${from})`);
}
log.info(
  `fingerprint ${shortFingerprint(registry.fingerprint)}, client ${shortFingerprint(registry.clientFingerprint)}`,
);

// The HTTP side. Routes that are not public ask the auth module (capability auth@1) who is calling;
// until there is one, only public routes can be reached.
const http = createHttpApp({
  log: createLogger('http'),
  auth: () => host.findCapability<AuthProvider>('auth@1'),
  core: { registry, mismatchPolicy: blueprint.config.mismatchPolicy },
});

// Load, register and start the modules. The storage migrations will run between register and start.
const host = new ModuleHost(registry, {
  dataDir: path.resolve(path.dirname(blueprint.configFile), blueprint.config.dataDir),
  routes: http.routes,
});
try {
  await host.start();
} catch (error) {
  console.error('MCRS cannot start:');
  console.error(`  x ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
http.finish(); // locks the routes, adds the "not found" and error handlers

// The environment variable PORT overrides the port from mcrs.config.json.
const raw = process.env.PORT ?? String(blueprint.config.port);
const port = Number.parseInt(raw, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT: "${raw}"`);
  await host.stop();
  process.exit(1);
}

const server = http.app.listen(port, (error?: Error) => {
  if (error) {
    console.error(`Cannot listen on port ${port}:`, error.message);
    void host.stop().finally(() => process.exit(1));
    return;
  }
  log.info(`listening on http://localhost:${port}`);
});

// Ctrl+C or a stop signal: stop accepting requests, then stop the modules in reverse order.
handleShutdownSignals(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host.stop();
});
