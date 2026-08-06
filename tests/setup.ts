import { beforeEach } from 'vitest';

/**
 * Provide a deterministic `localStorage` for the tests.
 *
 * Two things get in the way of using the environment's own: Node 22+ ships an
 * experimental global `localStorage` that is inert unless the process is given
 * --localstorage-file, and happy-dom's `window.localStorage` reads back as
 * undefined under that shadowing. The code under test calls bare `localStorage`
 * exactly as it does in a browser, so install a small in-memory implementation
 * that behaves the way the Storage interface does.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(String(key)) ? this.store.get(String(key))! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  clear(): void {
    this.store.clear();
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
  writable: true
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true
  });
}

// Keep one test's stored tags from leaking into the next
beforeEach(() => {
  storage.clear();
});
