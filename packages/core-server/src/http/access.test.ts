import { describe, expect, it } from 'vitest';
import { decideAccess, validateAccess } from './access';

const waiter = { id: '1', username: 'anna', displayName: 'Anna', roles: ['waiter'] };
const admin = { id: '2', username: 'ben', displayName: 'Ben', roles: ['admin', 'waiter'] };

describe('decideAccess', () => {
  it('lets everybody use a public route', () => {
    expect(decideAccess('public', null)).toEqual({ allowed: true });
    expect(decideAccess('public', waiter)).toEqual({ allowed: true });
  });

  it('asks anonymous callers to log in', () => {
    expect(decideAccess('authenticated', null)).toEqual({
      allowed: false,
      status: 401,
      code: 'auth.required',
      message: 'You have to log in.',
    });
    expect(decideAccess({ roles: ['admin'] }, undefined)).toEqual(
      expect.objectContaining({ allowed: false, status: 401 }),
    );
  });

  it('lets every logged-in user use an authenticated route', () => {
    expect(decideAccess('authenticated', waiter)).toEqual({ allowed: true });
  });

  it('checks the roles', () => {
    expect(decideAccess({ roles: ['admin'] }, waiter)).toEqual({
      allowed: false,
      status: 403,
      code: 'auth.forbidden',
      message: 'You are not allowed to do this.',
    });
    expect(decideAccess({ roles: ['admin'] }, admin)).toEqual({ allowed: true });
  });

  it('lets a user in who has any one of the roles', () => {
    expect(decideAccess({ roles: ['admin', 'waiter'] }, waiter)).toEqual({ allowed: true });
  });
});

describe('validateAccess', () => {
  it('accepts the three kinds of rule', () => {
    expect(validateAccess('public')).toBeNull();
    expect(validateAccess('authenticated')).toBeNull();
    expect(validateAccess({ roles: ['admin'] })).toBeNull();
  });

  it('asks for a rule when there is none', () => {
    expect(validateAccess(undefined)).toContain('has no access rule');
  });

  it('rejects everything else, so a typo never makes a route public', () => {
    for (const access of [
      'Public',
      'everyone',
      '',
      null,
      42,
      [],
      {},
      { roles: [] },
      { roles: [''] },
      { roles: 'admin' },
      { roles: ['admin'], extra: true },
    ]) {
      expect(validateAccess(access)).not.toBeNull();
    }
  });
});
