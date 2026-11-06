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

  let isEnabled = true;
  let isWhitelisted = false;
  let cosmeticFiltering = true;
  let blockedCount = 0;
  let observer = null;

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

          if (isEnabled && !isWhitelisted && cosmeticFiltering) {
            startCosmeticFilter();
            startVideoAdSkipper();
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

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize
  checkStatusAndInitialize();
})();
