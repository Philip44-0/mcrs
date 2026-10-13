import { describe, expect, it } from 'vitest';
import type { LoadedModule } from './blueprint';
import { planModules } from './plan';

type Deps = {
  provides?: Array<string | { name: string; multi?: boolean }>;
  requires?: string[];
  optional?: string[];
};

function mod(id: string, deps: Deps = {}): LoadedModule {
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version: '1.0.0', mcrs: '^1.0.0', parts: ['server'], ...deps },
    config: {},
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

const ids = (modules: LoadedModule[]) => modules.map((module) => module.id);

describe('planModules', () => {
  it('starts providers before the modules that need them', () => {
    const plan = planModules([
      mod('stock', { requires: ['catalog@1'] }),
      mod('catalog', { provides: ['catalog@1'] }),
    ]);

    expect(plan.errors).toEqual([]);
    expect(ids(plan.order)).toEqual(['catalog', 'stock']);
  });

  it('keeps the config order for modules without a relation', () => {
    const plan = planModules([mod('c'), mod('a'), mod('b')]);

    expect(ids(plan.order)).toEqual(['c', 'a', 'b']);
  });

  it('orders a longer chain', () => {
    const plan = planModules([
      mod('orders', { provides: ['orders@1'], requires: ['catalog@1', 'storage@1'] }),
      mod('catalog', { provides: ['catalog@1'], requires: ['storage@1'] }),
      mod('storage', { provides: ['storage@1'] }),
    ]);

    expect(ids(plan.order)).toEqual(['storage', 'catalog', 'orders']);
  });

  it('lists the providers of every capability', () => {
    const plan = planModules([
      mod('storage', { provides: ['storage@1'] }),
      mod('auth', { provides: ['auth@1'] }),
    ]);

    expect(plan.capabilities.get('storage@1')).toEqual(['storage']);
    expect(plan.capabilities.get('auth@1')).toEqual(['auth']);
  });

  it('reports a requirement that nobody provides', () => {
    const plan = planModules([mod('stock', { requires: ['orders@1', 'catalog@1'] })]);

    expect(plan.order).toEqual([]);
    expect(plan.errors).toHaveLength(2);
    expect(plan.errors[1]).toEqual(
      expect.objectContaining({ file: '/modules/stock/module.json', path: 'requires[1]' }),
    );
    expect(plan.errors[1]?.message).toContain('"catalog@1"');
  });

  it('points out a provider with another major version', () => {
    const plan = planModules([
      mod('stock', { requires: ['catalog@1'] }),
      mod('catalog-v2', { provides: ['catalog@2'] }),
    ]);

    expect(plan.errors[0]?.message).toContain('catalog@2 from catalog-v2');
  });

  it('allows only one provider of a capability', () => {
    const plan = planModules([
      mod('sqlite', { provides: ['storage@1'] }),
      mod('postgres', { provides: ['storage@1'] }),
    ]);

    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toEqual(
      expect.objectContaining({ file: '/modules/postgres/module.json', path: 'provides[0]' }),
    );
    expect(plan.errors[0]?.message).toContain('"sqlite"');
  });

  it('allows several providers when all declare the capability as multi', () => {
    const target = { name: 'output.target@1', multi: true };
    const plan = planModules([
      mod('printer', { provides: [target] }),
      mod('display', { provides: [target] }),
    ]);

    expect(plan.errors).toEqual([]);
    expect(plan.capabilities.get('output.target@1')).toEqual(['printer', 'display']);
  });

  it('rejects a capability that is multi for one provider and single for another', () => {
    const plan = planModules([
      mod('printer', { provides: [{ name: 'output.target@1', multi: true }] }),
      mod('display', { provides: ['output.target@1'] }),
    ]);

    expect(plan.errors).toHaveLength(1);
  });

  it('reports a dependency cycle with its path', () => {
    const plan = planModules([
      mod('a', { provides: ['x@1'], requires: ['y@1'] }),
      mod('b', { provides: ['y@1'], requires: ['x@1'] }),
    ]);

    expect(plan.order).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]?.message).toContain('a -> b -> a');
  });

  it('reports a longer cycle once', () => {
    const plan = planModules([
      mod('a', { provides: ['a@1'], requires: ['c@1'] }),
      mod('b', { provides: ['b@1'], requires: ['a@1'] }),
      mod('c', { provides: ['c@1'], requires: ['b@1'] }),
      mod('d', { requires: ['a@1'] }),
    ]);

    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]?.message).toContain('a -> c -> b -> a');
  });

  it('does not treat a module that needs its own capability as a cycle', () => {
    const plan = planModules([mod('a', { provides: ['x@1'], requires: ['x@1'] })]);

    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toHaveLength(1);
    expect(ids(plan.order)).toEqual(['a']);
  });

  it('is not stopped by an optional dependency that is missing', () => {
    const plan = planModules([mod('stock', { optional: ['live@1'] })]);

    expect(plan.errors).toEqual([]);
    expect(ids(plan.order)).toEqual(['stock']);
  });

  it('starts the provider of an optional dependency first when it is present', () => {
    const plan = planModules([
      mod('stock', { optional: ['live@1'] }),
      mod('live', { provides: ['live@1'] }),
    ]);

    expect(plan.errors).toEqual([]);
    expect(ids(plan.order)).toEqual(['live', 'stock']);
  });

  it('ignores an optional dependency that would close a cycle', () => {
    const plan = planModules([
      mod('a', { provides: ['x@1'], requires: ['y@1'] }),
      mod('b', { provides: ['y@1'], optional: ['x@1'] }),
    ]);

    expect(plan.errors).toEqual([]);
    expect(ids(plan.order)).toEqual(['b', 'a']);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]?.message).toContain('would create a dependency cycle');
  });

  it('reports all kinds of problems together', () => {
    const plan = planModules([
      mod('a', { requires: ['missing@1'] }),
      mod('b', { provides: ['dup@1'] }),
      mod('c', { provides: ['dup@1'] }),
      mod('d', { provides: ['d@1'], requires: ['e@1'] }),
      mod('e', { provides: ['e@1'], requires: ['d@1'] }),
    ]);

    const messages = plan.errors.map((error) => error.message).join('\n');
    expect(plan.errors).toHaveLength(3);
    expect(messages).toContain('"missing@1"');
    expect(messages).toContain('"dup@1"');
    expect(messages).toContain('dependency cycle');
  });
});
