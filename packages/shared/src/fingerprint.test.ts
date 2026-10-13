import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeFingerprints, fingerprintOf, shortFingerprint } from './fingerprint';
import { sha256Hex } from './sha256';

const modules = [
  { id: 'storage-sqlite', version: '1.0.0', parts: ['server'] },
  { id: 'auth', version: '1.0.0', parts: ['server', 'client'] },
  { id: 'catalog', version: '1.2.0', parts: ['server', 'client'] },
];

describe('sha256Hex', () => {
  it('matches the well-known test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with node:crypto for every length around the block boundaries', () => {
    for (let length = 0; length <= 200; length++) {
      const text = 'x'.repeat(length);
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('hashes the UTF-8 encoding of non-ASCII text', () => {
    const text = 'Schnitzel \u00e4\u00f6\u00fc \u00df \u20ac \u65e5\u672c';
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('fingerprints', () => {
  it('has fixed, known values', () => {
    const result = computeFingerprints(modules);

    expect(result.fingerprint).toBe(
      '1fb24ae7220ca6df0f89314ed030492549a01e783efae4385f713ad2d0e88bfa',
    );
    expect(result.clientFingerprint).toBe(
      'a053c5130cf72fb1a01f7629ce6e7d646a12a8977bae5b7c46c89f286891bad6',
    );
  });

  it('is the hash of the prefix and the sorted lines', () => {
    const text = 'mcrs-fp1\nauth@1.0.0\ncatalog@1.2.0\nstorage-sqlite@1.0.0';

    expect(computeFingerprints(modules).fingerprint).toBe(
      createHash('sha256').update(text).digest('hex'),
    );
  });

  it('does not depend on the order of the modules', () => {
    const expected = computeFingerprints(modules);

    expect(computeFingerprints([...modules].reverse())).toEqual(expected);
    expect(computeFingerprints([modules[1]!, modules[2]!, modules[0]!])).toEqual(expected);
  });

  it('only counts modules with a client part in the client fingerprint', () => {
    const withoutServerOnly = modules.filter((module) => module.id !== 'storage-sqlite');

    expect(computeFingerprints(modules).clientFingerprint).toBe(fingerprintOf(withoutServerOnly));
    expect(computeFingerprints(modules).clientFingerprint).not.toBe(
      computeFingerprints(modules).fingerprint,
    );
  });

  it('changes with a version and with the set of modules', () => {
    const base = computeFingerprints(modules).fingerprint;
    const newer = modules.map((module) =>
      module.id === 'auth' ? { ...module, version: '1.0.1' } : module,
    );

    expect(computeFingerprints(newer).fingerprint).not.toBe(base);
    expect(computeFingerprints(modules.slice(1)).fingerprint).not.toBe(base);
  });

  it('sorts by module id and not by the whole line', () => {
    // "stock-x@1.0.0" would come before "stock@1.0.0" when sorting whole lines ("-" is smaller than "@")
    const result = fingerprintOf([
      { id: 'stock-x', version: '1.0.0' },
      { id: 'stock', version: '1.0.0' },
    ]);

    expect(result).toBe('5d103d5865dd40b0bbbcec7411a13893486dee108cd16ef968554b359a05b822');
  });

  it('has a fixed value for no modules at all', () => {
    expect(fingerprintOf([])).toBe(
      'c1eea6024ffed9c45bbc04cd5a473fe4c06b821654bfbd68523f4b29e3cb2916',
    );
  });

  it('shows the first 12 characters', () => {
    expect(
      shortFingerprint('1fb24ae7220ca6df0f89314ed030492549a01e783efae4385f713ad2d0e88bfa'),
    ).toBe('1fb24ae7220c');
  });
});
