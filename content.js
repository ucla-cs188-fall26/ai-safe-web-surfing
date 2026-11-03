/**
 * ShieldBlock - Dynamic Content Script
 * Handles DOM element inspection, dynamic cosmetic filtering, video ad skipping,
 * and reports blocked counts to the background service worker.
 */

(() => {
  // Prevent duplicate execution
  if (window.__shieldBlockInjected) return;
  window.__shieldBlockInjected = true;

  let isEnabled = true;
  let isWhitelisted = false;
  let cosmeticFiltering = true;
  let blockedCount = 0;
  let observer = null;
  let doomscrollingReminders = true;
  let doomscrollingThresholdMinutes = 20;
  let doomscrollingCooldownMinutes = 60;
  let doomscrollingStartedAt = Date.now();
  let lastActivityAt = Date.now();
  let scrollDistance = 0;
  let scrollEvents = 0;
  let nextReminderAt = 0;
  let reminderElement = null;
  let reminderTimer = null;

  const DOOMSCROLL_MIN_SCROLL_EVENTS = 30;
  const DOOMSCROLL_MIN_DISTANCE = 5000;
  const DOOMSCROLL_ACTIVITY_TIMEOUT = 120000;
  const DOOMSCROLL_TEST_SCROLL_EVENTS = 5;
  const DOOMSCROLL_TEST_DISTANCE = 500;

  // Selective list of high-confidence ad selectors for DOM removal
  const AD_SELECTORS = [
    'ins.adsbygoogle',
    '[id^="google_ads_"]',
    '[id*="google_ads_iframe"]',
    '[id^="gpt_unit_"]',
    '[id^="dfp-ad-"]',
    'div[data-google-query-id]',
    '.trc_related_container',
    '.trc_rbox_div',
    '.outbrain_widget_container',
    'div[class*="taboola-"]',
    'div[id*="taboola-"]',
    'div[class*="outbrain-"]',
    'div[id*="outbrain-"]',
    '.ad-container',
    '.ad-wrapper',
    '.ad-banner',
    '.ad-slot',
    '.ad-box',
    '.ad-unit',
    '.advertisement',
    '.banner-ad',
    '.sticky-ad',
    '.floating-ad',
    'div[data-ad-slot]',
    'div[data-ad-unit]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[src*="criteo.com"]',
    'iframe[src*="adnxs.com"]'
  ];

  const COMBINED_SELECTOR = AD_SELECTORS.join(', ');

  // Video ad skip button selectors
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-text',
    'button.videoAdUiSkipButton',
    '.video-ad-skip-button',
    '.ytp-ad-overlay-close-button'
  ];

  // Request status from background worker
  function checkStatusAndInitialize() {
    try {
      chrome.runtime.sendMessage(
        {
          action: 'GET_PAGE_STATUS',
          payload: { url: window.location.href }
        },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            return;
          }

          isEnabled = response.isEnabled !== false;
          isWhitelisted = !!response.isWhitelisted;
          cosmeticFiltering = response.cosmeticFiltering !== false;
          doomscrollingReminders = response.doomscrollingReminders !== false;
          doomscrollingThresholdMinutes = clampMinutes(response.doomscrollingThresholdMinutes, 20);
          doomscrollingCooldownMinutes = clampMinutes(response.doomscrollingCooldownMinutes, 60);

          if (isEnabled && !isWhitelisted && cosmeticFiltering) {
            startCosmeticFilter();
            startVideoAdSkipper();
          }
          if (isEnabled && !isWhitelisted && doomscrollingReminders) {
            startDoomscrollingDetector();
          }
        }
      );
    } catch {
      // Context invalidated or extension reloaded
    }

    function clampMinutes(value, fallback) {
      const minutes = Number(value);
      return Number.isFinite(minutes) && minutes >= 1 && minutes <= 240 ? minutes : fallback;
    }

    function startDoomscrollingDetector() {
      window.addEventListener('scroll', recordScrollActivity, { passive: true });
      window.addEventListener('pointerdown', recordActivity, { passive: true });
      window.addEventListener('keydown', recordActivity, { passive: true });
      const checkInterval = doomscrollingThresholdMinutes === 1 ? 5000 : 30000;
      reminderTimer = window.setInterval(checkForDoomscrolling, checkInterval);
    }

    function recordActivity() {
      lastActivityAt = Date.now();
    }

    function recordScrollActivity() {
      const currentScrollY = window.scrollY;
      const previousScrollY = recordScrollActivity.lastScrollY ?? currentScrollY;
      scrollDistance += Math.abs(currentScrollY - previousScrollY);
      recordScrollActivity.lastScrollY = currentScrollY;
      scrollEvents++;
      recordActivity();
    }

    function checkForDoomscrolling() {
      if (!doomscrollingReminders || reminderElement) return;
      const now = Date.now();
      const elapsedMinutes = (now - doomscrollingStartedAt) / 60000;
      const inactive = now - lastActivityAt > DOOMSCROLL_ACTIVITY_TIMEOUT;
      const cooldownElapsed = now >= nextReminderAt;
      const isTestMode = doomscrollingThresholdMinutes === 1;
      const minimumScrollEvents = isTestMode ? DOOMSCROLL_TEST_SCROLL_EVENTS : DOOMSCROLL_MIN_SCROLL_EVENTS;
      const minimumDistance = isTestMode ? DOOMSCROLL_TEST_DISTANCE : DOOMSCROLL_MIN_DISTANCE;

      if (
        elapsedMinutes >= doomscrollingThresholdMinutes &&
        scrollEvents >= minimumScrollEvents &&
        scrollDistance >= minimumDistance &&
        !inactive &&
        cooldownElapsed
      ) {
        showDoomscrollingReminder();
      }
    }

    function showDoomscrollingReminder() {
      reminderElement = document.createElement('aside');
      reminderElement.className = 'shieldblock-break-reminder';
      reminderElement.setAttribute('role', 'status');
      reminderElement.innerHTML = `
        <strong>You’ve been scrolling for a while.</strong>
        <span>Would you like to take a short break?</span>
        <div class="shieldblock-break-actions">
          <button type="button" data-action="dismiss">Dismiss</button>
          <button type="button" data-action="later">Remind me later</button>
        </div>
      `;
      reminderElement.addEventListener('click', (event) => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        const isTestMode = doomscrollingThresholdMinutes === 1;
        const delayMinutes = isTestMode
          ? 0.25
          : action === 'later' ? 15 : doomscrollingCooldownMinutes;
        nextReminderAt = Date.now() + delayMinutes * 60000;
        reminderElement.remove();
        reminderElement = null;
        window.setTimeout(checkForDoomscrolling, delayMinutes * 60000 + 100);
      });
      (document.body || document.documentElement).appendChild(reminderElement);
    }
  }

  // Scan and remove ad elements from the DOM
  function purgeAds() {
    if (!isEnabled || isWhitelisted || !cosmeticFiltering) return;

    try {
      const adElements = document.querySelectorAll(COMBINED_SELECTOR);
      let newRemoved = 0;

      adElements.forEach((el) => {
        // Only count if not previously processed
        if (!el.dataset.sbBlocked) {
          el.dataset.sbBlocked = 'true';
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('height', '0px', 'important');
          newRemoved++;
        }
      });

      if (newRemoved > 0) {
        blockedCount += newRemoved;
        notifyBackground(newRemoved);
      }
    } catch (e) {
      console.debug('[ShieldBlock] Scan error:', e);
    }
  }

  // Video Ad Auto-Skipper & Overlay Closer
  function startVideoAdSkipper() {
    setInterval(() => {
      if (!isEnabled || isWhitelisted) return;

      // Click standard skip buttons when active
      for (const selector of SKIP_SELECTORS) {
        const btn = document.querySelector(selector);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          blockedCount++;
          notifyBackground(1);
          break;
        }
      }

      // Fast-forward video ad if player is in ad state
      const adShowing = document.querySelector('.ad-showing video, .video-ads video');
      if (adShowing && !isNaN(adShowing.duration) && isFinite(adShowing.duration)) {
        try {
          adShowing.playbackRate = 16.0;
          adShowing.muted = true;
          adShowing.currentTime = adShowing.duration - 0.1;
        } catch {}
      }
    }, 500);
  }

  // Report newly blocked items to background service worker
  function notifyBackground(count) {
    try {
      chrome.runtime.sendMessage({
        action: 'INCREMENT_COSMETIC_BLOCKED',
        payload: { count }
      });
    } catch {
      // Ignored if runtime port disconnected
    }
  }

  // Debounced MutationObserver for dynamic page elements
  function startCosmeticFilter() {
    // Initial cleanup pass
    purgeAds();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', purgeAds, { once: true });
    }

    let timeoutId = null;
    observer = new MutationObserver(() => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        purgeAds();
        timeoutId = null;
      }, 250);
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize
  checkStatusAndInitialize();
})();
