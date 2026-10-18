import { validateAccess } from './access';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** What is wrong with a route definition? An empty list means nothing. */
export function validateRoute(route: unknown): string[] {
  if (typeof route !== 'object' || route === null) return ['the route has to be an object'];
  const candidate = route as Record<string, unknown>;
  const problems: string[] = [];

  if (typeof candidate.method !== 'string' || !METHODS.includes(candidate.method)) {
    problems.push(`"method" has to be one of ${METHODS.join(', ')}`);
  }

  const path = candidate.path;
  if (
    typeof path !== 'string' ||
    !/^\/[^\s?#]*$/.test(path) ||
    path.includes('..') ||
    path.includes('//')
  ) {
    problems.push(
      '"path" has to start with "/" and must not contain spaces, "?", "#", ".." or "//"',
    );
  }

  const accessProblem = validateAccess(candidate.access);
  if (accessProblem !== null) problems.push(accessProblem);

  if (typeof candidate.handler !== 'function') problems.push('"handler" has to be a function');

  return problems;
}
