// ===== Vocab Stash - Content Script =====
// Injected into every web page. Handles text selection, shows the translate
// button, and displays translation options for the user to pick and save.

(function () {
  "use strict";

  // Prevent double-injection (uses content script's isolated world,
  // not page-controlled window, so host pages cannot disable the extension)
  if (globalThis.__vocabStashLoaded) return;
  globalThis.__vocabStashLoaded = true;

  // ---- Shadow DOM host ----
  let hostEl = null;
  let shadow = null;
  let saveBtn = null;
  let tooltip = null;
  let currentWord = "";

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
    tooltip.setAttribute("role", "region");
    tooltip.setAttribute("aria-label", "Translation options");

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    tooltip.innerHTML = `
      <div class="vs-tooltip-header">
        <span class="vs-tooltip-word">${escapeHtml(word)}</span>
        <button class="vs-tooltip-close" title="Close" aria-label="Close translation tooltip">&times;</button>
      </div>
      <div class="vs-tooltip-body">
        <div class="vs-tooltip-translation vs-tooltip-loading">Translating...</div>
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

  function updateTooltipOptions(translations) {
    if (!tooltip) return;

    const body = tooltip.querySelector(".vs-tooltip-body");
    if (!body) return;

    // Replace loading indicator with clickable options list
    body.innerHTML = "";

    const list = document.createElement("div");
    list.className = "vs-tooltip-options";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Translation options");

    translations.forEach((translation, index) => {
      const option = document.createElement("button");
      option.className = "vs-tooltip-option";
      option.textContent = translation;
      option.title = "Click to save this translation";
      if (index === 0) option.classList.add("vs-tooltip-option--best");

      option.addEventListener("click", (e) => {
        e.stopPropagation();
        onOptionSelect(option, translation);
      });

      list.appendChild(option);
    });

    body.appendChild(list);

    // Re-check viewport fit after content change
    requestAnimationFrame(() => {
      if (!tooltip) return;
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY;
      if (tooltipRect.bottom > viewportHeight - 10) {
        tooltip.style.top = `${parseInt(tooltip.style.top) - (tooltipRect.bottom - viewportHeight + 10)}px`;
      }
    });
  }

  function onOptionSelect(optionEl, translation) {
    if (!currentWord || optionEl.disabled) return;

    // Disable all options to prevent double-save
    const allOptions = tooltip.querySelectorAll(".vs-tooltip-option");
    allOptions.forEach((opt) => { opt.disabled = true; });

    // Mark selected
    optionEl.classList.add("vs-tooltip-option--saving");
    optionEl.textContent = `${translation} — saving...`;

    chrome.runtime.sendMessage(
      {
        action: "saveWord",
        word: currentWord,
        translation: translation,
        sourceUrl: window.location.origin,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Vocab Stash: save failed", chrome.runtime.lastError);
          // Re-enable options on failure
          allOptions.forEach((opt) => { opt.disabled = false; });
          optionEl.classList.remove("vs-tooltip-option--saving");
          optionEl.textContent = translation;
          return;
        }
        if (response && response.success) {
          optionEl.classList.remove("vs-tooltip-option--saving");
          optionEl.classList.add("vs-tooltip-option--saved");
          optionEl.textContent = response.duplicate
            ? `${translation} — already saved`
            : `${translation} — saved!`;
        } else {
          // Re-enable options on failure
          allOptions.forEach((opt) => { opt.disabled = false; });
          optionEl.classList.remove("vs-tooltip-option--saving");
          optionEl.textContent = translation;
        }
      }
    );
  }

  function updateTooltipError(message) {
    if (!tooltip) return;
    const body = tooltip.querySelector(".vs-tooltip-body");
    if (!body) return;
    body.innerHTML = `<div class="vs-tooltip-translation"><span class="vs-tooltip-error">${escapeHtml(message)}</span></div>`;
  }

  // ---- Actions ----

  function onSaveButtonClick(rect) {
    const word = currentWord;
    if (!word) return;

    // Hide the save button, show the tooltip
    if (saveBtn) {
      saveBtn.remove();
      saveBtn = null;
    }

    showTooltip(rect, word);

    // Request multiple translations from background script
    chrome.runtime.sendMessage(
      { action: "getTranslations", word: word },
      (response) => {
        if (chrome.runtime.lastError) {
          updateTooltipError("Translation failed. Try again.");
          return;
        }
        if (response && response.success && Array.isArray(response.translations)) {
          updateTooltipOptions(response.translations);
        } else {
          updateTooltipError(response?.error || "Translation failed.");
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
        removeUI();
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
  // Listen on both window and document (capture phase) to catch
  // scrolls inside overflow containers, not just the main viewport.
  function dismissOnScroll() {
    if (saveBtn || tooltip) {
      removeUI();
    }
  }
  window.addEventListener("scroll", dismissOnScroll, { passive: true });
  document.addEventListener("scroll", dismissOnScroll, { passive: true, capture: true });

  // ---- Utilities ----

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
