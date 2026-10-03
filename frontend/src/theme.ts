// Light or dark. index.html picks one before the page draws, with the same
// rule as here: the one chosen with the header switch, else the device's.

export type Theme = "light" | "dark";

const KEY = "theme";
const deviceDark = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The theme chosen with the switch, if any. Storage can be blocked, e.g. in private windows. */
function chosenTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Shows a theme, and tints a phone browser's address bar to match the page. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const page = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", page);
}

/** Remembers a theme picked with the switch, so it wins over the device's from now on. */
export function chooseTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered, but still shown until the page is closed.
  }
}

/** Until a theme is picked with the switch, follow the device's as it changes. Returns a stop function. */
export function followDevice(onChange: (theme: Theme) => void): () => void {
  const query = deviceDark();
  const listener = () => {
    if (chosenTheme()) return;
    const theme = query.matches ? "dark" : "light";
    applyTheme(theme);
    onChange(theme);
  };
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
