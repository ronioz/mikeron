import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";

import {
  applyTheme,
  choosePreference,
  currentPreference,
  currentTheme,
  followDevice,
  type Preference,
} from "../theme";

const CHOICES: Record<Preference, { label: string; Icon: () => ReactElement }> = {
  light: { label: "Light", Icon: SunIcon },
  dark: { label: "Dark", Icon: MoonIcon },
  system: { label: "Match device", Icon: DeviceIcon },
};
// The menu's order.
const ORDER: Preference[] = ["light", "dark", "system"];

/**
 * The header's theme switch: a button showing the current choice, which opens
 * a menu of Light, Dark and Match device. Keyboard and screen reader use
 * follow the usual menu button pattern: arrows move, Escape closes.
 */
export function ThemeMenu() {
  const [preference, setPreference] = useState(currentPreference);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    // index.html set the theme before the stylesheet loaded; now the address bar can match it.
    applyTheme(currentTheme());
    return followDevice();
  }, []);

  // While the menu is open, focus starts on the current choice and a click or tap outside closes it.
  useEffect(() => {
    if (!open) return;
    items.current[ORDER.indexOf(preference)]?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function choose(choice: Preference) {
    button.current?.focus();
    if (choice === preference) {
      setOpen(false);
      return;
    }
    setPreference(choice);
    setOpen(false);
    choosePreference(choice);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.current.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (next: number) => items.current[(next + ORDER.length) % ORDER.length]?.focus();
    if (!open) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else if (event.key === "ArrowDown") focus(index + 1);
    else if (event.key === "ArrowUp") focus(index < 0 ? ORDER.length - 1 : index - 1);
    else if (event.key === "Home") focus(0);
    else if (event.key === "End") focus(ORDER.length - 1);
    else return;
    event.preventDefault();
  }

  const current = CHOICES[preference];
  return (
    <div className="theme-menu" ref={wrapper} onKeyDown={onKeyDown}>
      <button
        ref={button}
        className="theme-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Theme: ${current.label}`}
        title="Theme"
        onClick={() => setOpen(!open)}
      >
        <current.Icon />
        <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="theme-options" id={menuId} role="menu" aria-label="Theme">
          {ORDER.map((value, index) => {
            const { label, Icon } = CHOICES[value];
            return (
              <button
                key={value}
                ref={(node) => {
                  items.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={value === preference}
                tabIndex={-1}
                onClick={() => choose(value)}
              >
                <Icon />
                {label}
                {value === preference && (
                  <svg className="check" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
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

/** A circle half filled: light and dark, whichever the device uses. */
function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </svg>
  );
}
