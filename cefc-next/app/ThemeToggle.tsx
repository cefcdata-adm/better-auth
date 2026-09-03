"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const themeOptions: ThemeMode[] = ["light", "dark", "system"];

const themeLabels: Record<ThemeMode, string> = {
  light: "Light theme",
  dark: "Dark theme",
  system: "System theme",
};

function getResolvedTheme(mode: ThemeMode) {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = getResolvedTheme(mode);
}

export function ThemeToggle() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as ThemeMode | null;
    const initialTheme = storedTheme && themeOptions.includes(storedTheme) ? storedTheme : "system";
    setThemeMode(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if ((localStorage.getItem("theme") ?? "system") === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, []);

  function handleThemeChange(mode: ThemeMode) {
    setThemeMode(mode);
    localStorage.setItem("theme", mode);
    applyTheme(mode);
  }

  if (!mounted) return null;

  return (
    <div className="mb-3 rounded-xl border border-zinc-800 bg-[#1c1c1c] p-2 theme-toggle">
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Theme preference">
        {themeOptions.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => handleThemeChange(mode)}
            aria-pressed={themeMode === mode}
            aria-label={themeLabels[mode]}
            title={themeLabels[mode]}
            className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
              themeMode === mode
                ? "bg-emerald-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <ThemeIcon mode={mode} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.99 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.78 9.79Z" />
      </svg>
    );
  }

  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="12" x="3" y="4" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}
