import { useColorScheme } from "react-native";

// The website's colours (frontend/src/styles.css): neutral greys when dark,
// creamy when light. Green and red are for money only.

export interface Theme {
  bg: string;
  /** A step off the page: fields, the chosen option of a switch. */
  raised: string;
  text: string;
  /** Notes, a little softer than the figures. */
  textSoft: string;
  muted: string;
  /** Thin lines: `line` between sections, the fainter `lineSoft` between rows. */
  line: string;
  lineSoft: string;
  accent: string;
  accentText: string;
  gain: string;
  loss: string;
  /** Chart colours: shades of the text colour, strongest first. */
  series: [string, string, string, string];
}

const light: Theme = {
  bg: "#f3f0e8",
  raised: "#fcfaf5",
  text: "#1b1a17",
  textSoft: "#45423c",
  muted: "#5f5c55",
  line: "#ddd8cc",
  lineSoft: "#e8e4da",
  accent: "#1b1a17",
  accentText: "#fcfaf5",
  gain: "#1d7a45",
  loss: "#b0362c",
  series: ["#1b1a17", "#5f5c55", "#9b978e", "#cfcac0"],
};

const dark: Theme = {
  bg: "#0e0e0e",
  raised: "#1a1a1a",
  text: "#f2f2f0",
  textSoft: "#bdbdbd",
  muted: "#8f8f8f",
  line: "#262626",
  lineSoft: "#1f1f1f",
  accent: "#f2f2f0",
  accentText: "#0e0e0e",
  gain: "#4cc38a",
  loss: "#f0766b",
  series: ["#f2f2f0", "#c0c0c0", "#909090", "#636363"],
};

/** The brokers' own colours, the same in both themes, with dark text on both. */
export const BROKER_COLORS = { tbc: "#00afef", bog: "#ff6022", text: "#0e0e0e" };

/**
 * The names the fonts are loaded under (see src/app/_layout.tsx). Android picks
 * a weight by name, not with fontWeight. The serif is for the wordmark alone.
 */
export const font = {
  regular: "InstrumentSans_400Regular",
  medium: "InstrumentSans_500Medium",
  semibold: "InstrumentSans_600SemiBold",
  serif: "InstrumentSerif_400Regular",
};

/** The theme to draw with: the phone's own light or dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
