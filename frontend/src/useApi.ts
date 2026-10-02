import { type DependencyList, useEffect, useEffectEvent, useRef, useState } from "react";

/** How often pages showing live prices re-load. Matches how long the server reuses a price. */
export const REFRESH_MS = 60_000;

export interface ApiState<T> {
  data: T | undefined;
  /** Set when the latest load failed. `data` may still hold the previous result. */
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data when the component appears and again whenever `deps` change.
 * Pass `refreshMs` to also re-load on a timer while the tab is visible.
 */
export function useApi<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  refreshMs?: number,
): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const seenReloads = useRef(0);
  const run = useEffectEvent(load);

  useEffect(() => {
    // A re-load keeps the current data on screen so the page doesn't flash;
    // different inputs (another trade, say) start from blank.
    if (seenReloads.current === reloads) setData(undefined);
    seenReloads.current = reloads;

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
        if (current) setLoading(false);
      });
    // Ignore the answer if the inputs changed or the page was left meanwhile.
    return () => {
      current = false;
    };
  }, [...deps, reloads]);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => {
      if (!document.hidden) setReloads((count) => count + 1);
    }, refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs]);

  return { data, error, loading, reload: () => setReloads((count) => count + 1) };
}
