import { type FormEvent, useState } from "react";
import { Link, useLocation } from "react-router";

import { useAccount } from "../account";
import { ApiError, auth } from "../api";
import { CodeStep } from "../components/CodeStep";
import { Field } from "../components/Field";
import { useApi } from "../useApi";

export const TAGLINE = "A personal trade journal: why you bought, what you expected, and how it went.";

export function SignIn() {
  const { setAccount } = useAccount();
  const location = useLocation();
  const options = useApi(auth.options, []);
  // Filled in when coming back from another sign-in page.
  const [email, setEmail] = useState(
    ((location.state as { email?: string } | null)?.email ?? "").trim(),
  );
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // An account whose address was never confirmed: a new code is on its way.
  const [confirming, setConfirming] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(undefined);
    setErrors({});
    try {
      const result = await auth.signIn(email, password);
      // The sign-in pages follow the account: this sends them on into the app.
      setAccount(result.account);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      if (reason.status === 403) {
        setConfirming(true);
      } else {
        setErrors(reason.fields);
        if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
      }
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <>
        <title>Confirm your email · Mikeronn</title>
        <h1>Confirm your email</h1>
        <CodeStep
          email={email.trim().toLowerCase()}
          purpose="confirm"
          onSignedIn={setAccount}
          onBack={() => setConfirming(false)}
        />
      </>
    );
  }

  return (
    <>
      <title>Sign in · Mikeronn</title>
      <h1>Sign in</h1>
      <p className="lede">{TAGLINE}</p>
      <form className="auth-form" onSubmit={submit}>
        <Field name="email" label="Email" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            autoComplete="email"
            required
          />
        </Field>
        <Field
          name="password"
          label="Password"
          error={errors.password}
          hint={
            <Link to="/reset-password" state={{ email }}>
              Forgot your password?
            </Link>
          }
        >
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            autoComplete="current-password"
            required
          />
        </Field>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
      {options.data?.sign_up_open && (
        <p className="auth-switch">
          New to Mikeronn? <Link to="/sign-up">Create an account</Link>
        </p>
      )}
    </>
  );
}
