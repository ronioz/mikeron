import type { ReactNode } from "react";
import { Linking, View } from "react-native";

import { Button } from "@/components/Button";
import { Loadable } from "@/components/Loadable";
import { Screen } from "@/components/Screen";
import { T } from "@/components/T";
import { api, WEBSITE } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { PERIODS } from "@/lib/plan";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";

function Setting({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: 20, gap: 8, borderTopWidth: 1, borderColor: theme.line }}>
      <T accessibilityRole="header" size={18} weight="medium">
        {title}
      </T>
      {children}
    </View>
  );
}

export default function AccountScreen() {
  const { signOut } = useSession();
  const state = useApi(api.getAccount);
  return (
    <Screen refresh={state}>
      <T
        accessibilityRole="header"
        size={32}
        weight="medium"
        style={{ marginTop: 16, marginBottom: 24, letterSpacing: -0.64, lineHeight: 36 }}
      >
        Account
      </T>
      <Loadable state={state}>
        {(account) => (
          <>
            <Setting title="Email">
              <T tone="soft">{account.email}</T>
            </Setting>
            <Setting title="Plan">
              <T tone="soft">
                {formatMoney(account.plan_amount)} {PERIODS[account.plan_period].each}
              </T>
            </Setting>
          </>
        )}
      </Loadable>
      <Setting title="On the website">
        <T tone="soft" style={{ lineHeight: 24 }}>
          Your plan, your password and deleting your account are on the website for now.
        </T>
        <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Button
            secondary
            label="Account settings"
            onPress={() => void Linking.openURL(`${WEBSITE}/account`)}
          />
          <Button
            secondary
            label="Privacy"
            onPress={() => void Linking.openURL(`${WEBSITE}/privacy`)}
          />
        </View>
      </Setting>
      <Setting title="Sign out">
        <T tone="soft">Only this phone is signed out.</T>
        <View style={{ marginTop: 8 }}>
          <Button secondary label="Sign out" onPress={signOut} />
        </View>
      </Setting>
    </Screen>
  );
}
