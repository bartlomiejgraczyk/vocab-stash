# Vocab Stash

A lightweight Chrome extension for building vocabulary while browsing the web. Select a word on any page, choose from multiple translation options, and save it as a flashcard pair for later export to Quizlet.

## Features

- **Select & Translate** — highlight a word (or short phrase, up to 3 words) on any webpage and get instant translations via the [MyMemory API](https://mymemory.translated.net/)
- **Pick Your Translation** — choose from up to 5 translation options, sorted by quality; click to save instantly
- **Word List** — browse and manage all saved words from the extension popup
- **Quizlet Export** — copy your word list in a format ready to paste into Quizlet's "Import from text" feature, with a configurable separator (tab, comma, semicolon, or dash)
- **Language Settings** — defaults to English → Polish; configurable to 14 languages including German, French, Spanish, Japanese, and more
- **Zero Config** — no API keys, no accounts, no build step; just load and go

## Installation

1. Go to the [Releases](../../releases/latest) page and download the `vocab-stash-<version>.zip` archive
2. Extract the archive — it contains only the files needed by Chrome
3. Open `chrome://extensions/` in Google Chrome
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the extracted `vocab-stash` folder
6. The Vocab Stash icon should appear in your extensions toolbar

## Usage

1. **Select a word** on any webpage — a green **V** button appears next to the selection
2. **Click "V"** — a tooltip shows translation options fetched from MyMemory API
3. **Click a translation** — the word pair is saved to `chrome.storage.local` instantly
4. **Click the extension icon** in the Chrome toolbar to open the popup:
   - **Words** tab — view and delete saved words
   - **Export** tab — preview and copy the word list for Quizlet import
   - **Settings** tab — change the source/target language pair

### Importing into Quizlet

1. In the popup, go to the **Export** tab
2. Make sure the separator is set to **Tab** (Quizlet's default)
3. Click **Copy to Clipboard**
4. In Quizlet, go to **Create** → **Import from Word, Excel, Google Docs, etc.**
5. Paste the copied text and confirm the import

## Project Structure

```
vocab-stash/
├── manifest.json          Manifest V3 configuration
├── background/            Service worker modules
│   ├── index.js           Message router (entrypoint)
│   ├── translation.js     MyMemory API integration + translation extraction
│   ├── words.js           Saved words CRUD in chrome.storage
│   ├── settings.js        Settings read/write logic
│   ├── validation.js      Shared validation/normalization helpers
│   └── constants.js       Shared constants
├── content.js             Content script — text selection, translation options UI
├── content.css            Minimal host styles for the shadow DOM container
├── shadow.css             Isolated styles for the tooltip (inside shadow DOM)
├── popup/
│   ├── popup.html         Popup UI — word list, export, settings
│   ├── popup.css          Popup styles
│   └── popup.js           Popup logic
└── icons/
    ├── icon16.png         Extension icons
    ├── icon48.png
    └── icon128.png
```

## Technical Notes

- **Manifest V3** — uses a service worker instead of a background page, as required by Chrome since 2024
- **Shadow DOM** — the content script renders its tooltip inside a closed shadow DOM to prevent style conflicts with the host page
- **MyMemory API** — free tier allows up to 5,000 words/day with no authentication required
- **Multiple translations** — the API's `matches` array is deduplicated, filtered, and sorted by quality to offer up to 5 distinct options
- **Duplicate detection** — the same word/translation pair won't be saved twice
- **No build step** — plain HTML, CSS, and JavaScript; no bundler or framework required

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist saved words and settings across sessions |
| `host_permissions` (`api.mymemory.translated.net`) | Fetch translations from the MyMemory API |
| `http/https` (content script) | Inject the word-selection UI on web pages |

## Built With

This entire project was built using [OpenCode](https://opencode.ai/) with the **Claude Opus 4.6** model — from initial design and architecture decisions through full implementation.

## License

See [LICENSE](LICENSE) for details.
