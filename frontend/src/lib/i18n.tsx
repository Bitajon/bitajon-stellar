import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/*
 * Idioma de la página (español / inglés).
 * Cada texto se escribe en los dos idiomas donde se usa: tr("Donar", "Donate").
 * Así no hay archivos de traducción que se desincronicen y se lee fácil en el código.
 * Al cambiar de idioma, la app se vuelve a montar (key={lang}) y todos los textos se actualizan.
 */
export type Lang = "es" | "en";

const STORAGE_KEY = "bitajon.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* sin almacenamiento */
  }
  if (typeof navigator !== "undefined" && navigator.language && !navigator.language.toLowerCase().startsWith("es")) return "en";
  return "es";
}

let current: Lang = initialLang();

/** Idioma actual (también para código fuera de React, como los mensajes de error). */
export function getLang(): Lang {
  return current;
}

/** Texto en el idioma actual. */
export function tr(es: string, en: string): string {
  return current === "en" ? en : es;
}

/** Locale para números y fechas. */
export function locale(): string {
  return current === "en" ? "en-US" : "es-CO";
}

type LangState = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: (lang: Lang) => ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* sin almacenamiento */
    }
    setLangState(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children(lang)}</LangContext.Provider>;
}

export function useLang(): LangState {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang debe usarse dentro de <LangProvider>");
  return ctx;
}
