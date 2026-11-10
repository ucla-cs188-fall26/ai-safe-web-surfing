/**
 * ShieldBlock - Popup UI Controller
 * Handles user interactions, real-time status fetching, toggles, and tab reloading.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const masterHero = document.querySelector('.master-hero');
  const masterToggle = document.getElementById('masterToggle');
  const statusText = document.getElementById('statusText');
  const siteDomainEl = document.getElementById('siteDomain');
  const siteWhitelistToggle = document.getElementById('siteWhitelistToggle');
  const pageBlockedCount = document.getElementById('pageBlockedCount');
  const totalBlockedCount = document.getElementById('totalBlockedCount');
  const cosmeticToggle = document.getElementById('cosmeticToggle');
  const trackerToggle = document.getElementById('trackerToggle');
  const reloadTabBtn = document.getElementById('reloadTabBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');

  let currentTab = null;
  let currentHostname = '';
  let retryTimer = null;
  window.addEventListener('unload', () => clearTimeout(retryTimer));

  // Helper to extract clean domain
  function extractHostname(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol.startsWith('http')) {
        return parsed.hostname;
      }
      return parsed.protocol.replace(':', '').toUpperCase();
    } catch {
      return 'Unknown';
    }
  }

  // Number animation utility
  function animateValue(element, start, end, duration = 600) {
    if (start === end) {
      element.textContent = end.toLocaleString();
      return;
    }
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / (range || 1)));
    const timer = setInterval(() => {
      current += increment;
      element.textContent = current.toLocaleString();
      if (current === end) {
        clearInterval(timer);
      }
    }, Math.max(stepTime, 15));
  }

  // Fetch active tab and query extension status
  async function loadStatus() {
    clearTimeout(retryTimer);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];

    if (!currentTab || !currentTab.url) {
      siteDomainEl.textContent = 'Special Page';
      return;
    }

    currentHostname = extractHostname(currentTab.url);
    siteDomainEl.textContent = currentHostname;

    chrome.runtime.sendMessage(
      {
        action: 'GET_PAGE_STATUS',
        payload: { tabId: currentTab.id, url: currentTab.url }
      },
      (res) => {
        const error = chrome.runtime.lastError;
        if (error || !res) {
          document.getElementById('safetyCoverage').textContent =
            'Could not contact the extension. Reload the extension and refresh this page.';
          return;
        }

        const safety = res.safety;
        const pending = safety?.score == null && res.scanStatus === 'loading';
        document.getElementById('safetyScore').textContent =
          safety?.score == null ? (pending ? 'Scanning…' : 'Unavailable') : `${safety.score}/100`;
        const reasons = document.getElementById('safetyReasons');
        reasons.replaceChildren();
        for (const reason of safety?.reasons || []) {
          const item = document.createElement('li');
          item.textContent = `−${reason.points}: ${reason.message}`;
          reasons.appendChild(item);
        }
        document.getElementById('safetyCoverage').textContent = safety?.score == null
          ? pending ? 'Waiting for the page to load. The score will update automatically.'
            : res.scanStatus === 'unsupported'
              ? 'Safety scans are available on HTTP and HTTPS webpages only.'
              : 'Cannot read this page. Refresh the webpage to connect the extension. Some browser pages restrict extensions.'
          : safety.reasons.length ? 'Coverage: current page DOM and URL.'
            : 'No risks detected by these limited checks. Coverage: current page DOM and URL.';
        if (pending || res.scanStatus === 'missing-content-script') {
          retryTimer = setTimeout(loadStatus, 1000);
        }

        // Update Master Toggle state
        const isMasterActive = res.isEnabled && !res.isWhitelisted;
        updateMasterUI(isMasterActive, res.isWhitelisted);

        // Site allowlist toggle
        siteWhitelistToggle.checked = !res.isWhitelisted;

        // Statistics
        const pageCount = res.tabStats?.total || 0;
        const totalCount = res.globalStats?.totalBlocked || 0;
        animateValue(pageBlockedCount, 0, pageCount);
        animateValue(totalBlockedCount, 0, totalCount);

        // Preferences
        cosmeticToggle.checked = res.cosmeticFiltering;
      }
    );
  }

  function updateMasterUI(isActive, isWhitelisted = false) {
    if (isActive) {
      masterHero.classList.remove('paused');
      statusText.textContent = 'Protection Active';
    } else {
      masterHero.classList.add('paused');
      statusText.textContent = isWhitelisted ? 'Paused on this Site' : 'Protection Paused';
    }
  }

  function showReloadPrompt() {
    reloadTabBtn.classList.add('pulse');
  }

  // Master Toggle click
  masterToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TOGGLE_GLOBAL' }, (res) => {
      if (res && res.success) {
        updateMasterUI(res.isEnabled);
        showReloadPrompt();
      }
    });
  });

  // Site Allowlist toggle
  siteWhitelistToggle.addEventListener('change', () => {
    if (!currentHostname || currentHostname === 'Unknown') return;
    chrome.runtime.sendMessage(
      {
        action: 'TOGGLE_SITE_WHITELIST',
        payload: { hostname: currentHostname }
      },
      (res) => {
        if (res && res.success) {
          updateMasterUI(!res.isWhitelisted, res.isWhitelisted);
          showReloadPrompt();
        }
      }
    );
  });

  // Cosmetic toggle change
  cosmeticToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        action: 'UPDATE_SETTINGS',
        payload: { cosmeticFiltering: cosmeticToggle.checked }
      },
      () => showReloadPrompt()
    );
  });

  // Tracker toggle change
  trackerToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        action: 'UPDATE_SETTINGS',
        payload: { trackerBlocking: trackerToggle.checked }
      },
      () => showReloadPrompt()
    );
  });

  // Reload current tab
  reloadTabBtn.addEventListener('click', () => {
    if (currentTab && currentTab.id) {
      chrome.tabs.reload(currentTab.id);
      window.close();
    }
  });

  // Open settings page
  openSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  // Initialize
  await loadStatus();
});
