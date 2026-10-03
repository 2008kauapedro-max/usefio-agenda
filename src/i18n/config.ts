export const SUPPORTED_LOCALES = [
  "pt-BR",
  "en",
  "es",
  "fr",
  "de",
  "it",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type SupportedCurrency =
  | "BRL"
  | "USD"
  | "EUR"
  | "GBP"
  | "MXN"
  | "ARS";

export const DEFAULT_LOCALE: SupportedLocale = "pt-BR";
export const DEFAULT_REGION = "BR";
export const DEFAULT_CURRENCY: SupportedCurrency = "BRL";

export const STORAGE_KEYS = {
  locale: "fio:locale",
  region: "fio:region",
  currency: "fio:currency",
  languageGateDone: "fio:language-gate-done",
} as const;

export const LOCALE_OPTIONS: Array<{
  value: SupportedLocale;
  label: string;
  nativeLabel: string;
  flag: string;
  defaultRegion: string;
  defaultCurrency: SupportedCurrency;
}> = [
  {
    value: "pt-BR",
    label: "Português (Brasil)",
    nativeLabel: "Português (Brasil)",
    flag: "🇧🇷",
    defaultRegion: "BR",
    defaultCurrency: "BRL",
  },
  {
    value: "en",
    label: "English",
    nativeLabel: "English",
    flag: "🇺🇸",
    defaultRegion: "US",
    defaultCurrency: "BRL",
  },
  {
    value: "es",
    label: "Spanish",
    nativeLabel: "Español",
    flag: "🇪🇸",
    defaultRegion: "ES",
    defaultCurrency: "BRL",
  },
  {
    value: "fr",
    label: "French",
    nativeLabel: "Français",
    flag: "🇫🇷",
    defaultRegion: "FR",
    defaultCurrency: "BRL",
  },
  {
    value: "de",
    label: "German",
    nativeLabel: "Deutsch",
    flag: "🇩🇪",
    defaultRegion: "DE",
    defaultCurrency: "BRL",
  },
  {
    value: "it",
    label: "Italian",
    nativeLabel: "Italiano",
    flag: "🇮🇹",
    defaultRegion: "IT",
    defaultCurrency: "BRL",
  },
];

export function isSupportedLocale(value?: string | null): value is SupportedLocale {
  return !!value && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function normalizeLocale(value?: string | null): SupportedLocale {
  if (!value) return DEFAULT_LOCALE;

  if (isSupportedLocale(value)) return value;

  const lower = value.toLowerCase();

  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("it")) return "it";

  return DEFAULT_LOCALE;
}

export function getLocaleOption(locale: SupportedLocale) {
  return (
    LOCALE_OPTIONS.find((option) => option.value === locale) ??
    LOCALE_OPTIONS[0]
  );
}

export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized !== DEFAULT_LOCALE || candidate?.toLowerCase().startsWith("pt")) {
      return normalized;
    }
  }

  return DEFAULT_LOCALE;
}
