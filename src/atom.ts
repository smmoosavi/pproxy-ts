type Listener = () => void;
type Cleanup = () => void;

interface InternalAtom<T> extends ReadonlyAtom<T> {
  subscribeImmediate(listener: Listener): Cleanup;
}

type DependencyCollector = {
  add(atom: InternalAtom<unknown>): void;
};

let activeCollector: DependencyCollector | null = null;
const pendingAtoms = new Set<BaseAtom<unknown>>();

let flushScheduled = false;
let flushing = false;

interface ReadonlyAtom<T> {
  get(): T;
  subscribe(listener: Listener): Cleanup;
  waitForChange(signal?: AbortSignal): Promise<T>;
  changes(signal?: AbortSignal): AsyncGenerator<T, void, unknown>;
}

interface WritableAtom<T> extends ReadonlyAtom<T> {
  set(value: T): void;
  update(fn: (current: T) => T): void;
}

export class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

function scheduleFlush(): void {
  if (flushScheduled || flushing) {
    return;
  }

  flushScheduled = true;
  queueMicrotask(() => {
    flush();
  });
}

export function flush(): void {
  if (flushing) {
    return;
  }

  flushScheduled = false;
  flushing = true;
  const errors: unknown[] = [];

  try {
    while (pendingAtoms.size > 0) {
      const atoms = [...pendingAtoms];
      pendingAtoms.clear();

      for (const atom of atoms) {
        atom.flushPendingListeners(errors);
      }
    }
  } finally {
    flushing = false;

    if (pendingAtoms.size > 0) {
      scheduleFlush();
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Atom listeners failed');
  }
}

function trackDependency(atom: InternalAtom<unknown>): void {
  activeCollector?.add(atom);
}

abstract class BaseAtom<T> implements InternalAtom<T> {
  private listeners = new Set<Listener>();
  private immediateListeners = new Set<WeakRef<Listener>>();
  private readonly immediateListenerRegistry =
    typeof FinalizationRegistry === 'undefined'
      ? null
      : new FinalizationRegistry<{
          set: Set<WeakRef<Listener>>;
          ref: WeakRef<Listener>;
        }>(({ set, ref }) => {
          set.delete(ref);
        });
  private pendingListeners = new Set<Listener>();
  private notificationPending = false;

  abstract get(): T;

  subscribe(listener: Listener): Cleanup {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
      this.pendingListeners.delete(listener);
    };
  }

  subscribeImmediate(listener: Listener): Cleanup {
    const ref = new WeakRef(listener);
    this.immediateListeners.add(ref);
    this.immediateListenerRegistry?.register(
      listener,
      { set: this.immediateListeners, ref },
      ref,
    );

    return () => {
      this.immediateListeners.delete(ref);
      this.immediateListenerRegistry?.unregister(ref);
    };
  }

  waitForChange(signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }

      let settled = false;

      const cleanup = this.subscribe(() => {
        if (settled) {
          return;
        }

        settled = true;
        dispose();
        resolve(this.get());
      });

      const onAbort = () => {
        if (settled) {
          return;
        }

        settled = true;
        dispose();
        reject(new AbortError());
      };

      const dispose = () => {
        cleanup();
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async *changes(signal?: AbortSignal): AsyncGenerator<T, void, unknown> {
    if (signal?.aborted) {
      return;
    }

    const queue: T[] = [];
    let wake: (() => void) | null = null;

    const cleanup = this.subscribe(() => {
      queue.push(this.get());
      wake?.();
      wake = null;
    });

    const onAbort = () => {
      wake?.();
      wake = null;
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      while (true) {
        if (queue.length > 0) {
          const nextValue = queue.shift() as T;
          yield nextValue;
          continue;
        }

        if (signal?.aborted) {
          return;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      cleanup();
      signal?.removeEventListener('abort', onAbort);
    }
  }

  protected emitChange(): void {
    if (!this.hasListeners) {
      return;
    }

    for (const listener of this.listeners) {
      this.pendingListeners.add(listener);
    }

    if (this.notificationPending || this.pendingListeners.size === 0) {
      return;
    }

    this.notificationPending = true;
    pendingAtoms.add(this);
    scheduleFlush();
  }

  protected emitDependencyChange(): void {
    for (const ref of [...this.immediateListeners]) {
      const listener = ref.deref();

      if (!listener) {
        this.immediateListeners.delete(ref);
        continue;
      }

      listener();
    }
  }

  private sweepImmediateListeners(): void {
    for (const ref of this.immediateListeners) {
      if (ref.deref()) {
        continue;
      }

      this.immediateListeners.delete(ref);
    }
  }

  flushPendingListeners(errors: unknown[]): void {
    if (!this.notificationPending) {
      return;
    }

    this.notificationPending = false;
    const listeners = [...this.pendingListeners];
    this.pendingListeners.clear();

    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
  }

  protected get hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  protected get hasObservers(): boolean {
    this.sweepImmediateListeners();
    return this.listeners.size > 0 || this.immediateListeners.size > 0;
  }
}

class Atom<T> extends BaseAtom<T> implements WritableAtom<T> {
  constructor(private value: T) {
    super();
  }

  get(): T {
    trackDependency(this);
    return this.value;
  }

  set(value: T): void {
    if (Object.is(this.value, value)) {
      return;
    }

    this.value = value;
    this.emitDependencyChange();
    this.emitChange();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.value));
  }
}

class DerivedAtom<T> extends BaseAtom<T> implements ReadonlyAtom<T> {
  private initialized = false;
  private value!: T;
  private dirty = true;
  private dependencies = new Set<InternalAtom<unknown>>();
  private dependencyCleanups = new Map<InternalAtom<unknown>, Cleanup>();

  constructor(private compute: () => T) {
    super();
  }

  get(): T {
    trackDependency(this);
    return this.read();
  }

  override subscribe(listener: Listener): Cleanup {
    this.read();
    return super.subscribe(listener);
  }

  private readonly onDependencyChange = (): void => {
    if (!this.initialized) {
      this.dirty = true;
      return;
    }

    if (!this.hasObservers) {
      this.dirty = true;
      return;
    }

    const previousValue = this.value;
    this.recompute();

    if (!Object.is(previousValue, this.value)) {
      this.emitDependencyChange();
      this.emitChange();
    }
  };

  private read(): T {
    if (!this.initialized || this.dirty) {
      this.recompute();
    }

    return this.value;
  }

  private recompute(): void {
    const nextDependencies = new Set<InternalAtom<unknown>>();
    const previousCollector = activeCollector;
    activeCollector = {
      add: (atom) => {
        nextDependencies.add(atom);
      },
    };

    let nextValue: T;

    try {
      nextValue = this.compute();
    } finally {
      activeCollector = previousCollector;
    }

    this.syncDependencies(nextDependencies);
    this.value = nextValue;
    this.initialized = true;
    this.dirty = false;
  }

  private syncDependencies(nextDependencies: Set<InternalAtom<unknown>>): void {
    for (const dependency of this.dependencies) {
      if (nextDependencies.has(dependency)) {
        continue;
      }

      this.dependencyCleanups.get(dependency)?.();
      this.dependencyCleanups.delete(dependency);
    }

    for (const dependency of nextDependencies) {
      if (this.dependencies.has(dependency)) {
        continue;
      }

      this.dependencyCleanups.set(
        dependency,
        dependency.subscribeImmediate(this.onDependencyChange),
      );
    }

    this.dependencies = nextDependencies;
  }
}

// Public API
export function atom<T>(initialValue: T): WritableAtom<T> {
  return new Atom(initialValue);
}

export function derived<T>(compute: () => T): ReadonlyAtom<T> {
  return new DerivedAtom(compute);
}

export type { ReadonlyAtom, WritableAtom };
