import { existsSync } from 'node:fs';
import path from 'node:path';
import { formatProblem, loadBlueprint } from '@mcrs/core-server';
import { createApp } from './app.js';

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

const { blueprint, errors, warnings } = await loadBlueprint(findConfigFile());

for (const warning of warnings) console.warn(`warning: ${formatProblem(warning)}`);

if (blueprint === null) {
  console.error('MCRS cannot start:');
  for (const error of errors) console.error(`  x ${formatProblem(error)}`);
  process.exit(1);
}

// The environment variable PORT overrides the port from mcrs.config.json.
const raw = process.env.PORT ?? String(blueprint.config.port);
const port = Number.parseInt(raw, 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT: "${raw}"`);
  process.exit(1);
}

createApp().listen(port, (error?: Error) => {
  if (error) {
    console.error(`Cannot listen on port ${port}:`, error.message);
    process.exit(1);
  }
  console.log(
    `MCRS server listening on http://localhost:${port} (${blueprint.modules.length} module(s) loaded)`,
  );
});
