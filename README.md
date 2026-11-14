# 🛡️ ShieldBlock (AI-Safe Web Surfing) - Manifest V3 Browser Protection

ShieldBlock is a high-performance, lightweight, and privacy-first browser extension engineered for **Chromium Manifest V3 (MV3)**. It combines Chromium's native `declarativeNetRequest` engine with real-time cosmetic DOM filtering, automated cookie consent rejection, client-side security assessment, mindful browsing (anti-doomscrolling) reminders, and video ad acceleration.

---

## 🎯 What This Extension Is Made To Do (The Scenarios)

The extension is designed around 7 core scenarios that protect your privacy, security, and browsing focus:

### Scenario 1: Network-Level Ad & Tracker Elimination (Declarative Engine)
* **Objective:** Prevent ad networks, tracking scripts, beacons, and telemetry from downloading before any HTTP payload reaches your browser.
* **How it works:** Leverages 90+ declarative network rules (`rules.json` and `rules-trackers.json`) via Chrome's `declarativeNetRequest` API. It automatically blocks requests to major advertising networks and trackers including Google AdSense, DoubleClick, Criteo, Taboola, Outbrain, Amazon AdSystem, PubMatic, PopAds, and AppNexus without intercepting or slowing down page traffic.

### Scenario 2: Cosmetic DOM Ad Cleansing & Zero-CLS Layout Protection
* **Objective:** Remove blank ad wrappers, collapsed boxes, sponsored content widgets, and sticky banner placeholders so pages render cleanly with zero Cumulative Layout Shift (CLS).
* **How it works:** Injects instant CSS styling (`content.css`) at `document_start` to collapse known ad selectors before the browser paints the screen. A lightweight, debounced `MutationObserver` in `content.js` monitors dynamic DOM changes to instantly remove dynamically injected ads.

### Scenario 3: Automated Cookie Consent Banner Decline & Opt-Out
* **Objective:** Free you from repetitive cookie consent popups across the web while preserving privacy by automatically rejecting non-essential tracking cookies.
* **How it works:** Automatically identifies consent banners. It clicks "Reject All" / "Decline" buttons automatically. 

### Scenario 4: Local Website Safety Scoring & Real-Time Security Warnings
* **Objective:** Detect connection vulnerabilities and credential risks on web pages without sending any browsing history or URLs to external servers.
* **How it works:** A 100% client-side security heuristics engine (`website-score.js`) scores pages starting at 100. It applies deductions for insecure HTTP connections (-25), password fields transmitted over HTTP (-40), insecure form submission targets (-30), and mixed HTTP content on HTTPS pages (-15). If a page scores below 70, a prominent, accessible on-page safety banner (`safety-warning.js`) warns you of specific risks before you interact with the page.

### Scenario 5: Mindful Browsing & Anti-Doomscrolling Reminders
* **Objective:** Prevent endless, unconscious scrolling on social media feeds, news portals, and infinite-scroll websites.
* **How it works:** Monitors active foreground tab engagement (excluding background or inactive windows). When sustained scrolling reaches a configurable threshold (e.g., 20 minutes of active browsing, or 1 minute in test mode) with significant scroll distance and events, an interactive break reminder appears. You can choose **"Dismiss"** (activates a cooldown timer) or **"Remind me later"** (snoozes for 15 minutes).

### Scenario 6: HTML5 Video Ad Acceleration & Auto-Skipper
* **Objective:** Minimize video ad interruptions on streaming media platforms (such as YouTube).
* **How it works:** Continuously monitors HTML5 media players. When an ad skip button appears, it triggers a programmatic click immediately. For non-skippable ad segments, it mutes audio and accelerates playback rate up to 16x to pass through the ad instantly.

### Scenario 7: Interactive Glassmorphic Popup & Settings Dashboard
* **Objective:** Provide full transparency, live statistics, and granular user controls.
* **How it works:**
  * **Popup Interface (`popup/`):** Features a master on/off power switch, one-click per-site allowlisting toggle, real-time page & all-time blocked counters, live local safety score display, and fast feature toggles.
  * **Settings Dashboard (`options/`):** Offers detailed metrics, protection engine toggles, custom domain allowlist manager, custom user filter rule editor, configurable doomscrolling thresholds, and JSON settings backup/export/import.

---

## 📥 Step-by-Step Installation Instructions

ShieldBlock is compatible with any Chromium-based desktop browser (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**, or **Vivaldi**).

