import { isNonEmptyString, sanitizeSourceUrl, validateWord } from "./validation.js";

async function getStoredWords() {
  const { words } = await chrome.storage.local.get("words");
  return Array.isArray(words) ? words : [];
}

export async function handleSaveWord({ word, translation, sourceUrl } = {}) {
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

export async function handleGetWords() {
  try {
    return { success: true, words: await getStoredWords() };
  } catch (err) {
    return { success: false, error: "Failed to load words" };
  }
}

export async function handleDeleteWord(id) {
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

export async function handleClearWords() {
  try {
    await chrome.storage.local.set({ words: [] });
    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to clear words" };
  }
}
