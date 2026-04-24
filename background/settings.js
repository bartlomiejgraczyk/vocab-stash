import { VALID_LANGS, VALID_SEPARATORS } from "./constants.js";
import { isPlainObject, normalizeSettings } from "./validation.js";

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

export async function handleGetSettings() {
  try {
    return { success: true, settings: await getSettings() };
  } catch (err) {
    console.error("Vocab Stash: failed to load settings", err);
    return { success: false, error: "Failed to load settings" };
  }
}

export async function handleSaveSettings(newSettings = {}) {
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
