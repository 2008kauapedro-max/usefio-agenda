import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  detectBrowserLocale,
  isSupportedLocale,
  STORAGE_KEYS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../../src/i18n/config";
import { messages, features, type MessageKey } from "./messages";
export { LOCALE_OPTIONS } from "../../../src/i18n/config";
const Context = createContext<{
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
} | null>(null);
export function MarketingI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.locale);
      if (isSupportedLocale(saved)) return saved;
    } catch {
      /* Storage may be blocked. */
    }
    return detectBrowserLocale();
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEYS.locale, locale);
    } catch {
      /* Translation still works without storage. */
    }
  }, [locale]);
  return (
    <Context.Provider value={{ locale, setLocale }}>
      {children}
    </Context.Provider>
  );
}
export function useMarketingI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("MarketingI18nProvider is required");
  const index = SUPPORTED_LOCALES.indexOf(context.locale);
  const t = (key: MessageKey, vars: Record<string, string | number> = {}) =>
    messages[key][index].replace(/\{(\w+)\}/g, (match, name: string) =>
      String(vars[name] ?? match),
    );
  const translateFeature = (feature: string) => {
    if (features[feature]) return features[feature][index];
    if (feature === "Responsável + 1 profissional") return t("ownerStaff");
    const patterns: [RegExp, MessageKey][] = [
      [/^Até ([\d.]+) clientes$/, "limitClients"],
      [/^Até (\d+) profissionais \+ responsável$/, "limitStaff"],
      [/^Até (\d+) serviços$/, "limitServices"],
      [/^Até (\d+) pacotes de cortes$/, "limitPackages"],
      [/^(\d+) consultas de IA por usuário\/dia$/, "limitAi"],
    ];
    for (const [pattern, key] of patterns) {
      const match = feature.match(pattern);
      if (match)
        return t(key, {
          n: new Intl.NumberFormat(context.locale).format(
            Number(match[1].replaceAll(".", "")),
          ),
        });
    }
    return feature;
  };
  return { ...context, t, translateFeature };
}
