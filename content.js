// ===== Vocab Stash - Content Script =====
// Injected into every web page. Handles text selection, shows the translate
// button, and displays translation options for the user to pick and save.

(function () {
  "use strict";

  // Prevent double-injection (uses content script's isolated world,
  // not page-controlled window, so host pages cannot disable the extension)
  if (globalThis.__vocabStashLoaded) return;
  globalThis.__vocabStashLoaded = true;

  // ---- State ----

  let hostEl = null;
  let shadow = null;
  let saveBtn = null;
  let tooltip = null;
  let currentWord = "";
  let activeRequestId = 0; // Guards against stale translation responses

  // ---- Shadow DOM host ----

  function ensureHost() {
    if (hostEl) return;
    const parent = document.body || document.documentElement;
    if (!parent) return;

    hostEl = document.createElement("div");
    hostEl.id = "vocab-stash-host";
    parent.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: "closed" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("shadow.css");
    shadow.appendChild(link);
  }

  // ---- Helpers ----

  function removeUI() {
    if (saveBtn) { saveBtn.remove(); saveBtn = null; }
    if (tooltip) { tooltip.remove(); tooltip = null; }
    currentWord = "";
    activeRequestId++;
  }

  function getSelectedWord() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";
    const text = selection.toString().trim();
    if (!text || text.split(/\s+/).length > 3) return "";
    return text;
  }

  function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    return selection.getRangeAt(0).getBoundingClientRect();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Translate Button ----

  function showTranslateButton(rect) {
    ensureHost();
    if (saveBtn) saveBtn.remove();

    saveBtn = document.createElement("button");
    saveBtn.className = "vs-save-btn";
    saveBtn.textContent = "V";
    saveBtn.title = "Vocab Stash: Translate & Save";
    saveBtn.setAttribute("aria-label", "Translate and save selected word");

    const { scrollX, scrollY } = window;
    saveBtn.style.left = `${rect.right + scrollX + 6}px`;
    saveBtn.style.top = `${rect.top + scrollY + (rect.height / 2) - 14}px`;

    saveBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onTranslateClick(rect);
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

    tooltip.innerHTML = `
      <div class="vs-tooltip-header">
        <span class="vs-tooltip-word">${escapeHtml(word)}</span>
        <button class="vs-tooltip-close" title="Close" aria-label="Close translation tooltip">&times;</button>
      </div>
      <div class="vs-tooltip-body">
        <div class="vs-tooltip-translation vs-tooltip-loading">Translating...</div>
      </div>
    `;

    const { scrollX, scrollY } = window;
    tooltip.style.left = `${rect.left + scrollX}px`;
    tooltip.style.top = `${rect.bottom + scrollY + 8}px`;

    tooltip.querySelector(".vs-tooltip-close").addEventListener("click", (e) => {
      e.stopPropagation();
      removeUI();
    });

    shadow.appendChild(tooltip);
    clampToViewport(rect);
  }

  /** Reposition tooltip if it overflows the viewport edges. */
  function clampToViewport(selectionRect) {
    requestAnimationFrame(() => {
      if (!tooltip) return;
      const { scrollX, scrollY } = window;
      const tt = tooltip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (tt.right > vw - 10) {
        tooltip.style.left = `${vw - tt.width - 10 + scrollX}px`;
      }
      if (tt.left < 10) {
        tooltip.style.left = `${10 + scrollX}px`;
      }
      if (tt.bottom > vh - 10) {
        tooltip.style.top = `${selectionRect.top + scrollY - tt.height - 8}px`;
      }
    });
  }

  function updateTooltipOptions(translations) {
    if (!tooltip) return;
    const body = tooltip.querySelector(".vs-tooltip-body");
    if (!body) return;

    body.innerHTML = "";

    const list = document.createElement("div");
    list.className = "vs-tooltip-options";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", "Translation options");

    for (let i = 0; i < translations.length; i++) {
      const translation = translations[i];
      const option = document.createElement("button");
      option.className = "vs-tooltip-option";
      option.textContent = translation;
      option.title = "Click to save this translation";
      if (i === 0) option.classList.add("vs-tooltip-option--best");

      option.addEventListener("click", (e) => {
        e.stopPropagation();
        onOptionSelect(option, translation);
      });

      list.appendChild(option);
    }

    body.appendChild(list);

    // Re-check viewport fit after content change
    requestAnimationFrame(() => {
      if (!tooltip) return;
      const tt = tooltip.getBoundingClientRect();
      const vh = window.innerHeight;
      if (tt.bottom > vh - 10) {
        const currentTop = parseInt(tooltip.style.top, 10);
        tooltip.style.top = `${currentTop - (tt.bottom - vh + 10)}px`;
      }
    });
  }

  function updateTooltipError(message) {
    if (!tooltip) return;
    const body = tooltip.querySelector(".vs-tooltip-body");
    if (!body) return;
    body.innerHTML = `<div class="vs-tooltip-translation">
      <span class="vs-tooltip-error">${escapeHtml(message)}</span>
    </div>`;
  }

  // ---- Actions ----

  function onTranslateClick(rect) {
    const word = currentWord;
    if (!word) return;

    if (saveBtn) { saveBtn.remove(); saveBtn = null; }
    showTooltip(rect, word);

    // Track this request so stale responses are ignored
    const requestId = ++activeRequestId;

    chrome.runtime.sendMessage(
      { action: "getTranslations", word },
      (response) => {
        // Discard if UI was dismissed or a newer request was made
        if (requestId !== activeRequestId || !tooltip) return;

        if (chrome.runtime.lastError) {
          updateTooltipError("Translation failed. Try again.");
          return;
        }
        if (response?.success && Array.isArray(response.translations)) {
          updateTooltipOptions(response.translations);
        } else {
          updateTooltipError(response?.error || "Translation failed.");
        }
      }
    );
  }

  function onOptionSelect(optionEl, translation) {
    if (!currentWord || optionEl.disabled) return;

    const allOptions = tooltip.querySelectorAll(".vs-tooltip-option");
    allOptions.forEach((opt) => { opt.disabled = true; });

    optionEl.classList.add("vs-tooltip-option--saving");
    optionEl.textContent = `${translation} — saving...`;

    chrome.runtime.sendMessage(
      {
        action: "saveWord",
        word: currentWord,
        translation,
        sourceUrl: window.location.origin,
      },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          console.error("Vocab Stash: save failed", chrome.runtime.lastError);
          allOptions.forEach((opt) => { opt.disabled = false; });
          optionEl.classList.remove("vs-tooltip-option--saving");
          optionEl.textContent = translation;
          return;
        }

        optionEl.classList.remove("vs-tooltip-option--saving");
        optionEl.classList.add("vs-tooltip-option--saved");
        optionEl.textContent = response.duplicate
          ? `${translation} — already saved`
          : `${translation} — saved!`;
      }
    );
  }

  // ---- Event Listeners ----

  document.addEventListener("mouseup", (e) => {
    if (hostEl && hostEl.contains(e.target)) return;

    setTimeout(() => {
      const word = getSelectedWord();
      if (!word) { removeUI(); return; }

      currentWord = word;
      const rect = getSelectionRect();
      if (rect) showTranslateButton(rect);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (hostEl && hostEl.contains(e.target)) return;
    const path = e.composedPath();
    if (path.some((el) => el === saveBtn || el === tooltip)) return;
    removeUI();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeUI();
  });

  // Dismiss on scroll — position would be stale.
  // Capture phase catches scrolls inside overflow containers too.
  function dismissOnScroll() {
    if (saveBtn || tooltip) removeUI();
  }
  window.addEventListener("scroll", dismissOnScroll, { passive: true });
  document.addEventListener("scroll", dismissOnScroll, { passive: true, capture: true });
})();
