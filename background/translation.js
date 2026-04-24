import { MAX_TRANSLATIONS } from "./constants.js";
import { validateWord, isNonEmptyString } from "./validation.js";
import { getSettings } from "./settings.js";

async function fetchTranslationData(word) {
  const settings = await getSettings();
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", word);
  url.searchParams.set("langpair", `${settings.sourceLang}|${settings.targetLang}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function parseQuality(q) {
  if (typeof q === "number") return q;
  if (typeof q === "string") return parseInt(q, 10) || 0;
  return 0;
}

/**
 * Extract unique translations from MyMemory API response.
 * Returns up to MAX_TRANSLATIONS unique, non-empty strings.
 * The primary translation (responseData.translatedText) is always first.
 */
function extractTranslations(data, normalizedWord) {
  const seen = new Set();
  const results = [];

  function add(text) {
    if (!isNonEmptyString(text)) return;
    const trimmed = text.trim();
    const key = trimmed.toLowerCase();
    if (key === normalizedWord || seen.has(key)) return;
    seen.add(key);
    results.push(trimmed);
  }

  if (data.responseData) {
    add(data.responseData.translatedText);
  }

  if (Array.isArray(data.matches)) {
    const sorted = [...data.matches].sort(
      (a, b) => parseQuality(b.quality) - parseQuality(a.quality)
    );
    for (const m of sorted) {
      if (results.length >= MAX_TRANSLATIONS) break;
      add(m.translation);
    }
  }

  return results;
}

export async function handleGetTranslations(word) {
  try {
    const check = validateWord(word, "word");
    if (!check.valid) return { success: false, error: check.error };

    const data = await fetchTranslationData(check.trimmed);

    if (data.responseStatus !== 200 || !data.responseData) {
      return { success: false, error: data.responseDetails || "Translation not found" };
    }

    const translations = extractTranslations(data, check.trimmed.toLowerCase());
    if (translations.length === 0) {
      return { success: false, error: "Translation not found" };
    }

    return { success: true, translations };
  } catch (err) {
    console.error("Vocab Stash: translation error", err);
    return { success: false, error: "Translation service unavailable" };
  }
}
