import { describe, expect, it } from 'vitest';
import { parseHandshake } from './parse';

const valid = {
  clientApi: '1',
  modules: [
    { id: 'auth', version: '1.0.0' },
    { id: 'back-button', version: '1.2.3-beta.1' },
  ],
};

describe('parseHandshake', () => {
  it('accepts a good request and ignores extra properties', () => {
    const parsed = parseHandshake({
      ...valid,
      other: true,
      modules: [{ id: 'auth', version: '1.0.0', extra: 1 }],
    });

    expect(parsed).toEqual({
      ok: true,
      clientApi: '1',
      modules: [{ id: 'auth', version: '1.0.0' }],
    });
    expect(parseHandshake(valid).ok).toBe(true);
    expect(parseHandshake({ clientApi: '1', modules: [] }).ok).toBe(true);
  });

  it('refuses a body that is not an object', () => {
    for (const body of [undefined, null, 'x', 5, []]) {
      expect(parseHandshake(body)).toEqual({
        ok: false,
        problems: [expect.stringContaining('has to be an object')],
      });
    }
  });

  it('names what is wrong', () => {
    const parsed = parseHandshake({
      clientApi: 1,
      modules: [
        { id: 'Not A Module', version: '1' },
        { id: 'ok', version: 'bad version!' },
        'text',
      ],
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      '"clientApi" has to be a number as text, for example "1"',
      'modules[0].id is not a module id',
      'modules[1].version is not a version',
      'modules[2].id is not a module id',
    ]);
  });

  it('refuses a module that is listed twice', () => {
    const parsed = parseHandshake({
      clientApi: '1',
      modules: [
        { id: 'auth', version: '1' },
        { id: 'auth', version: '2' },
      ],
    });

    expect(parsed.ok ? [] : parsed.problems).toEqual(['modules[1].id "auth" is listed twice']);
  });

  it('limits the size of the list and the number of problems', () => {
    const many = Array.from({ length: 201 }, (_, index) => ({ id: `m${index}`, version: '1' }));
    expect(parseHandshake({ clientApi: '1', modules: many }).ok).toBe(false);

    const bad = Array.from({ length: 100 }, () => ({ id: '!', version: '1' }));
    const parsed = parseHandshake({ clientApi: '1', modules: bad });
    expect(parsed.ok ? 0 : parsed.problems.length).toBe(20);
  });
});
