import path from 'node:path';

/** Something that is wrong (error) or suspicious (warning) in a configuration file. */
export interface Problem {
  /** The file the problem was found in (absolute path). */
  file: string;
  /** Location inside the file, for example "modules[2].id". Empty for the file as a whole. */
  path: string;
  message: string;
}

/** "mcrs.config.json: modules[2].id: must match ..." (the file is shown relative to baseDir). */
export function formatProblem(problem: Problem, baseDir: string = process.cwd()): string {
  const file = path.relative(baseDir, problem.file) || problem.file;
  return problem.path
    ? `${file}: ${problem.path}: ${problem.message}`
    : `${file}: ${problem.message}`;
}

/** Turns a JSON pointer such as "/modules/2/id" into "modules[2].id". */
export function pointerToPath(pointer: string): string {
  return pointer
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((result, segment) => {
      if (/^\d+$/.test(segment)) return `${result}[${segment}]`;
      return result ? `${result}.${segment}` : segment;
    }, '');
}
