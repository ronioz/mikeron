import { type ReactNode, useState } from "react";
import { Linking, View } from "react-native";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { T, TextLink } from "@/components/T";
import { ApiError, SERVER, auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { SignedIn } from "@/lib/types";
import { useApi, useSlow } from "@/lib/useApi";

const TAGLINE = "A personal trade journal: why you bought, what you expected, and how it went.";

const onWebsite = (path: string) => () => void Linking.openURL(`${SERVER}${path}`);

/** The key from a sign-in. The server only leaves it out for a browser, which this isn't. */
function keyOf(result: SignedIn): string {
  if (!result.token) throw new ApiError(0, "The server didn't sign you in. Please try again.");
  return result.token;
}

function Title({ children }: { children: string }) {
  return (
    <T
      accessibilityRole="header"
      size={32}
      weight="medium"
      style={{ marginTop: 24, letterSpacing: -0.64, lineHeight: 36 }}
    >
      {children}
    </T>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <T tone="loss" size={14} accessibilityLiveRegion="assertive">
      {children}
    </T>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return (
    <T tone="soft" size={17} style={{ marginTop: 12, lineHeight: 25 }}>
      {children}
    </T>
  );
}

export default function SignIn() {
  const { start } = useSession();
  // Asking early also wakes a sleeping server before the button is pressed.
  const options = useApi(auth.options);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // An account whose address was never confirmed: a new code is on its way.
  const [confirming, setConfirming] = useState(false);
  const slow = useSlow(busy);

  async function submit() {
    setBusy(true);
    setProblem(undefined);
    setErrors({});
    try {
      await start(keyOf(await auth.signIn(email, password)));
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
      <CodeStep email={email.trim().toLowerCase()} onBack={() => setConfirming(false)} />
    );
  }

  return (
    <Screen>
      <Title>Sign in</Title>
      <Lede>{TAGLINE}</Lede>
      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          inputMode="email"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          textContentType="password"
          hint={
            <TextLink size={14} onPress={onWebsite("/reset-password")}>
              Forgot your password?
            </TextLink>
          }
        />
        {problem && <Problem>{problem}</Problem>}
        <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy} />
        {slow && <T tone="muted">Waking the server. This can take a minute.</T>}
      </View>
      {options.data?.sign_up_open && (
        <T tone="muted" style={{ marginTop: 28 }}>
          New to Mikeronn? <TextLink onPress={onWebsite("/sign-up")}>Create an account</TextLink>
        </T>
      )}
    </Screen>
  );
}

/** After signing in to an unconfirmed account: type the emailed code and be signed in. */
function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const { start } = useSession();
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setProblem(undefined);
    setNote(undefined);
    try {
      await start(keyOf(await auth.confirm(email, code)));
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
      await auth.resendCode(email);
      setNote("We've sent a new code. The one before it no longer works.");
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : "Couldn't send a new code.");
    }
  }

  return (
    <Screen>
      <Title>Confirm your email</Title>
      <Lede>
        We've emailed a 6-digit code to{" "}
        <T size={17} weight="semibold">
          {email}
        </T>
        . It works for 15 minutes.
      </Lede>
      <View style={{ marginTop: 28, gap: 20 }}>
        <Field
          label="Code"
          value={code}
          onChangeText={setCode}
          error={errors.code}
          autoComplete="one-time-code"
          autoFocus
          inputMode="numeric"
          maxLength={9}
          placeholder="123456"
          textContentType="oneTimeCode"
        />
        {problem && <Problem>{problem}</Problem>}
        {note && (
          <T tone="muted" size={14} accessibilityLiveRegion="polite">
            {note}
          </T>
        )}
        <Button
          label={busy ? "Checking…" : "Confirm and sign in"}
          onPress={submit}
          disabled={busy}
        />
      </View>
      <T tone="muted" style={{ marginTop: 28, lineHeight: 24 }}>
        No email? Check your spam folder, or <TextLink onPress={sendAgain}>send a new code</TextLink>
        . Wrong address? <TextLink onPress={onBack}>Start again</TextLink>
      </T>
    </Screen>
  );
}
