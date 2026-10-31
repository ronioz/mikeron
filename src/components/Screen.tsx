import type { ReactNode } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, useTheme } from "@/lib/theme";

/** The name, in the serif, which goes on nothing else. */
function Wordmark() {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: theme.text, fontFamily: font.serif, fontSize: 28, lineHeight: 34 }}
    >
      Mikeronn
    </Text>
  );
}

interface Props {
  children: ReactNode;
  /** Lets the screen be pulled down to load it again. */
  refresh?: { pulling: boolean; pull: () => void };
}

/** Every screen: the page colour, the name at the top, and scrolling. */
export function Screen({ children, refresh }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 32,
        }}
        refreshControl={
          refresh && (
            <RefreshControl
              refreshing={refresh.pulling}
              onRefresh={refresh.pull}
              tintColor={theme.text}
              colors={[theme.text]}
              progressBackgroundColor={theme.raised}
            />
          )
        }
      >
        <Wordmark />
        <View style={{ marginTop: 8 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
