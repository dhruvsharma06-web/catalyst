import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isAbortError } from "./errors";

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  /** True during the first load and during reloads; `data` is kept while reloading. */
  loading: boolean;
  reload: () => void;
  setData: (update: (prev: T | undefined) => T | undefined) => void;
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Keeps a ref pointing at the latest value without writing to it during render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Runs `load` on mount and whenever `deps` change; aborts in-flight work on unmount. */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [prevDeps, setPrevDeps] = useState(deps);
  const loadRef = useLatest(load);

  // New inputs: show loading immediately, during render, instead of a cascading update from an effect.
  if (!sameDeps(prevDeps, deps)) {
    setPrevDeps(deps);
    setLoading(true);
    setError(undefined);
  }

  useEffect(() => {
    const controller = new AbortController();
    loadRef
      .current(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setDataState(value);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || isAbortError(e)) return;
        setError(e);
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are supplied by the caller
  }, [...deps, tick]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setTick((t) => t + 1);
  }, []);
  const setData = useCallback((update: (prev: T | undefined) => T | undefined) => setDataState(update), []);
  return { data, error, loading, reload, setData };
}

export interface Action<A extends unknown[]> {
  pending: boolean;
  error: unknown;
  run: (...args: A) => Promise<boolean>;
  clearError: () => void;
}

/** Wraps a mutation: tracks pending/error and refuses overlapping runs (no double submit). */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>): Action<A> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const busy = useRef(false);
  const fnRef = useLatest(fn);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setPending(true);
      setError(undefined);
      try {
        await fnRef.current(...args);
        return true;
      } catch (e) {
        if (mounted.current) setError(e);
        return false;
      } finally {
        busy.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [fnRef],
  );

  const clearError = useCallback(() => setError(undefined), []);
  return { pending, error, run, clearError };
}
