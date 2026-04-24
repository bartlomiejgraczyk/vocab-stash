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

    // Refresh export when switching to export tab
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

  function loadWords() {
    chrome.runtime.sendMessage({ action: "getWords" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Vocab Stash: failed to load words.", chrome.runtime.lastError);
        words = [];
        emptyState.textContent = "Unable to load saved words. Please try again.";
        renderWordList();
        return;
      }
      if (response && response.success && Array.isArray(response.words)) {
        emptyState.textContent = defaultEmptyText;
        words = response.words;
        renderWordList();
      } else {
        console.error("Vocab Stash: invalid getWords response.", response);
        words = [];
        emptyState.textContent = "Unable to load saved words. Please try again.";
        renderWordList();
      }
    });
  }

  function renderWordList() {
    // Update count
    const count = words.length;
    wordCount.textContent = `${count} word${count !== 1 ? "s" : ""}`;

    // Clear existing items (keep empty state)
    wordList.querySelectorAll(".word-item").forEach((el) => el.remove());

    if (count === 0) {
      emptyState.style.display = "block";
      wordListActions.style.display = "none";
      updateExportPreview();
      return;
    }

    emptyState.style.display = "none";
    wordListActions.style.display = "block";

    // Render words (newest first)
    const sorted = [...words].reverse();
    sorted.forEach((entry) => {
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

      textDiv.appendChild(originalSpan);
      textDiv.appendChild(arrowSpan);
      textDiv.appendChild(translationSpan);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "word-item__delete";
      deleteBtn.title = "Delete";
      deleteBtn.setAttribute("aria-label", `Delete "${entry.word}"`);
      deleteBtn.dataset.id = entry.id;
      deleteBtn.innerHTML = "&times;";

      item.appendChild(textDiv);
      item.appendChild(deleteBtn);
      wordList.appendChild(item);
    });

    // Keep export preview in sync
    updateExportPreview();
  }

  // Delete buttons - event delegation (single listener on wordList)
  wordList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".word-item__delete");
    if (!deleteBtn) return;
    const id = deleteBtn.dataset.id;
    if (id) deleteWord(id);
  });

  function deleteWord(id) {
    chrome.runtime.sendMessage({ action: "deleteWord", id }, (response) => {
      if (response && response.success) {
        words = words.filter((w) => w.id !== id);
        renderWordList();
      }
    });
  }

  clearAllBtn.addEventListener("click", () => {
    if (!confirm("Delete all saved words? This cannot be undone.")) return;

    chrome.runtime.sendMessage({ action: "clearWords" }, (response) => {
      if (response && response.success) {
        words = [];
        renderWordList();
      }
    });
  });

  // ---- Export ----

  function getSeparator() {
    const val = separatorSelect.value;
    // Handle escaped tab character
    if (val === "\\t") return "\t";
    return val;
  }

  function updateExportPreview() {
    const sep = getSeparator();
    if (words.length === 0) {
      exportTextarea.value = "";
      exportTextarea.placeholder = "No words to export yet.";
      return;
    }
    const lines = [...words].reverse().map((w) => `${w.word}${sep}${w.translation}`);
    exportTextarea.value = lines.join("\n");
  }

  separatorSelect.addEventListener("change", updateExportPreview);

  copyBtn.addEventListener("click", async () => {
    const text = exportTextarea.value;
    if (!text) {
      copyFeedback.textContent = "Nothing to copy.";
      setTimeout(() => {
        copyFeedback.textContent = "";
      }, 2000);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      copyFeedback.textContent = "Copied to clipboard!";
    } catch {
      // Fallback: select + copy
      exportTextarea.select();
      const ok = document.execCommand("copy");
      copyFeedback.textContent = ok
        ? "Copied to clipboard!"
        : "Copy failed. Please select the text and copy manually.";
    }

    setTimeout(() => {
      copyFeedback.textContent = "";
    }, 2000);
  });

  // ---- Settings ----

  function loadSettings() {
    chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Vocab Stash: failed to load settings.", chrome.runtime.lastError);
        return;
      }
      if (response && response.success) {
        const s = response.settings;
        sourceLangSelect.value = s.sourceLang || "en";
        targetLangSelect.value = s.targetLang || "pl";

        // Set separator in export tab
        const sepMap = { "\t": "\\t", ",": ",", ";": ";", " - ": " - " };
        const sepValue = sepMap[s.separator] || "\\t";
        separatorSelect.value = sepValue;
      }
    });
  }

  saveSettingsBtn.addEventListener("click", () => {
    const settings = {
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value,
      separator: getSeparator(),
    };

    chrome.runtime.sendMessage({ action: "saveSettings", settings }, (response) => {
      if (response && response.success) {
        settingsFeedback.textContent = "Settings saved!";
        setTimeout(() => {
          settingsFeedback.textContent = "";
        }, 2000);
      }
    });
  });

  // ---- Init ----

  loadSettings();
  loadWords();
});
