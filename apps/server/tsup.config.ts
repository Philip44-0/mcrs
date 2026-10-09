import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // The workspace packages (@mcrs/*) are TypeScript source, so they are bundled into the output.
  // ajv and semver are only used by those packages, so they are bundled with them.
  // Everything listed in apps/server/package.json (for example express) stays external.
  noExternal: [/^@mcrs\//, 'ajv', 'semver'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
