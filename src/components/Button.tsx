import { Pressable } from "react-native";

import { useTheme } from "@/lib/theme";

import { T } from "./T";

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  /** In the middle of the line, under centred text, rather than at its start. */
  centered?: boolean;
}

export function Button({ label, onPress, disabled, secondary, centered }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      aria-disabled={Boolean(disabled)}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: centered ? "center" : "flex-start",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 44,
        paddingHorizontal: 22,
        borderWidth: 1,
        borderColor: secondary ? theme.line : theme.accent,
        borderRadius: 999,
        backgroundColor: secondary ? "transparent" : theme.accent,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      <T
        weight="semibold"
        style={{ color: secondary ? theme.text : theme.accentText }}
      >
        {label}
      </T>
    </Pressable>
  );
}
