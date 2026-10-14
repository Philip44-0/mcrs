import { createLogger, type LogSink } from '../common';

export interface ShutdownOptions {
  /** Default: SIGINT (Ctrl+C) and SIGTERM. */
  signals?: readonly string[];
  /** Where the signals come from. Default: the process. */
  target?: {
    on(event: string, listener: () => void): unknown;
    removeListener(event: string, listener: () => void): unknown;
  };
  /** Default: process.exit. */
  exit?: (code: number) => void;
  sink?: LogSink;
}

/**
 * Runs `shutdown` when the process gets a stop signal, then exits with code 0 (or 1 when the
 * shutdown failed). A second signal while the shutdown is still running forces the exit.
 * Returns a function that removes the signal handlers again.
 */
export function handleShutdownSignals(
  shutdown: () => Promise<void>,
  options: ShutdownOptions = {},
): () => void {
  const signals = options.signals ?? ['SIGINT', 'SIGTERM'];
  const target = options.target ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = createLogger('mcrs', options.sink);
  let shuttingDown = false;

  const onSignal = (signal: string): void => {
    if (shuttingDown) {
      log.warn(`${signal} received again, forcing exit`);
      exit(1);
      return;
    }
    shuttingDown = true;
    log.info(`${signal} received, shutting down`);
    shutdown().then(
      () => exit(0),
      (error: unknown) => {
        log.error(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
        exit(1);
      },
    );
  };

  const listeners = signals.map((signal) => {
    const listener = (): void => onSignal(signal);
    target.on(signal, listener);
    return { signal, listener };
  });

  return () => {
    for (const { signal, listener } of listeners) target.removeListener(signal, listener);
  };
}
