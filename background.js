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
    case "translate":
      handleTranslate(message.word).then(sendResponse);
      return true; // keep message channel open for async response

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

async function handleTranslate(word) {
  try {
    if (!word || typeof word !== "string" || !word.trim()) {
      return { success: false, error: "No word provided" };
    }

    const settings = await getSettings();
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", word.trim());
    url.searchParams.set("langpair", `${settings.sourceLang}|${settings.targetLang}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      const translation = data.responseData.translatedText;

      if (typeof translation !== "string" || !translation.trim()) {
        return { success: false, error: "Translation not found" };
      }

      const normalizedWord = word.trim().toLowerCase();
      const normalizedTranslation = translation.trim().toLowerCase();

      // MyMemory sometimes returns the same text if it can't translate
      if (normalizedTranslation === normalizedWord) {
        // Try to get a match from the alternatives
        if (data.matches && data.matches.length > 1) {
          const alt = data.matches.find(
            (m) =>
              typeof m.translation === "string" &&
              m.translation.toLowerCase() !== normalizedWord &&
              m.quality > 0
          );
          if (alt) {
            return { success: true, translation: alt.translation.trim() };
          }
        }
      }

      return { success: true, translation: translation.trim() };
    }

    return {
      success: false,
      error: data.responseDetails || "Translation not found",
    };
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

    const words = await getStoredWords();

    // Avoid exact duplicates
    const exists = words.some(
      (w) =>
        w.word.toLowerCase() === trimmedWord.toLowerCase() &&
        w.translation.toLowerCase() === trimmedTranslation.toLowerCase()
    );
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
