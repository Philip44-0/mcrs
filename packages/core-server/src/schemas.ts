import type { SchemaObject } from 'ajv';

/** Module ids: lowercase letters, digits and hyphens. */
export const ID_PATTERN = '^[a-z0-9][a-z0-9-]*$';

/** Capabilities: name@major, for example "storage@1" or "output.target@1". */
export const CAPABILITY_PATTERN = '^[a-z][a-z0-9.-]*@[0-9]+$';

/** JSON Schema for mcrs.config.json. Unknown properties are reported as warnings, not errors. */
export const configSchema: SchemaObject = {
  type: 'object',
  properties: {
    $schema: { type: 'string' },
    port: { type: 'integer', minimum: 1, maximum: 65535, default: 3000 },
    dataDir: { type: 'string', minLength: 1, default: './data' },
    currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'EUR' },
    mismatchPolicy: { enum: ['block', 'warn'], default: 'block' },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: ID_PATTERN },
          path: { type: 'string', minLength: 1 },
          package: { type: 'string', minLength: 1 },
          config: { type: 'object' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  required: ['modules'],
  additionalProperties: false,
};

/** JSON Schema for a module's module.json. Unknown properties are reported as warnings. */
export const manifestSchema: SchemaObject = {
  type: 'object',
  properties: {
    $schema: { type: 'string' },
    id: { type: 'string', pattern: ID_PATTERN },
    name: { type: 'string', minLength: 1 },
    version: { type: 'string' },
    mcrs: { type: 'string' },
    parts: { type: 'array', items: { enum: ['server', 'client'] }, minItems: 1, uniqueItems: true },
    // a capability string, or { "name": "...", "multi": true } (the details are checked in validate.ts)
    provides: { type: 'array', items: { type: ['string', 'object'] } },
    requires: {
      type: 'array',
      items: { type: 'string', pattern: CAPABILITY_PATTERN },
      uniqueItems: true,
    },
    optional: {
      type: 'array',
      items: { type: 'string', pattern: CAPABILITY_PATTERN },
      uniqueItems: true,
    },
    schemaVersion: { type: 'integer', minimum: 1 },
    exportable: { type: 'boolean' },
    configSchema: { type: 'object' },
  },
  required: ['id', 'name', 'version', 'mcrs', 'parts'],
  additionalProperties: false,
};
