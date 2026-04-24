import { isPlainObject } from "./validation.js";
import { handleGetTranslations } from "./translation.js";
import {
  handleSaveWord,
  handleGetWords,
  handleDeleteWord,
  handleClearWords,
} from "./words.js";
import { handleGetSettings, handleSaveSettings } from "./settings.js";

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
