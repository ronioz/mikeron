import { type ReactNode, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBrowserSnap } from "@/lib/snap";
import { font, useTheme } from "@/lib/theme";

/** The name, in the serif, which goes on nothing else. */
function Wordmark() {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: theme.text,
        fontFamily: font.serif,
        fontSize: 28,
        lineHeight: 34,
        textAlign: "center",
      }}
    >
      Mikeronn
    </Text>
  );
}

interface Props {
  children: ReactNode;
  /**
   * What comes after `children`, on a page of its own: `children` have the
   * first screen to themselves, and one swipe brings this to the top.
   */
  below?: ReactNode;
  /** Lets the screen be pulled down to load it again. */
  refresh?: { pulling: boolean; pull: () => void };
}

/** Every screen: the page colour, the name at the top, and scrolling. */
export function Screen({ children, below, refresh }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // How much of the scrolling area is on screen, and how tall the first page came out.
  const [shown, setShown] = useState(0);
  const [firstPage, setFirstPage] = useState(0);
  // A first page too tall for the screen scrolls freely: on a small phone or with
  // large text, a snap would jump past whatever hangs off the bottom of it.
  const snaps = Boolean(below) && firstPage <= shown + 1;
  const view = useRef<ScrollViewInstance>(null);
  useBrowserSnap(view, snaps ? firstPage : undefined);
  const page = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32 };
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        ref={view}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => setShown(event.nativeEvent.layout.height)}
        // A swipe from the first page stops where the second starts, however hard
        // it was. Past that point the second page scrolls freely.
        snapToOffsets={snaps ? [firstPage] : undefined}
        snapToEnd={false}
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
        <View
          onLayout={(event) => setFirstPage(event.nativeEvent.layout.height)}
          style={[page, below ? { minHeight: shown } : undefined]}
        >
          <Wordmark />
          <View style={{ marginTop: 8 }}>{children}</View>
        </View>
        {below ? <View style={[page, { minHeight: shown }]}>{below}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
