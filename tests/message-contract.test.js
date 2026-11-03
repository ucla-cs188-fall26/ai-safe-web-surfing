const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backgroundCode = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf-8');
const contentCode = fs.readFileSync(path.join(rootDir, 'content.js'), 'utf-8');
const popupCode = fs.readFileSync(path.join(rootDir, 'popup', 'popup.js'), 'utf-8');
const optionsCode = fs.readFileSync(path.join(rootDir, 'options', 'options.js'), 'utf-8');

describe('Message Passing Contract & Action Synchronization Tests', () => {
  // Extract handled cases in background.js
  const caseMatches = backgroundCode.match(/case\s+'([A-Z_]+)':/g) || [];
  const handledActions = new Set(caseMatches.map((c) => c.replace(/case\s+'|':/g, '')));

  test('Background worker handles standard life-cycle message actions', () => {
    const requiredActions = [
      'GET_PAGE_STATUS',
      'TOGGLE_GLOBAL',
      'TOGGLE_SITE_WHITELIST',
      'INCREMENT_COSMETIC_BLOCKED',
      'RESET_STATS',
      'UPDATE_SETTINGS'
    ];

    requiredActions.forEach((act) => {
      assert.ok(handledActions.has(act), `Background service worker must handle action: ${act}`);
    });
  });

  test('All frontend sendMessage calls map to a handled action', () => {
    const combinedFrontend = `${contentCode}\n${popupCode}\n${optionsCode}`;
    const sentMatches = combinedFrontend.match(/action:\s*'([A-Z_]+)'/g) || [];
    const sentActions = [...new Set(sentMatches.map((s) => s.replace(/action:\s*'|'/g, '')))];

    assert.ok(sentActions.length > 0, 'Frontend should send message actions');

    sentActions.forEach((action) => {
      assert.ok(
        handledActions.has(action),
        `Action "${action}" is sent by UI/content scripts but has no corresponding case in background.js`
      );
    });
  });
});
