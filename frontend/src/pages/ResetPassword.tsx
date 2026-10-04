import { type FormEvent, useState } from "react";
import { Link, useLocation } from "react-router";

import { useAccount } from "../account";
import { ApiError, auth } from "../api";
import { CodeStep } from "../components/CodeStep";
import { Field } from "../components/Field";

export function ResetPassword() {
  const { setAccount } = useAccount();
  const location = useLocation();
  // Brought over from the sign-in page, if it was typed there.
  const [email, setEmail] = useState(
    ((location.state as { email?: string } | null)?.email ?? "").trim(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(undefined);
    setErrors({});
    try {
      setSentTo((await auth.forgotPassword(email)).email);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      setErrors(reason.fields);
      if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
    }
    setBusy(false);
  }

  return (
    <>
      <title>Reset your password · Mikeronn</title>
      <h1>Reset your password</h1>
      {sentTo ? (
        <CodeStep
          email={sentTo}
          purpose="reset"
          onSignedIn={setAccount}
          onBack={() => setSentTo(undefined)}
        />
      ) : (
        <>
          <p className="lede">
            Type the email address you signed up with, and we'll email you a code to choose a new
            password.
          </p>
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
                autoFocus
              />
            </Field>
            {problem && (
              <p className="error" role="alert">
                {problem}
              </p>
            )}
            <div className="actions">
              <button className="button" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email me a code"}
              </button>
            </div>
          </form>
          <p className="auth-switch">
            Remembered it? <Link to="/sign-in" state={{ email }}>Sign in</Link>
          </p>
        </>
      )}
    </>
  );
}
