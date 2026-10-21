import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatProblem, pointerToPath } from './problems';

describe('formatProblem', () => {
  const base = path.resolve('project');

  it('shows file, path and message, with the file relative to the folder', () => {
    const problem = {
      file: path.join(base, 'modules', 'demo', 'module.json'),
      path: 'version',
      message: 'is wrong',
    };

    expect(formatProblem(problem, base)).toBe(
      `${path.join('modules', 'demo', 'module.json')}: version: is wrong`,
    );
  });

  it('leaves out the path when the problem belongs to the whole file', () => {
    expect(
      formatProblem({ file: path.join(base, 'a.json'), path: '', message: 'file not found' }, base),
    ).toBe('a.json: file not found');
  });

  it('shows the whole file name when it is the folder itself', () => {
    expect(formatProblem({ file: base, path: '', message: 'm' }, base)).toBe(`${base}: m`);
  });
});

describe('pointerToPath', () => {
  it('turns a JSON pointer into a readable path', () => {
    expect(pointerToPath('')).toBe('');
    expect(pointerToPath('/port')).toBe('port');
    expect(pointerToPath('/modules/12/id')).toBe('modules[12].id');
    expect(pointerToPath('/a/0/b/1')).toBe('a[0].b[1]');
  });

  it('understands the escapes of JSON pointers', () => {
    expect(pointerToPath('/a~1b')).toBe('a/b');
    expect(pointerToPath('/a~0b')).toBe('a~b');
  });
});
