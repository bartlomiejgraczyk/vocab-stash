// ===== Vocab Stash - Content Script =====
// Injected into every web page. Handles text selection, shows the save button
// and translation tooltip, and communicates with the background service worker.

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__vocabStashLoaded) return;
  window.__vocabStashLoaded = true;

  // ---- Shadow DOM host ----
  let hostEl = null;
  let shadow = null;
  let saveBtn = null;
  let tooltip = null;
  let currentWord = "";
  let currentTranslation = "";

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement("div");
    hostEl.id = "vocab-stash-host";
    const parent = document.body || document.documentElement;
    if (!parent) return;
    parent.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "closed" });

    // Load shadow DOM styles
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("shadow.css");
    shadow.appendChild(link);
  }

  // ---- Helpers ----

  function removeUI() {
    if (saveBtn) {
      saveBtn.remove();
      saveBtn = null;
    }
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    currentWord = "";
    currentTranslation = "";
  }

  function getSelectedWord() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";
    const text = selection.toString().trim();
    // Accept single words or short phrases (up to 3 words)
    if (!text || text.split(/\s+/).length > 3) return "";
    return text;
  }

  function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return range.getBoundingClientRect();
  }

  // ---- Save Button ----

  function showSaveButton(rect) {
    ensureHost();
    if (saveBtn) saveBtn.remove();

    saveBtn = document.createElement("button");
    saveBtn.className = "vs-save-btn";
    saveBtn.textContent = "V";
    saveBtn.title = "Vocab Stash: Translate & Save";
    saveBtn.setAttribute("aria-label", "Translate and save selected word");
    saveBtn.setAttribute("aria-expanded", "false");
    saveBtn.setAttribute("aria-controls", "vs-translation-tooltip");

    // Position to the right of the selection
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    saveBtn.style.left = `${rect.right + scrollX + 6}px`;
    saveBtn.style.top = `${rect.top + scrollY + (rect.height / 2) - 14}px`;

    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSaveButtonClick(rect);
    });

    shadow.appendChild(saveBtn);
  }

  // ---- Tooltip ----

  function showTooltip(rect, word) {
    ensureHost();
    if (tooltip) tooltip.remove();

    tooltip = document.createElement("div");
    tooltip.className = "vs-tooltip";
    tooltip.id = "vs-translation-tooltip";
    tooltip.setAttribute("role", "region");
    tooltip.setAttribute("aria-label", "Translation");

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    tooltip.innerHTML = `
      <div class="vs-tooltip-header">
        <span class="vs-tooltip-word">${escapeHtml(word)}</span>
        <button class="vs-tooltip-close" title="Close" aria-label="Close translation tooltip">&times;</button>
      </div>
      <div class="vs-tooltip-translation vs-tooltip-loading">Translating...</div>
      <div class="vs-tooltip-actions">
        <button class="vs-tooltip-btn vs-tooltip-btn--save" disabled>Save</button>
      </div>
    `;

    // Position below the selection
    tooltip.style.left = `${rect.left + scrollX}px`;
    tooltip.style.top = `${rect.bottom + scrollY + 8}px`;

    // Close button
    tooltip.querySelector(".vs-tooltip-close").addEventListener("click", (e) => {
      e.stopPropagation();
      removeUI();
    });

    // Save button
    tooltip.querySelector(".vs-tooltip-btn--save").addEventListener("click", (e) => {
      e.stopPropagation();
      onTooltipSave();
    });

    shadow.appendChild(tooltip);

    // Ensure tooltip stays within viewport
    requestAnimationFrame(() => {
      if (!tooltip) return;
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (tooltipRect.right > viewportWidth - 10) {
        tooltip.style.left = `${viewportWidth - tooltipRect.width - 10 + scrollX}px`;
      }
      if (tooltipRect.left < 10) {
        tooltip.style.left = `${10 + scrollX}px`;
      }

      // If tooltip overflows below viewport, reposition above the selection
      if (tooltipRect.bottom > viewportHeight - 10) {
        tooltip.style.top = `${rect.top + scrollY - tooltipRect.height - 8}px`;
      }
    });
  }

  function updateTooltipTranslation(translation) {
    if (!tooltip) return;
    const el = tooltip.querySelector(".vs-tooltip-translation");
    el.classList.remove("vs-tooltip-loading");
    el.textContent = translation;

    const btn = tooltip.querySelector(".vs-tooltip-btn--save");
    btn.disabled = false;
  }

  function updateTooltipError(message) {
    if (!tooltip) return;
    const el = tooltip.querySelector(".vs-tooltip-translation");
    el.classList.remove("vs-tooltip-loading");
    el.innerHTML = `<span class="vs-tooltip-error">${escapeHtml(message)}</span>`;
  }

  function updateTooltipSaved() {
    if (!tooltip) return;
    const btn = tooltip.querySelector(".vs-tooltip-btn--save");
    btn.textContent = "Saved!";
    btn.classList.remove("vs-tooltip-btn--save");
    btn.classList.add("vs-tooltip-btn--saved");
    btn.disabled = true;
  }

  // ---- Actions ----

  function onSaveButtonClick(rect) {
    const word = currentWord;
    if (!word) return;

    // Hide the save button, show the tooltip
    if (saveBtn) {
      saveBtn.setAttribute("aria-expanded", "true");
      saveBtn.remove();
      saveBtn = null;
    }

    showTooltip(rect, word);

    // Request translation from background script
    chrome.runtime.sendMessage(
      { action: "translate", word: word },
      (response) => {
        if (chrome.runtime.lastError) {
          updateTooltipError("Translation failed. Try again.");
          return;
        }
        if (response && response.success) {
          currentTranslation = response.translation;
          updateTooltipTranslation(response.translation);
        } else {
          updateTooltipError(response?.error || "Translation failed.");
        }
      }
    );
  }

  function onTooltipSave() {
    if (!currentWord || !currentTranslation) return;

    chrome.runtime.sendMessage(
      {
        action: "saveWord",
        word: currentWord,
        translation: currentTranslation,
        sourceUrl: window.location.href,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Vocab Stash: save failed", chrome.runtime.lastError);
          return;
        }
        if (response && response.success) {
          updateTooltipSaved();
        }
      }
    );
  }

  // ---- Event Listeners ----

  document.addEventListener("mouseup", (e) => {
    // Ignore clicks inside our own UI
    if (hostEl && hostEl.contains(e.target)) return;

    // Small delay to let the browser finalize the selection
    setTimeout(() => {
      const word = getSelectedWord();
      if (!word) {
        // Don't remove UI if clicking inside our shadow DOM
        return;
      }

      currentWord = word;
      const rect = getSelectionRect();
      if (rect) {
        showSaveButton(rect);
      }
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    // If clicking outside our UI, remove it
    if (hostEl && hostEl.contains(e.target)) return;

    // Check if clicking inside shadow DOM elements
    const path = e.composedPath();
    if (path.some((el) => el === saveBtn || el === tooltip)) return;

    removeUI();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeUI();
    }
  });

  // Dismiss UI on scroll (position would be stale)
  window.addEventListener("scroll", () => {
    if (saveBtn || tooltip) {
      removeUI();
    }
  }, { passive: true });

  // ---- Utilities ----

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
