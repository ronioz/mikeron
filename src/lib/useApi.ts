import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { AppState } from "react-native";

/** How often screens showing live prices re-load. Matches how long the server reuses a price. */
export const REFRESH_MS = 60_000;

export interface ApiState<T> {
  data: T | undefined;
  /** Set when the latest load failed. `data` may still hold the previous result. */
  error: Error | undefined;
  loading: boolean;
  /** True while a load asked for by pulling the screen down is running. */
  pulling: boolean;
  pull: () => void;
  reload: () => void;
}

/**
 * Loads data when the screen first appears. Pass `refreshMs` to also re-load
 * when the person comes back to it, and on a timer while it's on show.
 */
export function useApi<T>(load: () => Promise<T>, refreshMs?: number): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [reloads, setReloads] = useState(0);
  const run = useEffectEvent(load);

  useEffect(() => {
    let current = true;
    setLoading(true);
    run()
      .then((result) => {
        if (!current) return;
        setData(result);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (current) setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (!current) return;
        setLoading(false);
        setPulling(false);
      });
    // Ignore the answer if a newer load started or the screen was left meanwhile.
    return () => {
      current = false;
    };
  }, [reloads]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);
  const firstFocus = useRef(true);

  // Tabs stay alive when hidden, so only the one on show keeps refreshing.
  useFocusEffect(
    useCallback(() => {
      if (!refreshMs) return;
      if (firstFocus.current) firstFocus.current = false;
      else reload();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") reload();
      }, refreshMs);
      const returning = AppState.addEventListener("change", (state) => {
        if (state === "active") reload();
      });
      return () => {
        clearInterval(timer);
        returning.remove();
      };
    }, [refreshMs, reload]),
  );

  const pull = useCallback(() => {
    setPulling(true);
    reload();
  }, [reload]);

  return { data, error, loading, pulling, pull, reload };
}

/** True once `busy` has lasted a few seconds: long enough to say the server is waking. */
export function useSlow(busy: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);
  return slow;
}
