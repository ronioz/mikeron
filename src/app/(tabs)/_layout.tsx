import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountIcon, JournalIcon, PortfolioIcon } from "@/components/icons";
import { font, useTheme } from "@/lib/theme";

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // The tab bar hands icons either tint above, which it types as any colour value.
  const tint = (focused: boolean) => (focused ? theme.text : theme.muted);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
        // The default height has no room for a 28px icon and a 16px label, which
        // cuts the label off: each tab keeps 10px of padding of its own, so this
        // leaves 45px for the two. The inset keeps clear of the phone's own bar.
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
          backgroundColor: theme.bg,
          borderTopColor: theme.line,
        },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Journal",
          tabBarIcon: ({ focused, size }) => <JournalIcon color={tint(focused)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          tabBarIcon: ({ focused, size }) => <PortfolioIcon color={tint(focused)} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ focused, size }) => <AccountIcon color={tint(focused)} size={size} />,
        }}
      />
    </Tabs>
  );
}
