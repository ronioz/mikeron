import type { ReactNode } from "react";
import { TextInput, type TextInputProps, View } from "react-native";

import { font, useTheme } from "@/lib/theme";

import { T } from "./T";

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** Under the field, unless there's an error to show there. */
  hint?: ReactNode;
}

/** A labelled text field, with what's wrong with it underneath. */
export function Field({ label, error, hint, style, ...input }: Props) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T size={14} weight="semibold">
        {label}
      </T>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        style={[
          {
            minHeight: 48,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: error ? theme.loss : theme.line,
            borderRadius: 12,
            backgroundColor: theme.raised,
            color: theme.text,
            fontFamily: font.regular,
            fontSize: 16,
          },
          style,
        ]}
      />
      {error ? (
        <T tone="loss" size={14} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : (
        hint
      )}
    </View>
  );
}
