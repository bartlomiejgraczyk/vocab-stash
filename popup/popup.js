// ===== Vocab Stash - Popup Script =====
// Manages the popup UI: word list, export, and settings tabs.

document.addEventListener("DOMContentLoaded", () => {
  // ---- DOM Elements ----
  const tabButtons = document.querySelectorAll(".tabs__btn");
  const tabContents = document.querySelectorAll(".tab-content");
  const tabList = document.querySelector(".tabs");

  const wordList = document.getElementById("word-list");
  const wordCount = document.getElementById("word-count");
  const emptyState = document.getElementById("empty-state");
  const wordListActions = document.getElementById("word-list-actions");
  const clearAllBtn = document.getElementById("clear-all-btn");

  const exportTextarea = document.getElementById("export-textarea");
  const separatorSelect = document.getElementById("separator-select");
  const copyBtn = document.getElementById("copy-btn");
  const copyFeedback = document.getElementById("copy-feedback");

  const sourceLangSelect = document.getElementById("source-lang");
  const targetLangSelect = document.getElementById("target-lang");
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  const settingsFeedback = document.getElementById("settings-feedback");

  // Validate critical DOM elements
  const required = { tabList, wordList, wordCount, emptyState, wordListActions, clearAllBtn, exportTextarea, separatorSelect, copyBtn, copyFeedback, sourceLangSelect, targetLangSelect, saveSettingsBtn, settingsFeedback };
  const missing = Object.entries(required).filter(([, el]) => !el).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`Vocab Stash: missing DOM elements: ${missing.join(", ")}. Popup will not initialize.`);
    return;
  }

  let words = [];

  // ---- Helpers ----

  /**
   * Send a message to the background service worker.
   * Returns a Promise that rejects on chrome.runtime.lastError.
   */
  function sendAction(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  /** Show temporary text in a feedback element, auto-clearing after `ms`. */
  function showFeedback(el, text, ms = 2000) {
    el.textContent = text;
    setTimeout(() => { el.textContent = ""; }, ms);
  }

  // ---- Tab Switching ----

  function activateTab(btn) {
    const tabName = btn.dataset.tab;

    tabButtons.forEach((b) => {
      b.classList.remove("tabs__btn--active");
      b.setAttribute("aria-selected", "false");
      b.setAttribute("tabindex", "-1");
    });
    tabContents.forEach((c) => {
      c.classList.remove("tab-content--active");
      c.hidden = true;
    });

    btn.classList.add("tabs__btn--active");
    btn.setAttribute("aria-selected", "true");
    btn.setAttribute("tabindex", "0");
    btn.focus();

    const activePanel = document.getElementById(`tab-${tabName}`);
    activePanel.classList.add("tab-content--active");
    activePanel.hidden = false;

    if (tabName === "export") {
      updateExportPreview();
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn));
  });

  // Arrow key navigation between tabs
  tabList.addEventListener("keydown", (e) => {
    const tabs = [...tabButtons];
    const current = tabs.findIndex((b) => b.getAttribute("aria-selected") === "true");
    let next = -1;

    if (e.key === "ArrowRight") {
      next = (current + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      next = (current - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabs.length - 1;
    }

    if (next >= 0) {
      e.preventDefault();
      activateTab(tabs[next]);
    }
  });

  // ---- Word List ----

  const defaultEmptyText = emptyState.textContent;

  async function loadWords() {
    try {
      const response = await sendAction({ action: "getWords" });
      if (response?.success && Array.isArray(response.words)) {
        emptyState.textContent = defaultEmptyText;
        words = response.words;
      } else {
        throw new Error("Invalid response");
      }
    } catch (err) {
      console.error("Vocab Stash: failed to load words.", err);
      words = [];
      emptyState.textContent = "Unable to load saved words. Please try again.";
    }
    renderWordList();
  }

  function renderWordList() {
    const count = words.length;
    wordCount.textContent = `${count} word${count !== 1 ? "s" : ""}`;

    wordList.querySelectorAll(".word-item").forEach((el) => el.remove());

    if (count === 0) {
      emptyState.style.display = "block";
      wordListActions.classList.add("is-hidden");
      updateExportPreview();
      return;
    }

    emptyState.style.display = "none";
    wordListActions.classList.remove("is-hidden");

    // Render words (newest first)
    const sorted = [...words].reverse();
    for (const entry of sorted) {
      const item = document.createElement("div");
      item.className = "word-item";

      const textDiv = document.createElement("div");
      textDiv.className = "word-item__text";

      const originalSpan = document.createElement("span");
      originalSpan.className = "word-item__original";
      originalSpan.textContent = entry.word;

      const arrowSpan = document.createElement("span");
      arrowSpan.className = "word-item__arrow";
      arrowSpan.innerHTML = "&rarr;";

      const translationSpan = document.createElement("span");
      translationSpan.className = "word-item__translation";
      translationSpan.textContent = entry.translation;

      textDiv.append(originalSpan, arrowSpan, translationSpan);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "word-item__delete";
      deleteBtn.title = "Delete";
      deleteBtn.setAttribute("aria-label", `Delete "${entry.word}"`);
      deleteBtn.dataset.id = entry.id;
      deleteBtn.innerHTML = "&times;";

      item.append(textDiv, deleteBtn);
      wordList.appendChild(item);
    }

    updateExportPreview();
  }

  // Delete buttons — event delegation
  wordList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".word-item__delete");
    if (!deleteBtn) return;
    const id = deleteBtn.dataset.id;
    if (id) deleteWord(id);
  });

  async function deleteWord(id) {
    try {
      const response = await sendAction({ action: "deleteWord", id });
      if (response?.success) {
        words = words.filter((w) => w.id !== id);
        renderWordList();
        return;
      }
    } catch (err) {
      console.error("Vocab Stash: delete failed.", err);
    }
    // On any failure, reload from storage to stay in sync
    loadWords();
  }

  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Delete all saved words? This cannot be undone.")) return;

    try {
      const response = await sendAction({ action: "clearWords" });
      if (response?.success) {
        words = [];
        renderWordList();
        return;
      }
    } catch (err) {
      console.error("Vocab Stash: clear failed.", err);
    }
    loadWords();
  });

  // ---- Export ----

  function getSeparator() {
    const val = separatorSelect.value;
    return val === "\\t" ? "\t" : val;
  }

  function updateExportPreview() {
    if (words.length === 0) {
      exportTextarea.value = "";
      exportTextarea.placeholder = "No words to export yet.";
      return;
    }
    const sep = getSeparator();
    const lines = [...words].reverse().map((w) => `${w.word}${sep}${w.translation}`);
    exportTextarea.value = lines.join("\n");
  }

  separatorSelect.addEventListener("change", updateExportPreview);

  copyBtn.addEventListener("click", async () => {
    const text = exportTextarea.value;
    if (!text) {
      showFeedback(copyFeedback, "Nothing to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showFeedback(copyFeedback, "Copied to clipboard!");
    } catch {
      exportTextarea.select();
      const ok = document.execCommand("copy");
      showFeedback(
        copyFeedback,
        ok ? "Copied to clipboard!" : "Copy failed. Please select the text and copy manually."
      );
    }
  });

  // ---- Settings ----

  const SEPARATOR_TO_SELECT = { "\t": "\\t", ",": ",", ";": ";", " - ": " - " };

  async function loadSettings() {
    try {
      const response = await sendAction({ action: "getSettings" });
      if (response?.success) {
        const s = response.settings;
        sourceLangSelect.value = s.sourceLang || "en";
        targetLangSelect.value = s.targetLang || "pl";
        separatorSelect.value = SEPARATOR_TO_SELECT[s.separator] || "\\t";
        updateExportPreview();
      }
    } catch (err) {
      console.error("Vocab Stash: failed to load settings.", err);
    }
  }

  saveSettingsBtn.addEventListener("click", async () => {
    const settings = {
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value,
      separator: getSeparator(),
    };

    try {
      const response = await sendAction({ action: "saveSettings", settings });
      if (response?.success) {
        showFeedback(settingsFeedback, "Settings saved!");
        return;
      }
    } catch (err) {
      console.error("Vocab Stash: save settings failed.", err);
    }
    showFeedback(settingsFeedback, "Failed to save settings. Please try again.");
  });

  // ---- Init ----

  loadSettings();
  loadWords();
});
