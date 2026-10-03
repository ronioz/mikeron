import { useEffect, useState } from "react";

import { applyTheme, chooseTheme, currentTheme, followDevice, type Theme } from "../theme";

/** The header button that switches between the light and dark theme. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    // index.html set the theme before the stylesheet loaded; now the address bar can match it.
    applyTheme(currentTheme());
    return followDevice(setTheme);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        chooseTheme(next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}