### Step 1: Open the Extensions Page
Open your browser and navigate to the extension management URL:
* **Google Chrome:** `chrome://extensions`
* **Brave Browser:** `brave://extensions`
* **Microsoft Edge:** `edge://extensions`
* **Opera:** `opera://extensions`

### Step 2: Enable Developer Mode
In the top-right corner of the Extensions page, toggle the **Developer mode** switch to **ON**.

### Step 3: Load the Unpacked Extension
1. Click the **"Load unpacked"** button in the top-left menu.
2. In the file picker dialog, navigate to and select the project root folder (the folder containing `manifest.json`):
   ```
   ai-safe-web-surfing-1
   ```
3. Click **Select** / **Open**.

### Step 4: Verify Installation
* ShieldBlock will now appear in your list of installed extensions with the **"PRO • MV3"** badge.
* Click the puzzle icon (Extensions menu) in your browser toolbar and **pin** ShieldBlock to your toolbar for easy access.

### Step 5: Enable Local File Access (Recommended for Testing)
To allow ShieldBlock to protect and test local HTML files (like the included test suite):
1. In `chrome://extensions`, locate the **ShieldBlock** card.
2. Click **Details**.
3. Scroll down and toggle **ON** the switch labeled **"Allow access to file URLs"**.

---

## 🚀 How to Run and Verify Each Scenario

ShieldBlock includes an interactive test suite (`test-ad-page.html`) and direct workflows to verify every scenario.

### A. Running the Test Sandbox Suite (`test-ad-page.html`)

You can run the interactive test suite using either of the following methods:

* **Method 1 (Direct File):** Open `test-ad-page.html` directly in your browser:
  ```
  file:///path/to/ai-safe-web-surfing-1/test-ad-page.html
  ```
  *(Ensure "Allow access to file URLs" is enabled as described in Step 5 above).*
* **Method 2 (Local Web Server):** Serve the folder using Python or Node:
  ```bash
  # Using Python 3:
  python3 -m http.server 8000
  # Then open: http://localhost:8000/test-ad-page.html

  # Or using npx:
  npx serve .
  ```

#### Verifying Test Cases on the Test Page:
1. **Cosmetic Ad Hiding (Scenario 1):**
   * Inspect the **"Test 1: Cosmetic DOM Ad Element Hiding"** card.
   * Notice that the red leaderboard banner, sponsored widget, and Google AdSense container are completely hidden and collapsed (0px height).
2. **Network Request Blocking (Scenario 2):**
   * In **"Test 2: Declarative Network Request Blocking"**, click the green button labeled **"Simulate Ad Network Fetch"**.
   * The log box will confirm that network calls to DoubleClick, Google Syndication, and AppNexus were intercepted and blocked by the DNR engine.
3. **Dynamic Ad Injection (Scenario 3):**
   * In **"Test 3: Dynamic Ad Injection & MutationObserver"**, click **"Inject Dynamic Ad Banner"**.
   * ShieldBlock's dynamic observer detects the injected node and collapses it immediately.
4. **Cookie Consent Auto-Decline (Scenario 4):**
   * In **"Test 4: Cookie Banner Auto-Decline"**, click **"Simulate Cookie Banner Popup"**.
   * Watch ShieldBlock detect the banner, simulate a click on **"Reject All"**, and display: `✅ SUCCESS: "Reject All" button was automatically clicked by ShieldBlock!`.

---

### B. Running Live Web Scenarios

#### Running Scenario 1: Cookie Auto-Decline on Live Sites
1. Ensure **"Auto-Decline Cookies"** is enabled in the popup or settings dashboard.
2. Visit websites with GDPR/CCPA consent banners.
3. The extension detects the consent framework, selects the decline/reject option, dismisses the overlay, and restores normal page interaction.

#### Running Scenario 2: Local Safety Score & Insecure Page Warning
1. Click the ShieldBlock icon in your toolbar on any open webpage.
2. The popup displays the **Local safety score** (e.g., `100/100` on secure HTTPS sites with no detected risks).
3. To test the security warning banner:
   * Visit an unencrypted HTTP page containing a login form or input field.
   * Observe the warning card injected into the top-right corner of the page showing the reduced score and specific risk warnings.
   * Click **"Dismiss"** to dismiss the notification for the current page session.

