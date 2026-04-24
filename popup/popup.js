// ===== Vocab Stash - Popup Script =====
// Manages the popup UI: word list, export, and settings tabs.

document.addEventListener("DOMContentLoaded", () => {
  // ---- DOM Elements ----
  const tabButtons = document.querySelectorAll(".tabs__btn");
  const tabContents = document.querySelectorAll(".tab-content");

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

  let words = [];

  // ---- Tab Switching ----

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;

      tabButtons.forEach((b) => b.classList.remove("tabs__btn--active"));
      tabContents.forEach((c) => c.classList.remove("tab-content--active"));

      btn.classList.add("tabs__btn--active");
      document.getElementById(`tab-${tabName}`).classList.add("tab-content--active");

      // Refresh export when switching to export tab
      if (tabName === "export") {
        updateExportPreview();
      }
    });
  });

  // ---- Word List ----

  function loadWords() {
    chrome.runtime.sendMessage({ action: "getWords" }, (response) => {
      if (response && response.success) {
        words = response.words;
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
      return;
    }

    emptyState.style.display = "none";
    wordListActions.style.display = "block";

    // Render words (newest first)
    const sorted = [...words].reverse();
    sorted.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "word-item";
      item.innerHTML = `
        <div class="word-item__text">
          <span class="word-item__original">${escapeHtml(entry.word)}</span>
          <span class="word-item__arrow">&rarr;</span>
          <span class="word-item__translation">${escapeHtml(entry.translation)}</span>
        </div>
        <button class="word-item__delete" title="Delete" data-id="${entry.id}">&times;</button>
      `;
      wordList.appendChild(item);
    });

    // Delete buttons
    wordList.querySelectorAll(".word-item__delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        deleteWord(id);
      });
    });
  }

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
    const lines = words.map((w) => `${w.word}${sep}${w.translation}`);
    exportTextarea.value = lines.join("\n");
  }

  separatorSelect.addEventListener("change", updateExportPreview);

  copyBtn.addEventListener("click", async () => {
    const text = exportTextarea.value;
    if (!text) {
      copyFeedback.textContent = "Nothing to copy.";
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      copyFeedback.textContent = "Copied to clipboard!";
    } catch {
      // Fallback: select + copy
      exportTextarea.select();
      document.execCommand("copy");
      copyFeedback.textContent = "Copied to clipboard!";
    }

    setTimeout(() => {
      copyFeedback.textContent = "";
    }, 2000);
  });

  // ---- Settings ----

  function loadSettings() {
    chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
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

  // ---- Utilities ----

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Init ----

  loadSettings();
  loadWords();
});
