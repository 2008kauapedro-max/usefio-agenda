"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  DEFAULT_REGION,
  detectBrowserLocale,
  getLocaleOption,
  isSupportedLocale,
  STORAGE_KEYS,
  type SupportedCurrency,
  type SupportedLocale,
} from "./config";
import { dictionaries } from "./dictionaries";

type SetLocaleOptions = {
  persistLocal?: boolean;
  updateDefaults?: boolean;
};

type I18nContextValue = {
  locale: SupportedLocale;
  region: string;
  currency: SupportedCurrency;
  ready: boolean;
  setLocale: (locale: SupportedLocale, options?: SetLocaleOptions) => void;
  setRegion: (region: string) => void;
  setCurrency: (currency: SupportedCurrency) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currencyOverride?: SupportedCurrency) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (window.localStorage.getItem(key) as T | null) ?? fallback;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);
  const [region, setRegionState] = useState(DEFAULT_REGION);
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedLocale = readStorage(STORAGE_KEYS.locale, "");
    const detectedLocale = detectBrowserLocale();

    const initialLocale = isSupportedLocale(storedLocale)
      ? storedLocale
      : detectedLocale;

    const localeOption = getLocaleOption(initialLocale);

    const storedRegion = readStorage(STORAGE_KEYS.region, "");
    setLocaleState(initialLocale);
    setRegionState(storedRegion || localeOption.defaultRegion || DEFAULT_REGION);
    setCurrencyState(DEFAULT_CURRENCY);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.currency, DEFAULT_CURRENCY);
    }

    document.documentElement.lang = initialLocale;
    setReady(true);
  }, []);

  const setLocale = useCallback(
    (nextLocale: SupportedLocale, options: SetLocaleOptions = {}) => {
      const { persistLocal = true, updateDefaults = true } = options;
      const localeOption = getLocaleOption(nextLocale);

      setLocaleState(nextLocale);

      if (typeof document !== "undefined") {
        document.documentElement.lang = nextLocale;
      }

      if (updateDefaults) {
        setRegionState(localeOption.defaultRegion);
        setCurrencyState(DEFAULT_CURRENCY);
      }

      if (persistLocal && typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEYS.locale, nextLocale);
        if (updateDefaults) {
          window.localStorage.setItem(
            STORAGE_KEYS.region,
            localeOption.defaultRegion
          );
          window.localStorage.setItem(STORAGE_KEYS.currency, DEFAULT_CURRENCY);
        }
      }
    },
    []
  );

  const setRegion = useCallback((nextRegion: string) => {
    const normalized = nextRegion.trim().toUpperCase();
    setRegionState(normalized);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.region, normalized);
    }
  }, []);

  const setCurrency = useCallback((nextCurrency: SupportedCurrency) => {
    setCurrencyState(nextCurrency);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.currency, nextCurrency);
    }
  }, []);

  const t = useCallback(
    (key: string, vars: Record<string, string | number> = {}) => {
      const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
      let text =
        dictionary[key] ??
        dictionaries[DEFAULT_LOCALE][key] ??
        key;

      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{{${name}}}`, String(value));
      }

      return text;
    },
    [locale]
  );

  const dateLocale = locale === "en" ? "en-US" : locale;

  const formatDate = useCallback(
    (
      value: Date | string | number,
      options: Intl.DateTimeFormatOptions = {}
    ) => {
      const date = value instanceof Date ? value : new Date(value);
      const hasExplicitDate = Boolean(
        options.dateStyle || options.weekday || options.era || options.year ||
        options.month || options.day
      );
      const normalized = hasExplicitDate ? options : { dateStyle: "short" as const, ...options };
      return new Intl.DateTimeFormat(dateLocale, normalized).format(date);
    },
    [dateLocale]
  );

  const formatTime = useCallback(
    (
      value: Date | string | number,
      options: Intl.DateTimeFormatOptions = {}
    ) => {
      const date = value instanceof Date ? value : new Date(value);
      const hasExplicitTime = Boolean(options.timeStyle || options.hour || options.minute || options.second);
      const normalized = hasExplicitTime ? options : { hour: "2-digit" as const, minute: "2-digit" as const, ...options };
      return new Intl.DateTimeFormat(dateLocale, normalized).format(date);
    },
    [dateLocale]
  );

  const formatNumber = useCallback(
    (value: number, options: Intl.NumberFormatOptions = {}) => {
      return new Intl.NumberFormat(dateLocale, options).format(value);
    },
    [dateLocale]
  );

  const formatCurrency = useCallback(
    (value: number, currencyOverride?: SupportedCurrency) => {
      return new Intl.NumberFormat(dateLocale, {
        style: "currency",
        currency: currencyOverride ?? currency,
      }).format(value);
    },
    [currency, dateLocale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      region,
      currency,
      ready,
      setLocale,
      setRegion,
      setCurrency,
      t,
      formatDate,
      formatTime,
      formatNumber,
      formatCurrency,
    }),
    [
      locale,
      region,
      currency,
      ready,
      setLocale,
      setRegion,
      setCurrency,
      t,
      formatDate,
      formatTime,
      formatNumber,
      formatCurrency,
    ]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
