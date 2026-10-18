/** A logged-in user, as the auth module reports it. */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}

/**
 * The contract of the `auth@1` capability. The route registry asks it who a request belongs to.
 * The roles of a route are checked against `AuthUser.roles`.
 */
export interface AuthProvider {
  /** The user a request belongs to, or null when nobody is logged in. May look at the database. */
  user(request: unknown): AuthUser | null | Promise<AuthUser | null>;
}
