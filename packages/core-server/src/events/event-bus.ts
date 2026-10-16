import { assertOwnName, assertValidName, type Logger } from '../common';
import type { EventOutbox, ModuleEvents } from '../module-api';

type Handler = (payload: unknown) => unknown;

interface Listener {
  owner: string;
  handler: Handler;
}

/**
 * Tells modules that something happened, without the sender knowing who listens.
 *
 * Delivery is asynchronous: `emit()` returns at once and the listeners are called afterwards. A
 * listener that throws or rejects is logged and ignored, so it never affects the sender or the other
 * listeners. The bus does not know about transactions; code that emits inside a transaction uses an
 * `outbox()` and flushes it after the commit.
 */
export class EventBus {
  private readonly listeners = new Map<string, Listener[]>();
  private readonly pending = new Set<Promise<void>>();
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  /** Returns a function that removes the listener again. */
  on(name: string, handler: Handler, owner = 'core'): () => void {
    assertValidName('event', name);
    const listener: Listener = { owner, handler };
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);

    return () => {
      const remaining = (this.listeners.get(name) ?? []).filter(
        (candidate) => candidate !== listener,
      );
      if (remaining.length > 0) this.listeners.set(name, remaining);
      else this.listeners.delete(name);
    };
  }

  emit(name: string, payload?: unknown): void {
    assertValidName('event', name);
    const listeners = this.listeners.get(name);
    if (listeners === undefined || listeners.length === 0) return;

    const snapshot = [...listeners];
    const delivery = Promise.resolve()
      .then(() =>
        Promise.allSettled(snapshot.map((listener) => this.call(listener, name, payload))),
      )
      .then(() => undefined);
    this.pending.add(delivery);
    void delivery.finally(() => this.pending.delete(delivery));
  }

  /** Collects events and announces them on `flush()`. Nothing is announced when it is discarded. */
  outbox(): EventOutbox {
    return this.createOutbox(() => {});
  }

  /** Resolves when every event that was emitted so far has been delivered to all its listeners. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  /** The view that one module gets: it may only emit events that start with its own id. */
  scoped(owner: string): ModuleEvents {
    const checkOwn = (name: string): void => assertOwnName(owner, 'event', name, 'emit');
    return {
      on: ((name: string, handler: Handler) => this.on(name, handler, owner)) as ModuleEvents['on'],
      emit: ((name: string, payload?: unknown) => {
        checkOwn(name);
        this.emit(name, payload);
      }) as ModuleEvents['emit'],
      outbox: () => this.createOutbox(checkOwn),
    };
  }

  private createOutbox(check: (name: string) => void): EventOutbox {
    const queue: Array<{ name: string; payload: unknown }> = [];
    let closed = false;

    return {
      emit: ((name: string, payload?: unknown) => {
        if (closed) throw new Error('this outbox was already flushed or discarded');
        assertValidName('event', name);
        check(name);
        queue.push({ name, payload });
      }) as EventOutbox['emit'],
      flush: () => {
        if (closed) return;
        closed = true;
        for (const event of queue) this.emit(event.name, event.payload);
        queue.length = 0;
      },
      discard: () => {
        closed = true;
        queue.length = 0;
      },
    };
  }

  private async call(listener: Listener, name: string, payload: unknown): Promise<void> {
    try {
      await listener.handler(payload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log.error(
        `listener of module "${listener.owner}" for event "${name}" failed: ${reason}`,
      );
    }
  }
}
