import type { ReactNode } from "react";

interface Props {
  /** The id of the input inside, which the label points to. */
  name: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error: string | undefined;
  children: ReactNode;
}

/** A form field: its label, the input, a hint under it and the server's complaint, if any. */
export function Field({ name, label, optional, hint, error, children }: Props) {
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {optional && <small> optional</small>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
