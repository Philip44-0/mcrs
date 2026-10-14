/** What modules use to write to the log. Every line starts with the id of the module. */
export interface Logger {
  debug(message: string, ...data: unknown[]): void;
  info(message: string, ...data: unknown[]): void;
  warn(message: string, ...data: unknown[]): void;
  error(message: string, ...data: unknown[]): void;
}

/** Where log lines end up. The console by default; tests pass their own. */
export type LogSink = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export function createLogger(prefix: string, sink: LogSink = console): Logger {
  const tag = `[${prefix}]`;
  return {
    debug: (message, ...data) => sink.debug(tag, message, ...data),
    info: (message, ...data) => sink.info(tag, message, ...data),
    warn: (message, ...data) => sink.warn(tag, message, ...data),
    error: (message, ...data) => sink.error(tag, message, ...data),
  };
}
