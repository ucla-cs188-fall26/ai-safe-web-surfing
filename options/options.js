/**
 * ShieldBlock - Options & Settings Controller
 * Handles tabs, whitelist management, custom filters, telemetry reset, and backup/import.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Tabs Navigation
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      navTabs.forEach((t) => t.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Overview Elements
  const dashTotalBlocked = document.getElementById('dashTotalBlocked');
  const dashNetworkBlocked = document.getElementById('dashNetworkBlocked');
  const dashCosmeticBlocked = document.getElementById('dashCosmeticBlocked');
  const resetStatsBtn = document.getElementById('resetStatsBtn');

  // Engine toggles
  const settingNetworkEngine = document.getElementById('settingNetworkEngine');
  const settingCosmeticEngine = document.getElementById('settingCosmeticEngine');
  const settingVideoEngine = document.getElementById('settingVideoEngine');

  // Whitelist Elements
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelistBtn');
  const whitelistUl = document.getElementById('whitelistUl');
  const whitelistCount = document.getElementById('whitelistCount');

  // Custom Filters Elements
  const customRuleInput = document.getElementById('customRuleInput');
  const addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
  const customRulesUl = document.getElementById('customRulesUl');
  const customRulesCount = document.getElementById('customRulesCount');

  // Backup Elements
  const exportBtn = document.getElementById('exportBtn');
  const importFileInput = document.getElementById('importFileInput');

  let state = {
    isEnabled: true,
    cosmeticFiltering: true,
    videoSkipper: true,
    whitelistedDomains: [],
    customRules: [],
    stats: { totalBlocked: 0, networkBlocked: 0, cosmeticBlocked: 0 }
  };

  // Load state from chrome.storage
  async function loadState() {
    const data = await chrome.storage.local.get(null);
    state = { ...state, ...data };

    // Update Overview
    dashTotalBlocked.textContent = (state.stats?.totalBlocked || 0).toLocaleString();
    dashNetworkBlocked.textContent = (state.stats?.networkBlocked || 0).toLocaleString();
    dashCosmeticBlocked.textContent = (state.stats?.cosmeticBlocked || 0).toLocaleString();

    settingNetworkEngine.checked = state.isEnabled !== false;
    settingCosmeticEngine.checked = state.cosmeticFiltering !== false;
    settingVideoEngine.checked = state.videoSkipper !== false;

    renderWhitelist();
    renderCustomRules();
  }

  // Render Whitelist
  function renderWhitelist() {
    whitelistUl.innerHTML = '';
    const list = state.whitelistedDomains || [];
    whitelistCount.textContent = list.length;

    if (list.length === 0) {
      whitelistUl.innerHTML = '<li style="color: var(--text-dim); justify-content: center;">No allowlisted domains added yet.</li>';
      return;
    }

    list.forEach((domain) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${escapeHtml(domain)}</span>
        <button class="delete-btn" title="Remove Domain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      li.querySelector('.delete-btn').addEventListener('click', async () => {
        state.whitelistedDomains = state.whitelistedDomains.filter((d) => d !== domain);
        await saveSettings();
        renderWhitelist();
      });

      whitelistUl.appendChild(li);
    });
  }

  // Render Custom Rules
  function renderCustomRules() {
    customRulesUl.innerHTML = '';
    const list = state.customRules || [];
    customRulesCount.textContent = list.length;

    if (list.length === 0) {
      customRulesUl.innerHTML = '<li style="color: var(--text-dim); justify-content: center;">No custom rules added yet.</li>';
      return;
    }

    list.forEach((rule, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span style="font-family: monospace; font-size: 13px;">${escapeHtml(rule)}</span>
        <button class="delete-btn" title="Remove Rule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      li.querySelector('.delete-btn').addEventListener('click', async () => {
        state.customRules.splice(idx, 1);
        await saveSettings();
        renderCustomRules();
      });

      customRulesUl.appendChild(li);
    });
  }

  // Save settings via background worker
  async function saveSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'UPDATE_SETTINGS',
          payload: {
            isEnabled: state.isEnabled,
            cosmeticFiltering: state.cosmeticFiltering,
            videoSkipper: state.videoSkipper,
            whitelistedDomains: state.whitelistedDomains,
            customRules: state.customRules
          }
        },
        resolve
      );
    });
  }

  // Clean domain input
  function cleanDomain(input) {
    let domain = input.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return domain;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Add Whitelist domain
  addWhitelistBtn.addEventListener('click', async () => {
    const domain = cleanDomain(whitelistInput.value);
    if (!domain) return;

    if (!state.whitelistedDomains.includes(domain)) {
      state.whitelistedDomains.push(domain);
      await saveSettings();
      renderWhitelist();
    }
    whitelistInput.value = '';
  });

  whitelistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelistBtn.click();
  });

  // Add Custom Rule
  addCustomRuleBtn.addEventListener('click', async () => {
    const rule = customRuleInput.value.trim();
    if (!rule) return;

    if (!state.customRules.includes(rule)) {
      state.customRules.push(rule);
      await saveSettings();
      renderCustomRules();
    }
    customRuleInput.value = '';
  });

  customRuleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomRuleBtn.click();
  });

  // Protection Toggles
  settingNetworkEngine.addEventListener('change', async () => {
    state.isEnabled = settingNetworkEngine.checked;
    await saveSettings();
  });

  settingCosmeticEngine.addEventListener('change', async () => {
    state.cosmeticFiltering = settingCosmeticEngine.checked;
    await saveSettings();
  });

  settingVideoEngine.addEventListener('change', async () => {
    state.videoSkipper = settingVideoEngine.checked;
    await saveSettings();
  });

  // Reset Stats
  resetStatsBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all blocked ad statistics?')) {
      chrome.runtime.sendMessage({ action: 'RESET_STATS' }, (res) => {
        if (res?.success) {
          dashTotalBlocked.textContent = '0';
          dashNetworkBlocked.textContent = '0';
          dashCosmeticBlocked.textContent = '0';
        }
      });
    }
  });

  // Export JSON
  exportBtn.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `shieldblock-settings-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Import JSON
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (imported && typeof imported === 'object') {
          state.whitelistedDomains = imported.whitelistedDomains || [];
          state.customRules = imported.customRules || [];
          state.isEnabled = imported.isEnabled !== false;
          state.cosmeticFiltering = imported.cosmeticFiltering !== false;
          await saveSettings();
          await loadState();
          alert('Settings successfully imported!');
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  });

  // Initialize
  await loadState();
});
