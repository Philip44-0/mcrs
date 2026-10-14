import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { LoadedModule } from '../blueprint';
import { ModuleHost } from '../host';
import type { LogSink } from '../common';
import { ModuleRegistry } from '../registry';
import { handleShutdownSignals } from './shutdown';

const silent: LogSink = { debug() {}, info() {}, warn() {}, error() {} };
const later = (ms = 10) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function setup(shutdown: () => Promise<void>) {
  const target = new EventEmitter();
  const exits: number[] = [];
  const dispose = handleShutdownSignals(shutdown, {
    target,
    exit: (code) => void exits.push(code),
    sink: silent,
  });
  return { target, exits, dispose };
}

function mod(id: string): LoadedModule {
  return {
    id,
    dir: `/modules/${id}`,
    manifestFile: `/modules/${id}/module.json`,
    manifest: { id, name: id, version: '1.0.0', mcrs: '^1.0.0', parts: ['server'] },
    config: {},
    source: { kind: 'path', specifier: `modules/${id}` },
  };
}

describe('handleShutdownSignals', () => {
  it('runs the shutdown on SIGINT and exits with 0', async () => {
    let done = false;
    const { target, exits } = setup(async () => {
      await later(5);
      done = true;
    });

    target.emit('SIGINT');
    expect(exits).toEqual([]);
    await later(30);

    expect(done).toBe(true);
    expect(exits).toEqual([0]);
  });

  it('does the same on SIGTERM', async () => {
    const { target, exits } = setup(async () => {});

    target.emit('SIGTERM');
    await later();

    expect(exits).toEqual([0]);
  });

  it('forces the exit when a second signal comes during the shutdown', async () => {
    let calls = 0;
    const { target, exits } = setup(() => {
      calls++;
      return new Promise<void>(() => {});
    });

    target.emit('SIGINT');
    target.emit('SIGINT');
    await later();

    expect(calls).toBe(1);
    expect(exits).toEqual([1]);
  });

  it('exits with 1 when the shutdown fails', async () => {
    const { target, exits } = setup(async () => {
      throw new Error('stuck');
    });

    target.emit('SIGTERM');
    await later();

    expect(exits).toEqual([1]);
  });

  it('removes its handlers again', () => {
    const { target, dispose } = setup(async () => {});
    expect(target.listenerCount('SIGINT')).toBe(1);

    dispose();

    expect(target.listenerCount('SIGINT')).toBe(0);
    expect(target.listenerCount('SIGTERM')).toBe(0);
  });

  it.each(['SIGINT', 'SIGTERM'])(
    'stops the modules in reverse order on %s',
    async (signal: string) => {
      const calls: string[] = [];
      const registry = new ModuleRegistry();
      ['a', 'b', 'c'].forEach((id) => registry.register(mod(id)));
      registry.freeze();
      const host = new ModuleHost(registry, {
        dataDir: '/data',
        sink: silent,
        load: async (module) => ({
          register: () => {},
          stop: () => void calls.push(`${module.id}.stop`),
        }),
      });
      await host.start();
      const { target, exits } = setup(async () => void (await host.stop()));

      target.emit(signal);
      await later();

      expect(calls).toEqual(['c.stop', 'b.stop', 'a.stop']);
      expect(exits).toEqual([0]);
    },
  );
});
