import { DEFAULT_SETTINGS, VALID_LANGS, VALID_SEPARATORS } from "./constants.js";

export function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

export function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}

export function validateWord(word, fieldName = "word") {
  if (!isNonEmptyString(word)) {
    return { valid: false, error: `No ${fieldName} provided` };
  }
  return { valid: true, trimmed: word.trim() };
}

export function sanitizeSourceUrl(sourceUrl) {
  if (!isNonEmptyString(sourceUrl)) return "";
  try {
    return new URL(sourceUrl.trim()).origin;
  } catch {
    return "";
  }
}

export function normalizeSettings(settingsCandidate) {
  const normalized = { ...DEFAULT_SETTINGS };
  if (!isPlainObject(settingsCandidate)) {
    return normalized;
  }

  if (VALID_LANGS.has(settingsCandidate.sourceLang)) {
    normalized.sourceLang = settingsCandidate.sourceLang;
  }
  if (VALID_LANGS.has(settingsCandidate.targetLang)) {
    normalized.targetLang = settingsCandidate.targetLang;
  }
  if (VALID_SEPARATORS.has(settingsCandidate.separator)) {
    normalized.separator = settingsCandidate.separator;
  }

  return normalized;
}
