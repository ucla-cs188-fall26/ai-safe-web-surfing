/**
 * ShieldBlock - Dynamic Content Script
 * Handles DOM element inspection, dynamic cosmetic filtering, video ad skipping,
 * and reports blocked counts to the background service worker.
 */

(() => {
  // Prevent duplicate execution
  if (window.__shieldBlockInjected) return;
  window.__shieldBlockInjected = true;

  // Independent of filtering settings: inspect locally without reading field values.
  function collectSafetySignals() {
    const isHttp = (value) => {
      try { return new URL(value, document.baseURI).protocol === 'http:'; }
      catch { return false; }
    };
    return {
      ready: document.readyState !== 'loading',
      url: window.location.href,
      hasPasswordField: !!document.querySelector('input[type="password" i]'),
      hasHttpForm: Array.from(document.querySelectorAll('form')).some((form) =>
        isHttp(form.getAttribute('action') || window.location.href)) ||
        Array.from(document.querySelectorAll('button[formaction], input[formaction]')).some((el) =>
          isHttp(el.getAttribute('formaction') || window.location.href)),
      hasHttpResource: Array.from(document.querySelectorAll('script[src], iframe[src]')).some((el) =>
        isHttp(el.getAttribute('src')))
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'GET_SAFETY_SIGNALS') return;
    sendResponse(collectSafetySignals());
  });

  // Safety warnings are independent of ad filtering and only appear in the top frame.
  if (window === window.top) {
    let dismissed = false;
    let warningHost = null;
    let warningSignature = '';
    let pendingScan = null;
    function updateSafetyWarning() {
      pendingScan = null;
      if (dismissed) return;
      const safety = scoreWebsite(window.location.href, collectSafetySignals());
      if (!shouldWarnWebsite(safety)) {
        warningHost?.remove();
        warningHost = null;
        return;
      }
      const signature = JSON.stringify(safety);
      if (warningHost && warningSignature === signature) return;
      warningHost?.remove();
      warningSignature = signature;
      warningHost = createSafetyWarning(safety, () => {
        dismissed = true;
        warningObserver.disconnect();
        warningHost.remove();
        warningHost = null;
      });
      document.documentElement.appendChild(warningHost);
    }
    const warningObserver = new MutationObserver(() => {
      if (!dismissed && pendingScan === null) pendingScan = setTimeout(updateSafetyWarning, 300);
    });
    function startSafetyWarnings() {
      updateSafetyWarning();
      warningObserver.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['type', 'action', 'formaction', 'src']
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startSafetyWarnings, { once: true });
    } else {
      startSafetyWarnings();
    }
  }
  // Safely mark ShieldBlock active on DOM without throwing if documentElement is null at document_start
  function markActive() {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-shieldblock-active', 'true');
    }
  }
  markActive();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markActive, { once: true });
  }

  let isEnabled = true;
  let isWhitelisted = false;
  let cosmeticFiltering = true;
  let autoDismissCookies = true;
  let blockedCount = 0;
  let observer = null;
  let doomscrollingReminders = true;
  let doomscrollingThresholdMinutes = 20;
  let doomscrollingCooldownMinutes = 60;
  let activeTimeMs = 0;
  let lastTickAt = 0;
  let lastInteractionAt = 0;
  let isViewing = false;
  let awaySince = null;
  let scrollDistance = 0;
  let scrollEvents = 0;
  let nextReminderAt = 0;
  let reminderElement = null;
  let reminderTimer = null;

  const DOOMSCROLL_MIN_SCROLL_EVENTS = 30;
  const DOOMSCROLL_MIN_DISTANCE = 5000;
  const DOOMSCROLL_ACTIVITY_TIMEOUT = 120000;
  const DOOMSCROLL_SESSION_BREAK = 5 * 60 * 1000;
  const DOOMSCROLL_TEST_SCROLL_EVENTS = 5;
  const DOOMSCROLL_TEST_DISTANCE = 500;
  let cookieDismissed = false;

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

  // Helper to accurately determine element visibility (handles position: fixed & shadow DOM)
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    return true;
  }

  // Robust click trigger that dispatches both native click and synthetic mouse events
  function triggerClick(el) {
    if (!el) return;
    try {
      el.click();
    } catch {}
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, composed: true }));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('shieldblock:cookie-dismissed', { detail: { targetId: el.id } }));
    } catch {}
  }

  // Cookie consent banner container selectors
  const COOKIE_BANNER_SELECTORS = [
    '#onetrust-banner-sdk',
    '#onetrust-consent-sdk',
    '#CybotCookiebotDialog',
    '.cc-banner',
    '.cc-window',
    '#cookie-banner',
    '#cookie-consent',
    '#cookie-notice',
    '#cookie-popup',
    '#cookie-bar',
    '#cookie-law-info-bar',
    '#gdpr-cookie-notice',
    '#cookieConsentContainer',
    '.cookie-consent-banner',
    '.cookie-notice',
    '.cookie-banner',
    '.cookie-popup',
    '.cookie-modal',
    '.cookie-overlay',
    '.cookies-banner',
    '.consent-banner',
    '.consent-modal',
    '.gdpr-banner',
    '.gdpr-consent',
    '.privacy-banner',
    '.privacy-consent',
    '[class*="cookie-consent"]',
    '[class*="cookie-banner"]',
    '[class*="cookie-notice"]',
    '[id*="cookie-consent"]',
    '[id*="cookie-banner"]',
    '[id*="cookie-notice"]',
    '[data-testid="cookie-banner"]',
    '[aria-label*="cookie" i]',
    '[aria-label*="consent" i]',
    '.fc-consent-root',
    '#usercentrics-root',
    '.cmp-container',
    '#qc-cmp2-container',
    '.sp_message_container'
  ];

  // Specific high-confidence vendor/CMP selectors safe to query globally
  const SPECIFIC_COOKIE_BUTTON_SELECTORS = [
    '#onetrust-reject-all-handler',
    '.onetrust-close-btn-handler',
    '#CybotCookiebotDialogBodyButtonDecline',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '.fc-cta-do-not-consent',
    '.fc-close',
    '#cookie_action_close_header_reject',
    '.cli-plugin-button.cli-plugin-reject-btn',
    '[data-testid="uc-deny-all-button"]'
  ];

  // Button selectors to click for declining/rejecting cookies (ordered by priority)
  const COOKIE_DECLINE_BUTTON_SELECTORS = [
    // OneTrust
    '#onetrust-reject-all-handler',
    '.onetrust-close-btn-handler',
    // Cookiebot
    '#CybotCookiebotDialogBodyButtonDecline',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    // Quantcast
    '[class*="qc-cmp2"] button[mode="secondary"]',
    '.qc-cmp2-summary-buttons button:first-child',
    // Funding Choices (Google)
    '.fc-cta-do-not-consent',
    '.fc-close',
    // Usercentrics
    '[data-testid="uc-deny-all-button"]',
    // Generic decline/reject buttons
    'button[id*="reject" i]',
    'button[id*="decline" i]',
    'button[id*="deny" i]',
    'button[id*="refuse" i]',
    'a[id*="reject" i]',
    'a[id*="decline" i]',
    'button[class*="reject" i]',
    'button[class*="decline" i]',
    'button[class*="deny" i]',
    'button[class*="refuse" i]',
    'a[class*="reject" i]',
    'a[class*="decline" i]',
    // Aria-label based
    'button[aria-label*="reject" i]',
    'button[aria-label*="decline" i]',
    'button[aria-label*="deny" i]',
    'button[aria-label*="refuse" i]',
    // Data attribute based
    '[data-action="reject"]',
    '[data-action="decline"]',
    '[data-testid*="reject" i]',
    '[data-testid*="decline" i]',
    // Cookie Law Info plugin
    '#cookie_action_close_header_reject',
    // GDPR Cookie Consent plugin
    '.cli-plugin-button.cli-plugin-reject-btn',
    // Sourcepoint
    'button[title="Reject" i]',
    'button[title="Reject All" i]',
    'button[title="Decline" i]',
    'button[title="Decline All" i]',
    // Fallback: necessary-only / essential-only buttons
    'button[id*="necessary" i]',
    'button[class*="necessary" i]',
    'button[id*="essential" i]',
    'button[class*="essential" i]'
  ];

  // Text patterns that indicate a decline/reject action on cookie buttons
  const COOKIE_DECLINE_TEXT_PATTERNS = [
    /\breject\s*(all)?\b/i,
    /\bdecline\s*(all)?\b/i,
    /\bdeny\s*(all)?\b/i,
    /\brefuse\s*(all)?\b/i,
    /\bnecessary\s*only\b/i,
    /\bessential\s*only\b/i,
    /\bonly\s*(necessary|essential|required)\b/i,
    /\breject\s*non-essential\b/i,
    /\b(continue\s*)?without\s*accepting\b/i,
    /\bcontinuer\s*sans\s*accepter\b/i,
    /\bno,?\s*thanks?\b/i,
    /\bdo\s*not\s*(accept|agree|consent)\b/i,
    /\bi\s*do\s*not\s*agree\b/i
  ];

  const COOKIE_BANNER_COMBINED_SELECTOR = COOKIE_BANNER_SELECTORS.join(', ');

  // Preference Center / Settings Button Selectors (Step 1 of 2-step banners)
  const COOKIE_SETTINGS_BUTTON_SELECTORS = [
    '#onetrust-pc-btn-handler',
    '#didomi-notice-learn-more-button',
    '.fc-cta-manage-options',
    '.qc-cmp2-summary-buttons button[mode="secondary"]',
    'button[id*="settings" i]',
    'button[class*="settings" i]',
    'button[id*="manage" i]',
    'button[class*="manage" i]',
    'button[id*="preference" i]',
    'button[class*="preference" i]',
    'button[aria-label*="preference" i]',
    'button[aria-label*="settings" i]',
    'a[id*="settings" i]',
    'a[class*="settings" i]',
    'a[id*="preferences" i]',
    'a[class*="preferences" i]',
    'a[href*="opt-out" i]',
    'a[href*="privacy" i]'
  ];

  const COOKIE_SETTINGS_TEXT_PATTERNS = [
    /\b(settings|preferences|customize|manage\s*(options|preferences|cookies)?|more\s*options)\b/i,
    /\bdo\s*not\s*sell(\s*my\s*(personal\s*)?info(rmation)?)?\b/i,
    /\bopt[- ]?out\b/i
  ];

  // Preference Center Save / Reject Selectors (Step 2 of 2-step banners)
  const COOKIE_SAVE_BUTTON_SELECTORS = [
    '.ot-pc-refuse-all-handler',
    '.save-preference-btn-handler',
    '#onetrust-reject-all-handler',
    '#didomi-consent-popup-actions-disagree',
    '.fc-confirm-choices',
    '.fc-data-preferences-reject-all',
    '.qc-cmp2-footer-btn',
    'button[id*="reject-all" i]',
    'button[class*="reject-all" i]',
    'button[id*="save" i]',
    'button[class*="save" i]',
    'button[id*="confirm" i]',
    'button[class*="confirm" i]'
  ];

  const COOKIE_SAVE_TEXT_PATTERNS = [
    /\b(reject\s*(all)?|disallow\s*(all)?|object\s*(all)?|deselect\s*(all)?|deny\s*(all)?)\b/i,
    /\b(save(\s*&\s*exit)?|save\s*(my\s*)?preferences|confirm\s*(my\s*)?choices|confirm\s*selection|save\s*choices)\b/i
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
          autoDismissCookies = response.autoDismissCookies !== false;

          if (isEnabled && !isWhitelisted && cosmeticFiltering) {
            startCosmeticFilter();
            startVideoAdSkipper();
          }
          if (isEnabled && !isWhitelisted && doomscrollingReminders) {
            startDoomscrollingDetector();
          }

          if (isEnabled && !isWhitelisted && autoDismissCookies) {
            startCookieAutoDismiss();
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
      if (reminderTimer !== null) return;
      lastTickAt = lastInteractionAt = performance.now();
      isViewing = document.visibilityState === 'visible' && document.hasFocus();
      awaySince = isViewing ? null : lastTickAt;
      recordScrollActivity.lastScrollY = window.scrollY;
      window.addEventListener('scroll', recordScrollActivity, { passive: true });
      window.addEventListener('pointerdown', recordActivity, { passive: true });
      window.addEventListener('keydown', recordActivity, { passive: true });
      document.addEventListener('visibilitychange', updateViewingState);
      window.addEventListener('focus', updateViewingState);
      window.addEventListener('blur', updateViewingState);
      window.setInterval(updateActiveTime, 1000);
      const checkInterval = doomscrollingThresholdMinutes === 1 ? 5000 : 30000;
      reminderTimer = window.setInterval(checkForDoomscrolling, checkInterval);
    }

    function updateActiveTime() {
      const now = performance.now();
      // A real break starts a fresh scrolling session, but preserves snoozes.
      if (now - lastInteractionAt >= DOOMSCROLL_SESSION_BREAK ||
          (awaySince !== null && now - awaySince >= DOOMSCROLL_SESSION_BREAK)) {
        activeTimeMs = 0;
        scrollEvents = 0;
        scrollDistance = 0;
        recordScrollActivity.lastScrollY = window.scrollY;
        lastInteractionAt = -Infinity;
        reminderElement?.remove();
        reminderElement = null;
      } else if (isViewing) {
        const activeUntil = Math.min(now, lastInteractionAt + DOOMSCROLL_ACTIVITY_TIMEOUT);
        activeTimeMs += Math.max(0, activeUntil - lastTickAt);
      }
      lastTickAt = now;
    }

    function updateViewingState() {
      // Account for the previous state before reading the new focus/visibility.
      updateActiveTime();
      const viewing = document.visibilityState === 'visible' && document.hasFocus();
      if (isViewing && !viewing) awaySince = performance.now();
      if (viewing) awaySince = null;
      isViewing = viewing;
    }

    function recordActivity() {
      updateActiveTime();
      if (isViewing) lastInteractionAt = performance.now();
    }

    function recordScrollActivity() {
      recordActivity();
      if (!isViewing) return;
      const currentScrollY = window.scrollY;
      const previousScrollY = recordScrollActivity.lastScrollY ?? currentScrollY;
      scrollDistance += Math.abs(currentScrollY - previousScrollY);
      recordScrollActivity.lastScrollY = currentScrollY;
      scrollEvents++;
    }

    function checkForDoomscrolling() {
      updateActiveTime();
      if (!doomscrollingReminders || reminderElement) return;
      const now = Date.now();
      const elapsedMinutes = activeTimeMs / 60000;
      const inactive = !isViewing || performance.now() - lastInteractionAt >= DOOMSCROLL_ACTIVITY_TIMEOUT;
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

    observer.observe(document, {
      childList: true,
      subtree: true
    });
  }

  // Cookie Auto-Dismiss: detect banners and click decline/reject buttons
  function attemptCookieDismiss() {
    if (!isEnabled || isWhitelisted || !autoDismissCookies) return;

    // 1. Check Shadow DOM CMPs (e.g. Usercentrics v2)
    const usercentricsRoot = document.querySelector('#usercentrics-root');
    if (usercentricsRoot && usercentricsRoot.shadowRoot) {
      const ucBtn = usercentricsRoot.shadowRoot.querySelector(
        '[data-testid="uc-deny-all-button"], button[data-testid*="deny" i], button[data-testid*="reject" i]'
      );
      if (ucBtn && !ucBtn.dataset.sbClicked && isElementVisible(ucBtn)) {
        ucBtn.dataset.sbClicked = 'true';
        triggerClick(ucBtn);
        cookieDismissed = true;
        notifyCookieDismissed();
        return;
      }
    }

    // 2. High-confidence CMP-specific buttons safe to check globally
    for (const selector of SPECIFIC_COOKIE_BUTTON_SELECTORS) {
      try {
        const btn = document.querySelector(selector);
        if (btn && !btn.dataset.sbClicked && isElementVisible(btn)) {
          btn.dataset.sbClicked = 'true';
          const parentBanner = btn.closest(COOKIE_BANNER_COMBINED_SELECTOR);
          if (parentBanner) parentBanner.dataset.sbDismissed = 'true';
          triggerClick(btn);
          cookieDismissed = true;
          notifyCookieDismissed();
          setTimeout(hideCookieBanners, 300);
          return;
        }
      } catch {
        // Selector may be invalid on some pages
      }
    }

    // 3. Locate visible cookie banners and evaluate scoped selectors & decline text
    const banners = document.querySelectorAll(COOKIE_BANNER_COMBINED_SELECTOR);
    for (const banner of banners) {
      if (banner.dataset.sbDismissed || !isElementVisible(banner)) continue;

      let bannerHandled = false;
      // Scoped button search inside confirmed banner
      for (const selector of COOKIE_DECLINE_BUTTON_SELECTORS) {
        try {
          const btn = banner.querySelector(selector);
          if (btn && !btn.dataset.sbClicked && isElementVisible(btn)) {
            btn.dataset.sbClicked = 'true';
            banner.dataset.sbDismissed = 'true';
            triggerClick(btn);
            cookieDismissed = true;
            notifyCookieDismissed();
            setTimeout(hideCookieBanners, 300);
            bannerHandled = true;
            break;
          }
        } catch {}
      }
      if (bannerHandled) return;

      // Fallback: scan for buttons/links inside cookie banner whose text matches decline patterns
      const clickables = banner.querySelectorAll('button, a[role="button"], a[href="#"], input[type="button"], input[type="submit"]');
      for (const el of clickables) {
        if (el.dataset.sbClicked) continue;
        const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        if (text && COOKIE_DECLINE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
          el.dataset.sbClicked = 'true';
          banner.dataset.sbDismissed = 'true';
          triggerClick(el);
          cookieDismissed = true;
          notifyCookieDismissed();
          setTimeout(hideCookieBanners, 300);
          return;
        }
      }

      // 4. Two-Step Fallback: If no direct reject button exists on the banner, enter Settings/Options
      if (attemptTwoStepDecline(banner)) {
        return;
      }
    }
  }

  let isNavigatingSettings = false;

  // Handles 2-step banners: enters Settings/Options/Do Not Sell, then confirms/rejects all
  function attemptTwoStepDecline(banner) {
    if (isNavigatingSettings || !banner) return false;

    // Search for a Settings / Preferences / Manage button inside the banner
    let settingsBtn = null;
    for (const selector of COOKIE_SETTINGS_BUTTON_SELECTORS) {
      try {
        const btn = banner.querySelector(selector);
        if (btn && !btn.dataset.sbClicked && isElementVisible(btn)) {
          settingsBtn = btn;
          break;
        }
      } catch {}
    }

    if (!settingsBtn) {
      const clickables = banner.querySelectorAll('button, a[role="button"], a[href], input[type="button"]');
      for (const el of clickables) {
        if (el.dataset.sbClicked) continue;
        const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        if (text && COOKIE_SETTINGS_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
          settingsBtn = el;
          break;
        }
      }
    }

    if (!settingsBtn) return false;

    // Step 1: Open Settings / Preferences modal
    isNavigatingSettings = true;
    settingsBtn.dataset.sbClicked = 'true';
    triggerClick(settingsBtn);

    // Step 2: Handle preference center after it opens
    setTimeout(() => {
      resolvePreferenceCenter(banner);
      isNavigatingSettings = false;
    }, 450);

    return true;
  }

  // Resolves the opened preference center modal (rejects all / confirms minimal choices)
  function resolvePreferenceCenter(originalBanner) {
    const dialogSelectors = [
      '#onetrust-pc-sdk',
      '.ot-pc-container',
      '#didomi-consent-popup',
      '.fc-dialog',
      '.qc-cmp2-container',
      '[role="dialog"]',
      '[aria-modal="true"]',
      COOKIE_BANNER_COMBINED_SELECTOR
    ].join(', ');

    const dialogs = document.querySelectorAll(dialogSelectors);
    let targetModal = null;
    for (const d of dialogs) {
      if (isElementVisible(d)) {
        targetModal = d;
        break;
      }
    }
    if (!targetModal) targetModal = originalBanner || document.body;

    // 1. Look for a "Reject All" / "Object All" / "Disallow All" button in the modal
    for (const selector of COOKIE_SAVE_BUTTON_SELECTORS) {
      try {
        const btn = targetModal.querySelector(selector);
        if (btn && !btn.dataset.sbClicked && isElementVisible(btn)) {
          btn.dataset.sbClicked = 'true';
          if (originalBanner) originalBanner.dataset.sbDismissed = 'true';
          targetModal.dataset.sbDismissed = 'true';
          triggerClick(btn);
          cookieDismissed = true;
          notifyCookieDismissed();
          setTimeout(hideCookieBanners, 400);
          return;
        }
      } catch {}
    }

    // 2. Scan text patterns for Reject All or Save / Confirm Choices
    const clickables = targetModal.querySelectorAll('button, a[role="button"], a[href], input[type="button"], input[type="submit"]');
    for (const el of clickables) {
      if (el.dataset.sbClicked) continue;
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
      if (text && COOKIE_SAVE_TEXT_PATTERNS.some((p) => p.test(text))) {
        el.dataset.sbClicked = 'true';
        if (originalBanner) originalBanner.dataset.sbDismissed = 'true';
        targetModal.dataset.sbDismissed = 'true';
        triggerClick(el);
        cookieDismissed = true;
        notifyCookieDismissed();
        setTimeout(hideCookieBanners, 400);
        return;
      }
    }

    // Fallback: clean up remaining overlays
    if (originalBanner) originalBanner.dataset.sbDismissed = 'true';
    if (targetModal) targetModal.dataset.sbDismissed = 'true';
    cookieDismissed = true;
    notifyCookieDismissed();
    setTimeout(hideCookieBanners, 400);
  }

  // Hide remaining cookie banners after dismissal via CSS and unlock page scrolling
  function hideCookieBanners() {
    if (!isEnabled || isWhitelisted || !autoDismissCookies) return;

    const banners = document.querySelectorAll(COOKIE_BANNER_COMBINED_SELECTOR);
    banners.forEach((banner) => {
      // Only hide banners that were successfully dismissed/clicked
      if (banner.dataset.sbDismissed || banner.querySelector('[data-sb-clicked]')) {
        if (!banner.dataset.sbCookieHidden) {
          banner.dataset.sbCookieHidden = 'true';
          banner.style.setProperty('display', 'none', 'important');
          banner.style.setProperty('visibility', 'hidden', 'important');
        }
      }
    });

    // Restore scrollability if a banner locked body/html overflow
    if (document.body && getComputedStyle(document.body).overflow === 'hidden') {
      document.body.style.setProperty('overflow', 'auto', 'important');
    }
    if (document.documentElement && getComputedStyle(document.documentElement).overflow === 'hidden') {
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
    }
  }

  // Report cookie dismiss to background service worker
  function notifyCookieDismissed() {
    try {
      chrome.runtime.sendMessage({
        action: 'INCREMENT_COOKIES_DISMISSED',
        payload: { count: 1 }
      });
    } catch {
      // Ignored if runtime port disconnected
    }
  }

  // Start cookie auto-dismiss with retry logic for late-loading banners
  function startCookieAutoDismiss() {
    // Attempt immediately
    attemptCookieDismiss();

    // Retry after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        attemptCookieDismiss();
      }, { once: true });
    }

    // Retry a few times with increasing delays for dynamically injected banners
    const retryDelays = [300, 800, 1500, 3000];
    retryDelays.forEach((delay) => {
      setTimeout(() => {
        attemptCookieDismiss();
        hideCookieBanners();
      }, delay);
    });

    // Also observe DOM mutations for late-appearing cookie banners (continuous, debounced)
    let cookieTimeoutId = null;
    const cookieObserver = new MutationObserver(() => {
      if (cookieTimeoutId) return;
      cookieTimeoutId = setTimeout(() => {
        attemptCookieDismiss();
        cookieTimeoutId = null;
      }, 50);
    });

    cookieObserver.observe(document, { childList: true, subtree: true });
  }

  // Initialize
  checkStatusAndInitialize();
})();
