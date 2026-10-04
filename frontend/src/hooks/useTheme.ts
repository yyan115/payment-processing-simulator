import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// The saved theme is applied before the first paint by a script in index.html.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("payment-simulator-theme", theme);
    } catch {
      /* The choice only lasts for this page when storage is unavailable. */
    }
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme(theme === "light" ? "dark" : "light"),
  };
}
