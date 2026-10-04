import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router";

import { ApiError, api, onSignedOut } from "./api";
import type { Account } from "./types";

interface AccountState {
  /** Undefined while asking the server, null when nobody is signed in. */
  account: Account | null | undefined;
  /** After signing in, so every page knows at once. */
  setAccount: (account: Account | null) => void;
  /** After signing out on purpose (or deleting the account): the next sign-in starts at the journal. */
  signedOut: () => void;
  /** Whether the last sign-out was on purpose rather than a session running out. */
  leftOnPurpose: boolean;
}

const AccountContext = createContext<AccountState | undefined>(undefined);

export function useAccount(): AccountState {
  const state = useContext(AccountContext);
  if (!state) throw new Error("useAccount needs an AccountProvider around it");
  return state;
}

/** Finds out once who is signed in, and keeps every page told. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccountState] = useState<Account | null>();
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);
  const [problem, setProblem] = useState<string>();

  const setAccount = useCallback((next: Account | null) => {
    if (next) setLeftOnPurpose(false);
    setAccountState(next);
  }, []);
  const signedOut = useCallback(() => {
    setLeftOnPurpose(true);
    setAccountState(null);
  }, []);

  const load = useCallback(() => {
    setProblem(undefined);
    api.getAccount().then(setAccount, (reason: unknown) => {
      if (reason instanceof ApiError && reason.status === 401) setAccount(null);
      else setProblem(reason instanceof Error ? reason.message : String(reason));
    });
  }, [setAccount]);

  useEffect(() => {
    load();
    // A session that ends while the app is open (signed out elsewhere, or run
    // out) sends this tab to the sign-in page on its next request, and back
    // to the same page after signing in again.
    onSignedOut(() => setAccount(null));
    return () => onSignedOut(undefined);
  }, [load, setAccount]);

  const value = useMemo(
    () => ({ account, setAccount, signedOut, leftOnPurpose }),
    [account, setAccount, signedOut, leftOnPurpose],
  );

  if (problem && account === undefined) {
    return (
      <main>
        <section className="empty" role="alert">
          <p>{problem}</p>
          <button className="button secondary" type="button" onClick={load}>
            Try again
          </button>
        </section>
      </main>
    );
  }
  return <AccountContext value={value}>{children}</AccountContext>;
}

/** Where a sign-in page goes once someone is signed in: back where they were headed. */
function destination(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") ? from : "/";
}

/**
 * The pages behind sign-in. Anyone not signed in is sent to sign in, then
 * brought back to the page they wanted, unless they had just signed out.
 */
export function RequireAccount() {
  const { account, leftOnPurpose } = useAccount();
  const location = useLocation();
  if (account === undefined) return null;
  if (account === null) {
    const state = leftOnPurpose ? undefined : { from: location.pathname + location.search };
    return <Navigate to="/sign-in" replace state={state} />;
  }
  return <Outlet />;
}

/** Signing in, up, or resetting a password. Someone already signed in goes on to the app. */
export function GuestOnly() {
  const { account } = useAccount();
  const location = useLocation();
  if (account === undefined) return null;
  if (account) return <Navigate to={destination(location.state)} replace />;
  return <Outlet />;
}
