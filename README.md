# 🛡️ ShieldBlock - Modern Manifest V3 Ad & Tracker Blocker

ShieldBlock is a high-performance, lightweight, and privacy-focused browser extension built for **Manifest V3** (MV3). It combines Chromium's high-speed `declarativeNetRequest` engine with real-time cosmetic DOM filtering and video ad auto-skipping.

---

## ✨ Features

- **Manifest V3 Compliant**: Built strictly for modern browser standards without deprecated MV2 `webRequestBlocking`.
- **High-Speed Declarative Engine**: 90+ declarative network rules blocking requests to major ad networks (Google AdSense/DoubleClick, Criteo, Taboola, Outbrain, Amazon AdSystem, PubMatic, PopAds, etc.).
- **Zero-CLS Cosmetic Filtering**: Injects instant CSS at `document_start` to suppress layout shifts and collapse empty ad placeholders before page paint.
- **Dynamic MutationObserver**: Continually sweeps and eliminates dynamically injected ad wrappers and tracking pixels with minimal CPU overhead.
- **Video Ad Accelerator & Auto-Skipper**: Automatically detects and triggers standard skip ad buttons on HTML5 media players.
- **Glassmorphic Dark Mode Popup**:
  - One-click master protection power switch.
  - Per-site allowlisting toggle.
  - Real-time badge counter and live session & all-time blocked statistics.
  - Direct quick reload action.
- **Local safety score**: The popup scans the current page independently of ad blocking. Starting at 100, it deducts 25 for HTTP, 40 for a password field on HTTP, 30 for an HTTP form destination, and 15 for HTTP script/iframe references on HTTPS. Each category applies once, with a floor of zero. These heuristic weights are not probabilities; a score of 100 only means these checks found no risks. Content reliability and reputation are not assessed. Missing scans show “Unavailable.” Scans stay local and do not read field values. Reopen the popup after loading or page changes to refresh.
- **Automatic safety warnings**: Pages scoring below 70 display a prominent, dismissible warning in the upper-right corner, with the score and detected risks. Checks also catch dynamically added forms and password fields. Dismissal lasts until the page reloads or a new document loads. Warnings work independently of ad-blocking settings; a score of exactly 70 does not trigger a warning.
- **Full Settings Dashboard**:
  - Allowlist manager (domain whitelist).
  - Custom user filter rules editor.
  - Telemetry reset.
  - Backup & restore settings via JSON import/export.
- **Offline Test Suite**: Includes `test-ad-page.html` to instantly verify network blocking and DOM filtering.

---

## 🚀 How to Install & Load in Your Browser

ShieldBlock is ready to run in any Chromium-based browser (Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi):

1. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left menu.
4. Select the project folder:
   ```
   /Users/arya/Desktop/CS188
   ```
5. ShieldBlock will appear in your extensions list and pin to your browser toolbar!

---

## 🧪 Testing & CI/CD Pipelines

ShieldBlock includes a comprehensive test suite and automated GitHub Actions CI/CD workflows:

### Automated GitHub Actions Workflows (`.github/workflows/`)

1. **`ci.yml`**:
   - Matrix testing across **Node 18.x, 20.x, and 22.x**.
   - **Syntax & Schema Verification**: Validates `manifest.json`, `rules.json`, and all JavaScript sources.
   - **Automated Test Suite**: Executes 16 unit, integration, and contract tests.
   - **Manifest V3 Permissions Audit**: Validates host permissions and DNR compliance.
   - **Artifact Upload**: Automatically packages and attaches the extension `.zip` to the workflow run.

2. **`release.yml`**:
   - Triggers on tag pushes (`v*.*.*`) or manual trigger.
   - Builds distribution zip and creates official GitHub Releases.

3. **`codeql.yml`**:
   - Runs GitHub CodeQL security analysis to catch vulnerabilities and injection flaws.

### Running Tests Locally

```bash
# Run full test suite
npm test

# Run individual test modules
npm run test:manifest     # Validates Manifest V3 specification & paths
npm run test:rules        # Validates Declarative Net Request (DNR) rules
npm run test:cosmetic     # Validates CSS and DOM selectors
npm run test:contracts    # Validates message passing contracts

# Run linter
npm run lint

# Package extension into zip archive for distribution
npm run package
```

---

## 📁 Project Structure

```
├── manifest.json         # Extension Manifest V3 configuration
├── background.js         # Service worker: rule syncing, state, whitelist, and badge updates
├── rules.json            # Static declarativeNetRequest block rules
├── content.css           # Document-start cosmetic element hiding styles
├── content.js            # Dynamic DOM mutation observer and video ad skipper
├── test-ad-page.html     # Interactive testing sandbox
├── popup/
│   ├── popup.html        # Glassmorphic dark popup interface
│   ├── popup.css         # Styling, glowing neon effects, and animations
│   └── popup.js          # Live counters, master switch, and tab reload logic
├── options/
│   ├── options.html      # Comprehensive settings dashboard
│   ├── options.css       # Dashboard theme and layouts
│   └── options.js        # Whitelist manager, custom rules, and JSON import/export
└── icons/
    ├── icon16.png        # Toolbar favicon
    ├── icon32.png        # High-DPI icon
    ├── icon48.png        # Extensions management icon
    └── icon128.png       # Chrome Web Store & detailed display icon
```
