// ===== Vocab Stash - Background Service Worker =====
// Handles translation requests (MyMemory API) and chrome.storage operations.

// ---- Constants ----

const DEFAULT_SETTINGS = {
  sourceLang: "en",
  targetLang: "pl",
  separator: "\t",
};

const MAX_TRANSLATIONS = 5;

const VALID_LANGS = new Set([
  "en", "de", "fr", "es", "it", "pt", "nl", "sv", "ru", "uk", "ja", "zh", "ko", "pl",
]);
const VALID_SEPARATORS = new Set(["\t", ",", ";", " - "]);

// ---- Validation Helpers ----

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}

function validateWord(word, fieldName = "word") {
  if (!isNonEmptyString(word)) {
    return { valid: false, error: `No ${fieldName} provided` };
  }
  return { valid: true, trimmed: word.trim() };
}

function sanitizeSourceUrl(sourceUrl) {
  if (!isNonEmptyString(sourceUrl)) return "";
  try {
    return new URL(sourceUrl.trim()).origin;
  } catch {
    return "";
  }
}

function normalizeSettings(settingsCandidate) {
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

// ---- Message Handler ----

const MESSAGE_HANDLERS = {
  getTranslations: (msg) => handleGetTranslations(msg.word),
  saveWord:        (msg) => handleSaveWord(msg),
  getWords:        ()    => handleGetWords(),
  deleteWord:      (msg) => handleDeleteWord(msg.id),
  clearWords:      ()    => handleClearWords(),
  getSettings:     ()    => handleGetSettings(),
  saveSettings:    (msg) => handleSaveSettings(msg.settings),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action = isPlainObject(message) ? message.action : null;
  const handler = typeof action === "string" ? MESSAGE_HANDLERS[action] : null;

  if (!handler) {
    sendResponse({ success: false, error: "Unknown action" });
    return false;
  }

  let result;
  try {
    result = handler(message);
  } catch (err) {
    console.error("Vocab Stash: message handler error", err);
    sendResponse({ success: false, error: "Unexpected error" });
    return false;
  }

  Promise.resolve(result)
    .then(sendResponse)
    .catch((err) => {
      console.error("Vocab Stash: message handler error", err);
      sendResponse({ success: false, error: "Unexpected error" });
    });

  return true; // keep channel open for async response
});

// ---- Translation ----

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

  // Primary translation first
  if (data.responseData) {
    add(data.responseData.translatedText);
  }

  // Additional matches sorted by quality (descending)
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

async function handleGetTranslations(word) {
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

// ---- Word Storage ----

async function getStoredWords() {
  const { words } = await chrome.storage.local.get("words");
  return Array.isArray(words) ? words : [];
}

async function handleSaveWord({ word, translation, sourceUrl } = {}) {
  try {
    const wordCheck = validateWord(word, "word");
    if (!wordCheck.valid) return { success: false, error: wordCheck.error };

    const transCheck = validateWord(translation, "translation");
    if (!transCheck.valid) return { success: false, error: transCheck.error };

    const normalizedWord = wordCheck.trimmed.toLowerCase();
    const normalizedTranslation = transCheck.trimmed.toLowerCase();

    const words = await getStoredWords();

    // Avoid exact duplicates (guard against malformed entries in storage)
    const exists = words.some((w) => {
      if (!w || typeof w.word !== "string" || typeof w.translation !== "string") return false;
      return w.word.toLowerCase() === normalizedWord
          && w.translation.toLowerCase() === normalizedTranslation;
    });
    if (exists) {
      return { success: true, duplicate: true };
    }

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      word: wordCheck.trimmed,
      translation: transCheck.trimmed,
      sourceUrl: sanitizeSourceUrl(sourceUrl),
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
    return { success: true, words: await getStoredWords() };
  } catch (err) {
    return { success: false, error: "Failed to load words" };
  }
}

async function handleDeleteWord(id) {
  try {
    if (!isNonEmptyString(id)) {
      return { success: false, error: "Invalid word id" };
    }

    const trimmedId = id.trim();
    const words = await getStoredWords();
    await chrome.storage.local.set({ words: words.filter((w) => w.id !== trimmedId) });
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
  return normalizeSettings(settings);
}

async function handleGetSettings() {
  try {
    return { success: true, settings: await getSettings() };
  } catch (err) {
    console.error("Vocab Stash: failed to load settings", err);
    return { success: false, error: "Failed to load settings" };
  }
}

async function handleSaveSettings(newSettings = {}) {
  try {
    const current = await getSettings();
    const incoming = isPlainObject(newSettings) ? newSettings : {};
    const merged = {
      sourceLang: VALID_LANGS.has(incoming.sourceLang)
        ? incoming.sourceLang
        : current.sourceLang,
      targetLang: VALID_LANGS.has(incoming.targetLang)
        ? incoming.targetLang
        : current.targetLang,
      separator: VALID_SEPARATORS.has(incoming.separator)
        ? incoming.separator
        : current.separator,
    };

    await chrome.storage.local.set({ settings: merged });
    return { success: true, settings: merged };
  } catch (err) {
    return { success: false, error: "Failed to save settings" };
  }
}
