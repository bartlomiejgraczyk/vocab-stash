// ===== Vocab Stash - Background Service Worker =====
// Handles translation requests (MyMemory API) and chrome.storage operations.

const DEFAULT_SETTINGS = {
  sourceLang: "en",
  targetLang: "pl",
  separator: "\t",
};

// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getTranslations":
      handleGetTranslations(message.word).then(sendResponse);
      return true;

    case "saveWord":
      handleSaveWord(message).then(sendResponse);
      return true;

    case "getWords":
      handleGetWords().then(sendResponse);
      return true;

    case "deleteWord":
      handleDeleteWord(message.id).then(sendResponse);
      return true;

    case "clearWords":
      handleClearWords().then(sendResponse);
      return true;

    case "getSettings":
      handleGetSettings().then(sendResponse);
      return true;

    case "saveSettings":
      handleSaveSettings(message.settings).then(sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }
});

// ---- Translation ----

const MAX_TRANSLATIONS = 5;

async function fetchTranslationData(word) {
  const settings = await getSettings();
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", word.trim());
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
 * Returns an array of unique, non-empty translation strings (max MAX_TRANSLATIONS).
 * The primary translation (responseData.translatedText) is always first if valid.
 */
function extractTranslations(data, normalizedWord) {
  const seen = new Set();
  const results = [];

  function addTranslation(text) {
    if (typeof text !== "string" || !text.trim()) return;
    const trimmed = text.trim();
    const key = trimmed.toLowerCase();
    // Skip if it's the same as the source word or already seen
    if (key === normalizedWord || seen.has(key)) return;
    seen.add(key);
    results.push(trimmed);
  }

  // Primary translation first
  if (data.responseData) {
    addTranslation(data.responseData.translatedText);
  }

  // Additional matches sorted by quality (descending)
  if (Array.isArray(data.matches)) {
    const sorted = [...data.matches].sort(
      (a, b) => parseQuality(b.quality) - parseQuality(a.quality)
    );

    for (const m of sorted) {
      if (results.length >= MAX_TRANSLATIONS) break;
      addTranslation(m.translation);
    }
  }

  return results;
}

async function handleGetTranslations(word) {
  try {
    if (!word || typeof word !== "string" || !word.trim()) {
      return { success: false, error: "No word provided" };
    }

    const data = await fetchTranslationData(word);

    if (data.responseStatus !== 200 || !data.responseData) {
      return {
        success: false,
        error: data.responseDetails || "Translation not found",
      };
    }

    const normalizedWord = word.trim().toLowerCase();
    const translations = extractTranslations(data, normalizedWord);

    if (translations.length === 0) {
      return { success: false, error: "Translation not found" };
    }

    return { success: true, translations };
  } catch (err) {
    console.error("Vocab Stash: translation error", err);
    return { success: false, error: "Translation service unavailable" };
  }
}

// ---- Word Storage ----

async function getStoredWords() {
  const { words } = await chrome.storage.local.get("words");
  return Array.isArray(words) ? words : [];
}

async function handleSaveWord({ word, translation, sourceUrl } = {}) {
  try {
    if (!word || typeof word !== "string" || !word.trim()) {
      return { success: false, error: "No word provided" };
    }
    if (!translation || typeof translation !== "string" || !translation.trim()) {
      return { success: false, error: "No translation provided" };
    }

    const trimmedWord = word.trim();
    const trimmedTranslation = translation.trim();
    const normalizedWord = trimmedWord.toLowerCase();
    const normalizedTranslation = trimmedTranslation.toLowerCase();

    const words = await getStoredWords();

    // Avoid exact duplicates (guard against malformed entries in storage)
    const exists = words.some((w) => {
      if (!w || typeof w.word !== "string" || typeof w.translation !== "string") {
        return false;
      }
      return (
        w.word.toLowerCase() === normalizedWord &&
        w.translation.toLowerCase() === normalizedTranslation
      );
    });
    if (exists) {
      return { success: true, duplicate: true };
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      word: trimmedWord,
      translation: trimmedTranslation,
      sourceUrl: sourceUrl || "",
      createdAt: new Date().toISOString(),
    };

    words.push(entry);
    await chrome.storage.local.set({ words });

    return { success: true, entry };
  } catch (err) {
    console.error("Vocab Stash: save error", err);
    return { success: false, error: "Failed to save word" };
  }
}

async function handleGetWords() {
  try {
    const words = await getStoredWords();
    return { success: true, words };
  } catch (err) {
    return { success: false, error: "Failed to load words" };
  }
}

async function handleDeleteWord(id) {
  try {
    const words = await getStoredWords();
    const filtered = words.filter((w) => w.id !== id);
    await chrome.storage.local.set({ words: filtered });
    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to delete word" };
  }
}

async function handleClearWords() {
  try {
    await chrome.storage.local.set({ words: [] });
    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to clear words" };
  }
}

// ---- Settings ----

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function handleGetSettings() {
  try {
    const settings = await getSettings();
    return { success: true, settings };
  } catch (err) {
    console.error("Vocab Stash: failed to load settings", err);
    return { success: false, error: "Failed to load settings" };
  }
}

const VALID_LANGS = new Set([
  "en", "de", "fr", "es", "it", "pt", "nl", "sv", "ru", "uk", "ja", "zh", "ko", "pl",
]);
const VALID_SEPARATORS = new Set(["\t", ",", ";", " - "]);

async function handleSaveSettings(newSettings = {}) {
  try {
    const current = await getSettings();
    const merged = { ...current };

    if (newSettings.sourceLang && VALID_LANGS.has(newSettings.sourceLang)) {
      merged.sourceLang = newSettings.sourceLang;
    }
    if (newSettings.targetLang && VALID_LANGS.has(newSettings.targetLang)) {
      merged.targetLang = newSettings.targetLang;
    }
    if (newSettings.separator && VALID_SEPARATORS.has(newSettings.separator)) {
      merged.separator = newSettings.separator;
    }

    await chrome.storage.local.set({ settings: merged });
    return { success: true, settings: merged };
  } catch (err) {
    return { success: false, error: "Failed to save settings" };
  }
}
