import type { ReactNode } from "react";

import type { ApiState } from "../useApi";

interface Props<T> {
  state: ApiState<T>;
  children: (data: T) => ReactNode;
}

/** Shows a loading or error message until data arrives, then renders it. */
export function Loadable<T>({ state, children }: Props<T>) {
  if (state.data === undefined) {
    if (state.error) {
      return (
        <section className="empty" role="alert">
          <p>{state.error.message}</p>
          <button className="button secondary" type="button" onClick={state.reload}>
            Try again
          </button>
        </section>
      );
    }
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  }
  return (
    <>
      {state.error && (
        <p className="notice" role="status">
          Couldn't refresh just now. Showing what was loaded earlier.
        </p>
      )}
      {children(state.data)}
    </>
  );
}
