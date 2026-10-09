import { readFile } from 'node:fs/promises';
import type { Problem } from './problems';

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
      problem: { file, path: '', message: `invalid JSON: ${describeJsonError(error, text)}` },
    };
  }
}

function describeJsonError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/line \d+ column \d+/.test(message)) return message; // V8 already names line and column

  const position = /position (\d+)/.exec(message);
  if (!position) return message;

  const index = Number(position[1]);
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return `${message} (line ${line}, column ${column})`;
}
