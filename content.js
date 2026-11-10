/**
 * ShieldBlock - Dynamic Content Script
 * Handles DOM element inspection, dynamic cosmetic filtering, video ad skipping,
 * and reports blocked counts to the background service worker.
 */

(() => {
  // Prevent duplicate execution
  if (window.__shieldBlockInjected) return;
  window.__shieldBlockInjected = true;

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
          autoDismissCookies = response.autoDismissCookies !== false;

          if (isEnabled && !isWhitelisted && cosmeticFiltering) {
            startCosmeticFilter();
            startVideoAdSkipper();
          }

          if (isEnabled && !isWhitelisted && autoDismissCookies) {
            startCookieAutoDismiss();
          }
        }
      );
    } catch {
      // Context invalidated or extension reloaded
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
    }
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
