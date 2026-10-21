import { readFile } from 'node:fs/promises';
import type { Problem } from '../common';

export type JsonReadResult = { ok: true; value: unknown } | { ok: false; problem: Problem };

/** Reads and parses a JSON file. Problems are returned, never thrown. */
export async function readJsonFile(file: string): Promise<JsonReadResult> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message =
      code === 'ENOENT' ? 'file not found' : `cannot read file (${(error as Error).message})`;
    return { ok: false, problem: { file, path: '', message } };
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // byte order mark from some Windows editors

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      ok: false,
      problem: { file, path: '', message: `invalid JSON: ${describeJsonError(error)}` },
    };
  }
}

/** V8 (Node 22 and later) already names the place of the error where it can, for example "(line 1 column 9)". */
function describeJsonError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
