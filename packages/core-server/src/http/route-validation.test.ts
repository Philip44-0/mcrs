import { describe, expect, it } from 'vitest';
import { validateRoute } from './route-validation';

const route = { method: 'GET', path: '/items/:id', access: 'public', handler: () => {} };

describe('validateRoute', () => {
  it('accepts a complete route', () => {
    expect(validateRoute(route)).toEqual([]);
    expect(validateRoute({ ...route, path: '/', access: { roles: ['admin'] } })).toEqual([]);
  });

  it('refuses a route without an access rule', () => {
    const { access: _access, ...withoutAccess } = route;

    const problems = validateRoute(withoutAccess);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('has no access rule');
  });

  it('refuses unknown methods', () => {
    expect(validateRoute({ ...route, method: 'TRACE' })).toHaveLength(1);
    expect(validateRoute({ ...route, method: 'get' })).toHaveLength(1);
  });

  it('refuses paths that are not safe', () => {
    for (const path of ['items', '/a b', '/a?x=1', '/a#b', '/../x', '/a//b', '', undefined, 5]) {
      expect(validateRoute({ ...route, path })).toHaveLength(1);
    }
  });

  it('refuses a handler that is not a function', () => {
    expect(validateRoute({ ...route, handler: 'x' })).toHaveLength(1);
  });

  it('reports every problem at once', () => {
    expect(validateRoute({ method: 'NOPE', path: 'x' })).toHaveLength(4);
    expect(validateRoute(null)).toHaveLength(1);
  });
});
