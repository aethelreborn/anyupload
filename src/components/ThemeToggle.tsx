"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/Icons";

export const THEME_STORAGE_KEY = "anyupload.theme";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];

const LABEL: Record<Theme, string> = {
  system: "Match system theme",
  light: "Light theme",
  dark: "Dark theme",
};

/** Fired after the theme changed, so the button can follow along. */
const THEME_EVENT = "anyupload:theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : "system";
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

function getServerSnapshot(): Theme {
  return "system";
}

/**
 * Cycles between "follow the system", light and dark.
 *
 * The choice is stored in localStorage and applied by a tiny inline script in
 * the document head, so the first paint already uses the right colours.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readTheme,
    getServerSnapshot,
  );

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    applyTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Private mode, storage is not available. The theme still applies.
    }
  }

  const Icon =
    theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon;

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]} (click to change)`}
      className="focus-ring rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * Runs before the first paint so the page never flashes the wrong theme.
 */
export const themeScript = `(()=>{try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
