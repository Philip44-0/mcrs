import type { AuthUser } from '@mcrs/shared';
import type { RouteAccess } from '../module-api';

export type AccessDecision =
  { allowed: true } | { allowed: false; status: 401 | 403; code: string; message: string };

/** Returns a description of what is wrong with an access rule, or null when it is fine. */
export function validateAccess(access: unknown): string | null {
  if (access === undefined) {
    return 'has no access rule: set "access" to "public", "authenticated" or { roles: [...] }';
  }
  if (access === 'public' || access === 'authenticated') return null;

  if (typeof access === 'object' && access !== null && !Array.isArray(access)) {
    const { roles } = access as { roles?: unknown };
    const others = Object.keys(access).filter((key) => key !== 'roles');
    const rolesFine =
      Array.isArray(roles) &&
      roles.length > 0 &&
      roles.every((role) => typeof role === 'string' && role.length > 0);
    if (rolesFine && others.length === 0) return null;
    return '"access.roles" has to be a list of role names with at least one entry (and nothing else in "access")';
  }
  return `"access" is not valid: ${JSON.stringify(access)}; use "public", "authenticated" or { roles: [...] }`;
}

/** Who may call a route? Everything that is not clearly allowed is denied. */
export function decideAccess(
  access: RouteAccess,
  user: AuthUser | null | undefined,
): AccessDecision {
  if (access === 'public') return { allowed: true };

  if (!user)
    return { allowed: false, status: 401, code: 'auth.required', message: 'You have to log in.' };
  if (access === 'authenticated') return { allowed: true };

  if (typeof access === 'object' && access.roles.some((role) => user.roles.includes(role)))
    return { allowed: true };
  return {
    allowed: false,
    status: 403,
    code: 'auth.forbidden',
    message: 'You are not allowed to do this.',
  };
}
