/**
 * ShieldBlock - Background Service Worker (Manifest V3)
 * Manages declarative net request rules, site allowlists, block statistics, and badge updates.
 */

const DEFAULT_SETTINGS = {
  isEnabled: true,
  cosmeticFiltering: true,
  trackerBlocking: true,
  doomscrollingReminders: true,
  doomscrollingThresholdMinutes: 20,
  doomscrollingCooldownMinutes: 60,
  whitelistedDomains: [],
  customRules: [],
  stats: {
    totalBlocked: 0,
    networkBlocked: 0,
    cosmeticBlocked: 0
  }
};

// In-memory tab statistics: { [tabId]: { network: 0, cosmetic: 0, total: 0 } }
const tabStats = new Map();

// Initialize extension state on install or update
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(null);
  const initialData = { ...DEFAULT_SETTINGS, ...data };
  await chrome.storage.local.set(initialData);
  await syncRulesWithSettings(initialData);
  console.log('[ShieldBlock] Initialized successfully.');
});

// Clean up tab stats when tab is closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStats.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabStats.set(tabId, { network: 0, cosmetic: 0, total: 0 });
    updateTabBadge(tabId, 0);
  }
});

// Update badge count and appearance for a specific tab
function updateTabBadge(tabId, count) {
  if (count <= 0) {
    chrome.action.setBadgeText({ tabId, text: '' });
  } else {
    const text = count > 999 ? '999+' : String(count);
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' }); // Emerald Green
  }
}

// Track blocked network requests in development/unpacked mode
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    const tabId = info.request.tabId;
    if (tabId && tabId !== -1) {
      const current = tabStats.get(tabId) || { network: 0, cosmetic: 0, total: 0 };
      current.network += 1;
      current.total += 1;
      tabStats.set(tabId, current);
      updateTabBadge(tabId, current.total);

      // Increment persistent global stats
      incrementGlobalStats('networkBlocked', 1);
    }
  });
}

// Helper to increment persistent global statistics
async function incrementGlobalStats(key, amount = 1) {
  const { stats = { totalBlocked: 0, networkBlocked: 0, cosmeticBlocked: 0 } } =
    await chrome.storage.local.get('stats');
  stats[key] = (stats[key] || 0) + amount;
  stats.totalBlocked = (stats.totalBlocked || 0) + amount;
  await chrome.storage.local.set({ stats });
}

// Synchronize declarativeNetRequest rules with current user settings & whitelist
async function syncRulesWithSettings(settings) {
  const isEnabled = settings.isEnabled !== false;
  const whitelisted = settings.whitelistedDomains || [];

  // Enable/disable the static ruleset
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: isEnabled ? ['ruleset_1'] : [],
    disableRulesetIds: isEnabled ? [] : ['ruleset_1']
  });

  // Manage dynamic allow rules for whitelisted domains
  // Fetch existing dynamic rules to remove previous allow rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules.map((r) => r.id);

  const newRules = [];
  if (isEnabled && whitelisted.length > 0) {
    whitelisted.forEach((domain, idx) => {
      newRules.push({
        id: 1000 + idx,
        priority: 100, // Higher priority than static block rules
        action: { type: 'allowAllRequests' },
        condition: {
          initiatorDomains: [domain],
          resourceTypes: [
            'main_frame',
            'sub_frame',
            'stylesheet',
            'script',
            'image',
            'font',
            'object',
            'xmlhttprequest',
            'ping',
            'media',
            'websocket',
            'other'
          ]
        }
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIdsToRemove,
    addRules: newRules
  });
}

// Extract hostname cleanly
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Handle messages from content scripts and popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  (async () => {
    switch (action) {
      case 'GET_PAGE_STATUS': {
        const settings = await chrome.storage.local.get(null);
        let tabId = payload?.tabId;
        let url = payload?.url;

        if (!tabId && sender.tab) {
          tabId = sender.tab.id;
          url = sender.tab.url;
        }

        const hostname = url ? getHostname(url) : '';
        const whitelisted = (settings.whitelistedDomains || []).includes(hostname);
        const currentStats = tabStats.get(tabId) || { network: 0, cosmetic: 0, total: 0 };

        sendResponse({
          isEnabled: settings.isEnabled !== false,
          isWhitelisted: whitelisted,
          cosmeticFiltering: settings.cosmeticFiltering !== false,
          doomscrollingReminders: settings.doomscrollingReminders !== false,
          doomscrollingThresholdMinutes: settings.doomscrollingThresholdMinutes || 20,
          doomscrollingCooldownMinutes: settings.doomscrollingCooldownMinutes || 60,
          hostname,
          tabStats: currentStats,
          globalStats: settings.stats || DEFAULT_SETTINGS.stats
        });
        break;
      }

      case 'TOGGLE_GLOBAL': {
        const settings = await chrome.storage.local.get(null);
        const newState = !settings.isEnabled;
        settings.isEnabled = newState;
        await chrome.storage.local.set({ isEnabled: newState });
        await syncRulesWithSettings(settings);
        sendResponse({ success: true, isEnabled: newState });
        break;
      }

      case 'TOGGLE_SITE_WHITELIST': {
        const { hostname } = payload;
        if (!hostname) {
          sendResponse({ success: false, error: 'No hostname provided' });
          return;
        }
        const settings = await chrome.storage.local.get(null);
        let list = settings.whitelistedDomains || [];

        const isWhitelisted = list.includes(hostname);
        if (isWhitelisted) {
          list = list.filter((h) => h !== hostname);
        } else {
          list.push(hostname);
        }

        settings.whitelistedDomains = list;
        await chrome.storage.local.set({ whitelistedDomains: list });
        await syncRulesWithSettings(settings);

        sendResponse({ success: true, isWhitelisted: !isWhitelisted, whitelistedDomains: list });
        break;
      }

      case 'INCREMENT_COSMETIC_BLOCKED': {
        const tabId = sender.tab?.id;
        const count = payload?.count || 1;

        if (tabId && tabId !== -1) {
          const current = tabStats.get(tabId) || { network: 0, cosmetic: 0, total: 0 };
          current.cosmetic += count;
          current.total += count;
          tabStats.set(tabId, current);
          updateTabBadge(tabId, current.total);
          await incrementGlobalStats('cosmeticBlocked', count);
        }
        sendResponse({ success: true });
        break;
      }

      case 'RESET_STATS': {
        const stats = { totalBlocked: 0, networkBlocked: 0, cosmeticBlocked: 0 };
        await chrome.storage.local.set({ stats });
        tabStats.clear();
        sendResponse({ success: true, stats });
        break;
      }

      case 'UPDATE_SETTINGS': {
        const settings = await chrome.storage.local.get(null);
        const updated = { ...settings, ...payload };
        await chrome.storage.local.set(updated);
        await syncRulesWithSettings(updated);
        sendResponse({ success: true, settings: updated });
        break;
      }

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();

  return true; // Keep message channel open for async response
});
