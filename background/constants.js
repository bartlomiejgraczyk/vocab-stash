export const DEFAULT_SETTINGS = {
  sourceLang: "en",
  targetLang: "pl",
  separator: "\t",
};

export const MAX_TRANSLATIONS = 5;

export const VALID_LANGS = new Set([
  "en", "de", "fr", "es", "it", "pt", "nl", "sv", "ru", "uk", "ja", "zh", "ko", "pl",
]);

export const VALID_SEPARATORS = new Set(["\t", ",", ";", " - "]);
