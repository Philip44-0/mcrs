export interface FakeTransaction {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

/**
 * A tiny in-memory store with a transaction that really rolls back: when the work throws, every
 * change that was made inside is undone. It stands in for the storage module in tests.
 */
export class FakeStore {
  private data = new Map<string, unknown>();

  get(key: string): unknown {
    return this.data.get(key);
  }

  /** Puts a value in without a transaction (to set a test up). */
  seed(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }

  async transaction<T>(work: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const before = new Map(this.data);
    const transaction: FakeTransaction = {
      get: (key) => this.data.get(key),
      set: (key, value) => void this.data.set(key, value),
    };
    try {
      return await work(transaction);
    } catch (error) {
      this.data = before;
      throw error;
    }
  }
}
