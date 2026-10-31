import { InstrumentSans_400Regular } from "@expo-google-fonts/instrument-sans/400Regular";
import { InstrumentSans_500Medium } from "@expo-google-fonts/instrument-sans/500Medium";
import { InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans/600SemiBold";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";

import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

// Stays up until the fonts and the stored sign-in are ready, so the app opens
// on the right screen in the right fonts rather than flashing through others.
void SplashScreen.preventAutoHideAsync();

function Navigator({ fontsReady }: { fontsReady: boolean }) {
  const { loading, signedIn } = useSession();
  const theme = useTheme();
  const ready = fontsReady && !loading;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.bg);
  }, [theme.bg]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Bundled in the app, like the website's: no font service is asked for them.
  // If they fail to load the app still opens, in the phone's own font.
  const [loaded, failed] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSerif_400Regular,
  });
  return (
    <SessionProvider>
      <Navigator fontsReady={loaded || failed !== null} />
    </SessionProvider>
  );
}
