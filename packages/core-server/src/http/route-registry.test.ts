import { describe, expect, it } from 'vitest';
import type { RouteDefinition } from '../module-api';
import { RouteRegistry } from './route-registry';

const route = (overrides: Record<string, unknown> = {}): RouteDefinition =>
  ({
    method: 'GET',
    path: '/items',
    access: 'public',
    handler: () => {},
    ...overrides,
  }) as RouteDefinition;

const registry = () => new RouteRegistry({ auth: () => undefined });

describe('RouteRegistry.add', () => {
  it('accepts routes with all three kinds of access rule', () => {
    const routes = registry();

    expect(() => routes.add(route({ path: '/a', access: 'public' }), 'demo')).not.toThrow();
    expect(() => routes.add(route({ path: '/b', access: 'authenticated' }), 'demo')).not.toThrow();
    expect(() =>
      routes.add(route({ path: '/c', access: { roles: ['admin'] } }), 'demo'),
    ).not.toThrow();
  });

  it('refuses a route without an access rule and names the route and the module', () => {
    const { access: _access, ...withoutAccess } = route();

    expect(() => registry().add(withoutAccess as unknown as RouteDefinition, 'catalog')).toThrow(
      'route GET /items of module "catalog": has no access rule',
    );
  });

  it('refuses a route that is not valid', () => {
    expect(() => registry().add(route({ method: 'TRACE' }), 'demo')).toThrow(
      '"method" has to be one of',
    );
    expect(() => registry().add(route({ path: 'items' }), 'demo')).toThrow(
      '"path" has to start with "/"',
    );
    expect(() => registry().add(route({ handler: undefined }), 'demo')).toThrow(
      '"handler" has to be a function',
    );
  });

  it('refuses the same route twice, but allows it in another module', () => {
    const routes = registry();
    routes.add(route(), 'catalog');

    expect(() => routes.add(route(), 'catalog')).toThrow('registered twice');
    expect(() => routes.add(route(), 'tables')).not.toThrow();
    expect(() => routes.add(route({ method: 'POST' }), 'catalog')).not.toThrow();
  });

  it('refuses routes once it is frozen', () => {
    const routes = registry();
    routes.freeze();

    expect(() => routes.add(route(), 'demo')).toThrow('added too late');
  });

  it('gives each module a view that adds routes for that module', () => {
    const routes = registry();
    const catalog = routes.scoped('catalog');

    catalog.add(route());

    expect(() => routes.add(route(), 'catalog')).toThrow('registered twice');
    expect(() => catalog.add(route({ access: undefined }))).toThrow('module "catalog"');
  });
});
