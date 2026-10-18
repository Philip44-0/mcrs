import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
  it('keeps an id that is short and harmless', () => {
    expect(resolveRequestId('abc-123_X.y')).toBe('abc-123_X.y');
  });

  it('creates a new id when there is none', () => {
    expect(resolveRequestId(undefined)).toHaveLength(36);
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });

  it('does not trust ids that could do harm in a log', () => {
    for (const id of ['', 'a b', 'line\nbreak', '<script>', 'x'.repeat(65), 'ü', ['a']]) {
      expect(resolveRequestId(id)).toHaveLength(36);
    }
  });
});
