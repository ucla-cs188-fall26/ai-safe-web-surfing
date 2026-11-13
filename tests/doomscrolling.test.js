const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const contentCode = fs.readFileSync(path.join(rootDir, 'content.js'), 'utf-8');
const optionsHtml = fs.readFileSync(path.join(rootDir, 'options', 'options.html'), 'utf-8');
const optionsCode = fs.readFileSync(path.join(rootDir, 'options', 'options.js'), 'utf-8');

describe('Doomscrolling reminder', () => {
  test('uses time, scroll count, distance, inactivity, and cooldown signals', () => {
    assert.match(contentCode, /DOOMSCROLL_MIN_SCROLL_EVENTS/);
    assert.match(contentCode, /DOOMSCROLL_MIN_DISTANCE/);
    assert.match(contentCode, /DOOMSCROLL_ACTIVITY_TIMEOUT/);
    assert.match(contentCode, /DOOMSCROLL_TEST_SCROLL_EVENTS/);
    assert.match(contentCode, /doomscrollingThresholdMinutes === 1/);
    assert.match(contentCode, /doomscrollingCooldownMinutes/);
    assert.match(contentCode, /nextReminderAt/);
    assert.match(contentCode, /action === 'later'/);
    assert.match(contentCode, /isTestMode\s*\n?\s*\?\s*0\.25/);
    assert.match(contentCode, /showDoomscrollingReminder/);
  });

  test('provides a user-controlled reminder setting and threshold', () => {
    assert.match(optionsHtml, /id="settingDoomscrolling"/);
    assert.match(optionsHtml, /id="doomscrollingThreshold"/);
    assert.match(optionsHtml, /value="1">1 minute \(temporary test\)/);
    assert.match(optionsCode, /doomscrollingReminders/);
    assert.match(optionsCode, /doomscrollingThresholdMinutes/);
  });
});
