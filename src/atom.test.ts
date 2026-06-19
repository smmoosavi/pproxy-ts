import { describe, expect, it, mock } from 'bun:test';
import { AbortError, atom, derived, flush, type ReadonlyAtom } from './atom.ts';

type ImmediateListenerAtom<T> = ReadonlyAtom<T> & {
  set(value: T): void;
  subscribeImmediate(listener: () => void): () => void;
};

function collectValues<T>(atom: ReadonlyAtom<T>, signal?: AbortSignal) {
  const values: T[] = [];

  const collect = (async () => {
    try {
      for await (const value of atom.changes(signal)) {
        values.push(value);
      }
    } catch (error) {
      if (error instanceof AbortError) {
        // Expected when the controller is aborted, do nothing
      } else {
        throw error; // Re-throw unexpected errors
      }
    }
  })();

  return { values, collect };
}

function take<T>(
  atom: ReadonlyAtom<T>,
  count: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const values: T[] = [];

  return new Promise((resolve, reject) => {
    (async () => {
      for await (const value of atom.changes(signal)) {
        values.push(value);
        if (values.length === count) {
          resolve(values);
        }
      }
    })();
  });
}

describe('atom', () => {
  it('stores and updates a value', () => {
    const count = atom(1);

    expect(count.get()).toBe(1);

    count.set(2);
    expect(count.get()).toBe(2);

    count.update((current) => current + 3);
    expect(count.get()).toBe(5);
  });

  it('notifies listeners only when the value changes', () => {
    const count = atom(1);
    const listener = mock(() => {});
    count.subscribe(listener);

    count.set(1);
    flush();
    count.set(2);
    flush();
    count.update((current) => current);
    flush();
    count.update((current) => current + 1);
    flush();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('waits for the next change', async () => {
    const count = atom(1);
    const pending = count.waitForChange();

    count.set(2);
    flush();

    await expect(pending).resolves.toBe(2);
  });

  it('aborts waitForChange', async () => {
    const count = atom(1);
    const controller = new AbortController();
    const pending = count.waitForChange(controller.signal);

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AbortError);
  });

  it('streams undefined values without treating them as an empty queue', async () => {
    const value = atom<number | undefined>(1);
    const controller = new AbortController();

    const collect = take(value, 2, controller.signal);

    value.set(undefined);
    flush();
    value.set(2);
    flush();

    const seen = await collect;

    expect(seen).toEqual([undefined, 2]);
  });

  it('stops notifying immediate listeners after cleanup', () => {
    const count = atom(1) as unknown as ImmediateListenerAtom<number>;
    const listener = mock(() => {});
    const cleanup = count.subscribeImmediate(listener);

    count.set(2);
    count.set(3);

    expect(listener).toHaveBeenCalledTimes(2);

    cleanup();
    count.set(4);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('derived', () => {
  it('computes lazily and caches until a dependency changes', () => {
    const count = atom(2);
    const compute = mock(() => count.get() * 2);
    const doubled = derived(compute);

    expect(compute).toHaveBeenCalledTimes(0);
    expect(doubled.get()).toBe(4);
    expect(doubled.get()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(1);

    count.set(3);

    expect(doubled.get()).toBe(6);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('subscribes to dependencies before the first explicit get', () => {
    const count = atom(1);
    const listener = mock(() => {});
    const doubled = derived(() => count.get() * 2);

    doubled.subscribe(listener);
    count.set(2);
    flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(doubled.get()).toBe(4);
  });

  it('notifies listeners only when the derived value changes', () => {
    const count = atom(1);
    const parity = derived(() => count.get() % 2);
    const listener = mock(() => {});
    parity.subscribe(listener);

    count.set(3);
    flush();
    count.set(5);
    flush();
    expect(listener).toHaveBeenCalledTimes(0);
    count.set(6);
    flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(parity.get()).toBe(0);
  });

  it('notifies listeners only when the derived value changes with boxed value', () => {
    const count = atom(1);
    const parity = derived(() => count.get() % 2);
    const boxedParity = derived(() => ({ value: parity.get() }));
    const listener = mock(() => {});
    boxedParity.subscribe(listener);

    const boxed = boxedParity.get();
    expect(boxed.value).toBe(1);
    expect(boxedParity.get()).toBe(boxed);

    count.set(3);
    flush();
    expect(boxedParity.get()).toBe(boxed);
    count.set(5);
    flush();
    expect(boxedParity.get()).toBe(boxed);
    expect(listener).toHaveBeenCalledTimes(0);
    count.set(6);
    flush();
    expect(boxedParity.get()).not.toBe(boxed);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(boxedParity.get().value).toBe(0);
  });

  it('supports derived atoms depending on other derived atoms', () => {
    const count = atom(2);
    const doubled = derived(() => count.get() * 2);
    const label = derived(() => `value:${doubled.get()}`);

    expect(label.get()).toBe('value:4');

    count.set(3);

    expect(label.get()).toBe('value:6');
  });

  it('streams changes until aborted', async () => {
    const count = atom(1);
    const doubled = derived(() => count.get() * 2);
    const controller = new AbortController();

    const collect = take(doubled, 2, controller.signal);

    count.set(2);
    flush();
    count.set(3);
    flush();

    const seen = await collect;

    expect(seen).toEqual([4, 6]);
  });
  it('streams changes for derived atoms with multiple dependencies', async () => {
    const x = atom(1);
    const y = atom(2);
    const point = derived(() => ({ x: x.get(), y: y.get() }));
    const listener = mock(() => {});
    point.subscribe(listener);

    const controller = new AbortController();
    const collect = collectValues(point, controller.signal);

    expect(point.get()).toEqual({ x: 1, y: 2 });

    x.set(3);
    flush();
    y.set(4);
    flush();
    Promise.resolve().then(() => {
      controller.abort();
    });
    await collect.collect;
    expect(collect.values).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('batches synchronous dependency updates into one notification', async () => {
    const x = atom(1);
    const y = atom(2);
    const point = derived(() => ({ x: x.get(), y: y.get() }));
    const listener = mock(() => {});
    const collect = take(point, 1);

    point.subscribe(listener);

    x.set(3);
    y.set(4);

    expect(listener).toHaveBeenCalledTimes(0);

    await Promise.resolve();

    await expect(collect).resolves.toEqual([{ x: 3, y: 4 }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(point.get()).toEqual({ x: 3, y: 4 });
  });
});
