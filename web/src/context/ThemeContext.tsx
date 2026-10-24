import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { readStorage, writeStorage } from "@/lib/storage";
const Context = createContext<{
  resolvedTheme: "light" | "dark";
  toggle: () => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = readStorage<unknown>("cards.theme.v1", "");
    return stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    writeStorage("cards.theme.v1", next);
  };
  return (
    <Context.Provider value={{ resolvedTheme: theme, toggle }}>
      {children}
    </Context.Provider>
  );
}
export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing ThemeProvider");
  return value;
}