#### Running Scenario 3: Mindful Browsing & Doomscrolling Reminder
1. Open the ShieldBlock popup and click the gear icon to open **Extension Settings** (or right-click the extension icon and select **Options**).
2. Under **Protection Engines**, locate **"Reminder Threshold"** and select **"1 minute (temporary test)"**.
3. Open a content-heavy or social media website (e.g., news or Reddit) and actively scroll for 60 seconds.
4. An unobtrusive reminder will slide into view at the bottom right:
   > *"You’ve been scrolling for a while. Would you like to take a short break?"*
5. Test clicking **"Remind me later"** (15-minute snooze) or **"Dismiss"** (cooldown period).

#### Running Scenario 4: Video Ad Acceleration
1. Navigate to YouTube or any HTML5 video player.
2. Play any video where pre-roll or mid-roll ads are served.
3. ShieldBlock will automatically click the "Skip Ad" button the instant it becomes available, or accelerate through unskippable segments at 16x speed with sound muted.

#### Running Scenario 5: Allowlisting and Settings Management
1. **Per-Site Allowlist:**
   * Open the popup on any domain and toggle **"Current Website"** allowlist switch.
   * Notice that filtering is paused for that domain without disabling global protection.

---

## 🧪 Automated Test Suite & Development

ShieldBlock includes a comprehensive suite of unit, integration, and contract tests powered by the Node.js native test runner.

### Running Tests Locally

Ensure [Node.js](https://nodejs.org/) (v18+) is installed:

```bash
# Run all 40 automated tests across all test suites
npm test

# Run individual test modules
npm run test:manifest     # Validates Manifest V3 specification, icons, and permissions
npm run test:rules        # Validates Declarative Net Request (DNR) syntax & rule uniqueness
npm run test:cosmetic     # Validates cosmetic selectors and stylesheet integrity
npm run test:contracts    # Validates message passing contracts between scripts and worker

# Run code linter
npm run lint

# Package extension into a distributable zip archive
npm run package
```

### GitHub Actions CI/CD (`.github/workflows/`)
* **`ci.yml`**: Matrix testing across Node.js 18.x, 20.x, and 22.x; validates schemas, runs all 40 unit and contract tests, and produces build artifacts.
* **`release.yml`**: Automatically generates release zip packages on tagged git releases.
* **`codeql.yml`**: Runs GitHub CodeQL security analysis against all extension JavaScript files.

---

## 📁 Repository Structure

```
ai-safe-web-surfing-1/
├── manifest.json              # Extension Manifest V3 configuration & permissions
├── background.js              # Service worker: DNR rules, badge counters, allowlist & state
├── rules.json                 # Static Declarative Net Request rules for ad networks
├── rules-trackers.json        # Static rules targeting telemetry & tracking domains
├── content.css                # Document-start cosmetic element hiding stylesheet
├── content.js                 # Dynamic DOM MutationObserver, cookie dismisser, video skipper
├── safety-warning.js          # In-page security warning component for low-scoring sites
├── website-score.js           # Client-side heuristic safety assessment engine
├── test-ad-page.html          # Interactive sandbox to test network, DOM, and cookie blocking
├── popup/
│   ├── popup.html             # Glassmorphic dark mode popup interface
│   ├── popup.css              # Popup styling, animations, and responsive layout
│   └── popup.js               # State synchronization, real-time counters, allowlist toggles
├── options/
│   ├── options.html           # In-depth settings dashboard & telemetry overview
│   ├── options.css            # Settings dashboard dark theme styling
│   └── options.js             # Allowlist editor, custom rules manager, settings backup
├── tests/                     # 40 automated unit, contract, and integration tests
│   ├── cookies.test.js
│   ├── cosmetic.test.js
│   ├── doomscrolling-active-time.test.js
│   ├── doomscrolling.test.js
│   ├── manifest.test.js
│   ├── message-contract.test.js
│   ├── rules.test.js
│   ├── safety-warning.test.js
│   └── website-score.test.js
└── scripts/
    ├── lint.js                # Extension linter
    └── package-extension.py   # Distribution packager
```

---

## 🔒 Privacy & Permissions

ShieldBlock is engineered with a strict privacy-first architecture:
* **No External Data Collection:** Zero browsing data, URLs, or personal information are sent to external servers or remote endpoints.
* **Local Processing:** Safety scores, cosmetic filtering, cookie dismissal, and scrolling timers run entirely within your local browser context.
* **Declarative Performance:** Network filtering is executed by the Chromium browser engine itself via `declarativeNetRequest`, guaranteeing near-zero CPU and memory overhead.
