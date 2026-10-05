import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { useAccount } from "../account";
import { ApiError, auth } from "../api";
import { CodeStep } from "../components/CodeStep";
import { Field } from "../components/Field";
import { PlanFields } from "../components/PlanFields";
import { typedAmount } from "../plan";
import type { PlanPeriod } from "../types";
import { useApi } from "../useApi";
import { TAGLINE } from "./SignIn";

export function SignUp() {
  const { setAccount } = useAccount();
  const options = useApi(auth.options, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Their plan. Both start empty: neither an amount nor how often is assumed for anyone.
  const [planAmount, setPlanAmount] = useState("");
  const [planPeriod, setPlanPeriod] = useState<PlanPeriod>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The address the code went to, as the server wrote it (lowercased).
  const [sentTo, setSentTo] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(undefined);
    // Browsers ask for a choice before sending the form; this covers one that doesn't.
    if (!planPeriod) {
      setErrors({ plan_period: "Choose how often." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const sent = await auth.signUp(email, password, typedAmount(planAmount), planPeriod);
      setSentTo(sent.email);
    } catch (reason) {
      if (!(reason instanceof ApiError)) throw reason;
      setErrors(reason.fields);
      if (Object.keys(reason.fields).length === 0) setProblem(reason.message);
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <>
        <title>Confirm your email · Mikeronn</title>
        <h1>Confirm your email</h1>
        <CodeStep
          email={sentTo}
          purpose="confirm"
          onSignedIn={setAccount}
          onBack={() => setSentTo(undefined)}
        />
      </>
    );
  }

  if (options.data && !options.data.sign_up_open) {
    return (
      <>
        <title>Create an account · Mikeronn</title>
        <h1>Create an account</h1>
        <p className="lede">New accounts can't be made at the moment.</p>
        <p className="auth-switch">
          Already have one? <Link to="/sign-in">Sign in</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <title>Create an account · Mikeronn</title>
      <h1>Create an account</h1>
      <p className="lede">{TAGLINE}</p>
      <form className="auth-form" onSubmit={submit}>
        <Field
          name="email"
          label="Email"
          hint="We'll email a code to it, to check it's yours."
          error={errors.email}
        >
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
        <Field name="password" label="Password" hint="At least 8 characters." error={errors.password}>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </Field>
        <PlanFields
          amount={planAmount}
          period={planPeriod}
          onAmount={setPlanAmount}
          onPeriod={setPlanPeriod}
          errors={errors}
          amountLabel="Amount you plan to invest ($)"
          amountHint="New money you mean to put in. The journal shows how much of it you have used."
          periodHint="You can change both later, on the Account page."
        />
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </>
  );
}
