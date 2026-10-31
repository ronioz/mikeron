import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/lib/theme";

interface Option<Id> {
  id: Id;
  /** What a screen reader says for it. */
  name: string;
  content: ReactNode;
}

interface Props<Id> {
  label: string;
  options: Option<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}

/** A pill of equal options, one chosen, as the website's switches are. */
export function Segmented<Id extends string>({ label, options, value, onChange }: Props<Id>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        gap: 2,
        padding: 4,
        borderWidth: 1,
        borderColor: theme.line,
        borderRadius: 999,
      }}
    >
      {options.map((option) => {
        const chosen = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.name}
            aria-checked={chosen}
            onPress={() => onChange(option.id)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 36,
              borderWidth: 1,
              borderRadius: 999,
              borderColor: chosen ? theme.line : "transparent",
              backgroundColor: chosen ? theme.raised : "transparent",
            }}
          >
            {option.content}
          </Pressable>
        );
      })}
    </View>
  );
}
