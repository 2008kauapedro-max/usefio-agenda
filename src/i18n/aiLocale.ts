import type { SupportedLocale } from "./config";

const AI_LANGUAGE_RULES: Record<SupportedLocale, string> = {
  "pt-BR":
    "Responda em português do Brasil, de forma natural, curta e objetiva. Se o usuário pedir explicitamente outro idioma, acompanhe o idioma solicitado.",
  en:
    "Respond in English naturally, briefly, and directly. If the user explicitly requests another language, follow the requested language.",
  es:
    "Responde en español de forma natural, breve y directa. Si el usuario solicita explícitamente otro idioma, utiliza el idioma solicitado.",
  fr:
    "Réponds en français de manière naturelle, brève et directe. Si l'utilisateur demande explicitement une autre langue, utilise la langue demandée.",
  de:
    "Antworte auf Deutsch, natürlich, kurz und direkt. Wenn der Nutzer ausdrücklich eine andere Sprache verlangt, verwende die gewünschte Sprache.",
  it:
    "Rispondi in italiano in modo naturale, breve e diretto. Se l'utente richiede esplicitamente un'altra lingua, usa la lingua richiesta.",
};

export function getAiLocaleInstruction(locale: SupportedLocale) {
  return AI_LANGUAGE_RULES[locale] ?? AI_LANGUAGE_RULES["pt-BR"];
}

export function withLocaleInstruction(
  baseSystemPrompt: string,
  locale: SupportedLocale
) {
  return [
    baseSystemPrompt.trim(),
    "",
    "LANGUAGE / LOCALE RULE:",
    getAiLocaleInstruction(locale),
  ]
    .filter(Boolean)
    .join("\n");
}
