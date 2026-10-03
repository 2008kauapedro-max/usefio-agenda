import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportedCurrency, SupportedLocale } from "./config";
import { isSupportedLocale } from "./config";

export type LocalePreferences = {
  preferred_locale: SupportedLocale;
  preferred_region: string;
  preferred_currency: SupportedCurrency;
  explicit?: boolean;
};

export async function loadLocalePreferences(
  supabase: SupabaseClient,
  shopId: string,
  userId: string
): Promise<LocalePreferences | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("preferred_locale, preferred_region, preferred_currency, locale_preference_set")
    .eq("barbershop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    preferred_locale: isSupportedLocale(data.preferred_locale) ? data.preferred_locale : "pt-BR",
    preferred_region: /^[A-Z]{2}$/.test(data.preferred_region || "") ? data.preferred_region : "BR",
    preferred_currency: (data.preferred_currency || "BRL") as SupportedCurrency,
    explicit: Boolean(data.locale_preference_set),
  };
}

export async function saveLocalePreferences(
  supabase: SupabaseClient,
  shopId: string,
  preferences: LocalePreferences
) {
  const { error } = await supabase.rpc("set_locale_preferences", {
    p_shop: shopId,
    p_locale: preferences.preferred_locale,
    p_region: preferences.preferred_region.trim().toUpperCase(),
    p_currency: preferences.preferred_currency,
  });
  if (error) throw error;
}
