import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile } from './read-json';

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

async function folder(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mcrs-json-'));
  folders.push(dir);
  return dir;
}

describe('readJsonFile', () => {
  it('reads and parses a JSON file', async () => {
    const file = path.join(await folder(), 'a.json');
    await writeFile(file, '{ "ok": true }');

    expect(await readJsonFile(file)).toEqual({ ok: true, value: { ok: true } });
  });

  it('ignores the byte order mark that some Windows editors add', async () => {
    const file = path.join(await folder(), 'bom.json');
    await writeFile(file, '\ufeff{ "ok": true }');

    expect(await readJsonFile(file)).toEqual({ ok: true, value: { ok: true } });
  });

  it('says when the file does not exist', async () => {
    const file = path.join(await folder(), 'missing.json');

    expect(await readJsonFile(file)).toEqual({
      ok: false,
      problem: { file, path: '', message: 'file not found' },
    });
  });

  it('says when the file cannot be read (here: it is a folder)', async () => {
    const dir = await folder();
    await mkdir(path.join(dir, 'folder.json'));
    const file = path.join(dir, 'folder.json');

    const result = await readJsonFile(file);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problem.message).toContain('cannot read file');
  });

  it('says when the content is not valid JSON, and names the file', async () => {
    const file = path.join(await folder(), 'bad.json');
    await writeFile(file, '{ "modules": [ }');

    const result = await readJsonFile(file);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.file).toBe(file);
    expect(result.ok ? '' : result.problem.message).toContain('invalid JSON');
  });
});
