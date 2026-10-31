import { Text, type TextProps } from "react-native";

import { font, useTheme } from "@/lib/theme";

interface Props extends TextProps {
  tone?: "text" | "soft" | "muted" | "gain" | "loss";
  weight?: "regular" | "medium" | "semibold";
  size?: number;
  /** For columns of figures, so the digits line up. */
  tabular?: boolean;
}

/**
 * All text, in the sans the website uses for figures and notes. Text inside
 * other text doesn't inherit a size from it here: give it its own.
 */
export function T({ tone = "text", weight = "regular", size = 16, tabular, style, ...rest }: Props) {
  const theme = useTheme();
  const color = {
    text: theme.text,
    soft: theme.textSoft,
    muted: theme.muted,
    gain: theme.gain,
    loss: theme.loss,
  }[tone];
  return (
    <Text
      {...rest}
      style={[
        { color, fontFamily: font[weight], fontSize: size },
        tabular ? { fontVariant: ["tabular-nums"] } : undefined,
        style,
      ]}
    />
  );
}

interface LinkProps {
  onPress: () => void;
  size?: number;
  children: string;
}

/** A piece of text that opens something. Links are the text colour, so an underline marks them. */
export function TextLink({ onPress, size = 16, children }: LinkProps) {
  return (
    <T
      onPress={onPress}
      accessibilityRole="link"
      style={{ textDecorationLine: "underline" }}
      size={size}
    >
      {children}
    </T>
  );
}
