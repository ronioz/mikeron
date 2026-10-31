import type { ReactNode } from "react";
import { View } from "react-native";

import { type ApiState, useSlow } from "@/lib/useApi";
import { useTheme } from "@/lib/theme";

import { Button } from "./Button";
import { T } from "./T";

/** The server sleeps when nobody's using it, so a first load can take a minute. */
function Waiting() {
  const slow = useSlow(true);
  return (
    <T tone="muted" accessibilityLiveRegion="polite" style={{ marginTop: 20 }}>
      {slow ? "Waking the server. This can take a minute." : "Loading…"}
    </T>
  );
}

interface Props<T> {
  state: ApiState<T>;
  children: (data: T) => ReactNode;
}

/** Shows a loading or error message until data arrives, then renders it. */
export function Loadable<Data>({ state, children }: Props<Data>) {
  const theme = useTheme();
  if (state.data === undefined) {
    if (state.error) {
      return (
        <View
          style={{
            marginTop: 32,
            paddingVertical: 56,
            paddingHorizontal: 16,
            alignItems: "center",
            gap: 20,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.line,
          }}
        >
          <T size={24} weight="medium" style={{ textAlign: "center" }}>
            {state.error.message}
          </T>
          <Button secondary centered label="Try again" onPress={state.reload} />
        </View>
      );
    }
    return <Waiting />;
  }
  return (
    <>
      {state.error && (
        <T tone="loss" size={14} style={{ marginTop: 12 }}>
          Couldn't refresh just now. Showing what was loaded earlier.
        </T>
      )}
      {children(state.data)}
    </>
  );
}
