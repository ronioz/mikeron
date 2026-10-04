import { type FormEvent, useState } from "react";

import { ApiError, auth } from "../api";
import type { Account } from "../types";
import { Field } from "./Field";

interface Props {
  /** Where the code went. */
  email: string;
  /** "confirm" asks for the code alone; "reset" also for a new password. */
  purpose: "confirm" | "reset";
  /** Called once the code worked and the person is signed in. */
  onSignedIn: (account: Account) => void;
  /** Start again with another address. */
  onBack: () => void;
}

/**
 * The step after an emailed code was sent: type it in, and for a reset choose
 * a new password, then be signed in. Codes rather than links work the same in
 * a browser and in the iOS app, and both offer to fill one in from Mail
 * (autocomplete="one-time-code").
 */
export function CodeStep({ email, purpose, onSignedIn, onBack }: Props) {
  const reset = purpose === "reset";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(undefined);
    setNote(undefined);
    try {
      const result = reset
        ? await auth.resetPassword(email, code, password)
        : await auth.confirm(email, code);
      onSignedIn(result.account);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      setErrors(reason.fields);
      if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
      setBusy(false);
    }
  }

  async function sendAgain() {
    setProblem(undefined);
    setNote(undefined);
    try {
      await (reset ? auth.forgotPassword(email) : auth.resendCode(email));
      setNote("We've sent a new code. The one before it no longer works.");
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : "Couldn't send a new code.");
    }
  }

  return (
    <>
      <p className="lede">
        We've emailed a 6-digit code to <strong>{email}</strong>. It works for 15 minutes.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <Field name="code" label="Code" error={errors.code}>
          <input
            id="code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={errors.code ? true : undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\s*[0-9]{3} ?[0-9]{3}\s*"
            title="The 6 digits from the email"
            placeholder="123456"
            maxLength={9}
            required
            autoFocus
          />
        </Field>
        {reset && (
          <Field
            name="new_password"
            label="New password"
            hint="At least 8 characters. Every device signed in with the old one is signed out."
            error={errors.new_password}
          >
            <input
              id="new_password"
              name="new_password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.new_password ? true : undefined}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </Field>
        )}
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        {note && (
          <p className="hint" role="status">
            {note}
          </p>
        )}
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Checking…" : reset ? "Save password and sign in" : "Confirm and sign in"}
          </button>
        </div>
      </form>
      <p className="auth-switch">
        No email? Check your spam folder, or{" "}
        <button className="link-button" type="button" onClick={sendAgain}>
          send a new code
        </button>
        . Wrong address?{" "}
        <button className="link-button" type="button" onClick={onBack}>
          Start again
        </button>
      </p>
    </>
  );
}
