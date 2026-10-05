import { type FormEvent, type ReactNode, useState } from "react";

import { useAccount } from "../account";
import { ApiError, api, auth } from "../api";
import { Field } from "../components/Field";
import { Loadable } from "../components/Loadable";
import { formatMoney, trimZeros } from "../format";
import type { Account } from "../types";
import { useApi } from "../useApi";

export function AccountPage() {
  const state = useApi(api.getAccount, []);
  return (
    <>
      <title>Account · Mikeronn</title>
      <div className="page-head">
        <h1 className="plain-title">Account</h1>
      </div>
      <Loadable state={state}>{(account) => <Settings account={account} />}</Loadable>
    </>
  );
}

/** What a form shows after it was sent: the server's complaints, or that it worked. */
interface Outcome {
  errors: Record<string, string>;
  problem?: string;
  done?: string;
}

const NOTHING_YET: Outcome = { errors: {} };

function failed(reason: unknown): Outcome {
  if (reason instanceof ApiError) {
    const hasFields = Object.keys(reason.fields).length > 0;
    return { errors: reason.fields, problem: hasFields ? undefined : reason.message };
  }
  return { errors: {}, problem: reason instanceof Error ? reason.message : String(reason) };
}

function Messages({ outcome }: { outcome: Outcome }) {
  return (
    <>
      {outcome.problem && (
        <p className="error" role="alert">
          {outcome.problem}
        </p>
      )}
      {outcome.done && (
        <p className="hint" role="status">
          {outcome.done}
        </p>
      )}
    </>
  );
}

function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="setting">
      <h2>{title}</h2>
      {intro && <p className="setting-intro">{intro}</p>}
      {children}
    </section>
  );
}

function Settings({ account }: { account: Account }) {
  return (
    <div className="settings">
      <p className="lede">
        Signed in as <strong>{account.email}</strong>.
      </p>
      <MonthlyPlan account={account} />
      <Password />
      <SignOut />
      <DeleteAccount />
    </div>
  );
}

function MonthlyPlan({ account }: { account: Account }) {
  const [amount, setAmount] = useState(trimZeros(account.monthly_budget));
  const [outcome, setOutcome] = useState(NOTHING_YET);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      // Keypads in comma-decimal regions only offer a comma.
      const saved = await api.setMonthlyBudget(amount.trim().replace(",", "."));
      setAmount(trimZeros(saved.monthly_budget));
      setOutcome({ errors: {}, done: `Saved: ${formatMoney(saved.monthly_budget)} a month.` });
    } catch (reason) {
      setOutcome(failed(reason));
    }
    setBusy(false);
  }

  return (
    <Section
      title="Monthly plan"
      intro="How much new money you plan to put in each month. The journal shows how much of it this month's purchases used."
    >
      <form className="setting-form" onSubmit={save}>
        <Field name="monthly_budget" label="Amount ($)" error={outcome.errors.monthly_budget}>
          <input
            id="monthly_budget"
            name="monthly_budget"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={outcome.errors.monthly_budget ? true : undefined}
            type="text"
            inputMode="decimal"
            pattern="\s*[0-9]*[.,]?[0-9]+\s*"
            title="An amount such as 30"
            autoComplete="off"
            required
          />
        </Field>
        <Messages outcome={outcome} />
        <div className="actions">
          <button className="button secondary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [outcome, setOutcome] = useState(NOTHING_YET);
  const [busy, setBusy] = useState(false);

  async function change(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setOutcome({ errors: {}, done: "Password changed. Your other devices were signed out." });
    } catch (reason) {
      setOutcome(failed(reason));
    }
    setBusy(false);
  }

  return (
    <Section title="Password">
      <form className="setting-form" onSubmit={change}>
        <Field name="current_password" label="Current password" error={outcome.errors.current_password}>
          <input
            id="current_password"
            name="current_password"
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            aria-invalid={outcome.errors.current_password ? true : undefined}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field
          name="new_password"
          label="New password"
          hint="At least 8 characters. Your other devices will be signed out."
          error={outcome.errors.new_password}
        >
          <input
            id="new_password"
            name="new_password"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            aria-invalid={outcome.errors.new_password ? true : undefined}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        </Field>
        <Messages outcome={outcome} />
        <div className="actions">
          <button className="button secondary" type="submit" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </Section>
  );
}

function SignOut() {
  const { signedOut } = useAccount();
  const [outcome, setOutcome] = useState(NOTHING_YET);

  async function signOut() {
    try {
      await auth.signOut();
    } catch {
      // Signed out already, or the server is out of reach: either way, leave.
    }
    signedOut();
  }

  async function signOutOthers() {
    try {
      await api.signOutOtherDevices();
      setOutcome({ errors: {}, done: "Done. Only this device is still signed in." });
    } catch (reason) {
      setOutcome(failed(reason));
    }
  }

  return (
    <Section
      title="Sign out"
      intro="Signed in on a phone or computer you no longer use? Sign out every device but this one."
    >
      <div className="actions">
        <button className="button secondary" type="button" onClick={signOut}>
          Sign out
        </button>
        <button className="button secondary" type="button" onClick={signOutOthers}>
          Sign out other devices
        </button>
      </div>
      <Messages outcome={outcome} />
    </Section>
  );
}

function DeleteAccount() {
  const { signedOut } = useAccount();
  const [password, setPassword] = useState("");
  const [outcome, setOutcome] = useState(NOTHING_YET);
  const [busy, setBusy] = useState(false);

  async function remove(event: FormEvent) {
    event.preventDefault();
    const question =
      "Delete your account and every trade in it? This cannot be undone.";
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await api.deleteAccount(password);
      signedOut();
    } catch (reason) {
      setOutcome(failed(reason));
      setBusy(false);
    }
  }

  return (
    <Section
      title="Delete account"
      intro="Deletes your account and every trade in it, for good. There's no way to get them back."
    >
      <form className="setting-form" onSubmit={remove}>
        <Field name="password" label="Your password" error={outcome.errors.password}>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={outcome.errors.password ? true : undefined}
            autoComplete="current-password"
            required
          />
        </Field>
        <Messages outcome={outcome} />
        <div className="actions">
          <button className="button danger" type="submit" disabled={busy}>
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </form>
    </Section>
  );
}
