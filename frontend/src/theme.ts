// Light or dark. index.html picks one before the page draws, with the same
// rule as here: the one chosen in the header menu, else the device's.

export type Theme = "light" | "dark";
/** A choice in the header menu: a theme, or "system" to match the device's. */
export type Preference = Theme | "system";

const KEY = "theme";
const deviceDark = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The choice remembered from the menu. Storage can be blocked, e.g. in private windows. */
function storedPreference(): Preference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

// Also kept here, so a choice holds for the visit even where storage is blocked.
let preference = storedPreference();

export function currentPreference(): Preference {
  return preference;
}

/** The theme a choice shows right now. */
export function themeFor(choice: Preference): Theme {
  if (choice !== "system") return choice;
  return deviceDark().matches ? "dark" : "light";
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

/**
 * Remembers a choice from the menu and shows its theme. "system" forgets the
 * chosen theme, so the device's applies again, here and in index.html.
 */
export function choosePreference(choice: Preference) {
  preference = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered, but still shown until the page is closed.
  }
  applyTheme(themeFor(choice));
}

/** While the choice is "system", follow the device's theme as it changes. Returns a stop function. */
export function followDevice(): () => void {
  const query = deviceDark();
  const listener = () => {
    if (preference === "system") applyTheme(themeFor("system"));
  };
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
