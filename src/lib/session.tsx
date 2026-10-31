import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { auth, onSignedOut, setApiToken } from "./api";
import { clearToken, readToken, saveToken } from "./token";

interface Session {
  /** True until the stored key has been read, at the start. */
  loading: boolean;
  signedIn: boolean;
  /** Keeps the key from a successful sign-in, which opens the app. */
  start: (token: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<Session | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readToken()
      .then((saved) => {
        setApiToken(saved);
        setToken(saved);
      })
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(async (next: string) => {
    await saveToken(next);
    setApiToken(next);
    setToken(next);
  }, []);

  const forget = useCallback(() => {
    setApiToken(null);
    setToken(null);
    void clearToken();
  }, []);

  // A key the server no longer accepts. Failing to reach the server isn't this:
  // that leaves the person signed in.
  useEffect(() => {
    onSignedOut(forget);
    return () => onSignedOut(undefined);
  }, [forget]);

  const signOut = useCallback(() => {
    const key = token;
    forget();
    // The phone is signed out at once. Ending the session on the server can take
    // a minute if it's asleep, and it runs out by itself if this never arrives.
    if (key) auth.signOut(key).catch(() => undefined);
  }, [token, forget]);

  const session = useMemo(
    () => ({ loading, signedIn: token !== null, start, signOut }),
    [loading, token, start, signOut],
  );
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession needs a SessionProvider around it");
  return session;
}
