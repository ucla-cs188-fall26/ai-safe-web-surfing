const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const contentJsPath = path.join(rootDir, 'content.js');
const backgroundJsPath = path.join(rootDir, 'background.js');
const popupHtmlPath = path.join(rootDir, 'popup', 'popup.html');
const optionsHtmlPath = path.join(rootDir, 'options', 'options.html');

describe('Cookie Auto-Decline Feature Tests', () => {
  const contentJs = fs.readFileSync(contentJsPath, 'utf-8');
  const backgroundJs = fs.readFileSync(backgroundJsPath, 'utf-8');
  const popupHtml = fs.readFileSync(popupHtmlPath, 'utf-8');
  const optionsHtml = fs.readFileSync(optionsHtmlPath, 'utf-8');

  test('background.js initializes autoDismissCookies and cookiesDismissed stats', () => {
    assert.ok(backgroundJs.includes('autoDismissCookies: true'), 'DEFAULT_SETTINGS must have autoDismissCookies: true');
    assert.ok(backgroundJs.includes('cookiesDismissed: 0'), 'DEFAULT_SETTINGS stats must track cookiesDismissed');
    assert.ok(backgroundJs.includes('INCREMENT_COOKIES_DISMISSED'), 'Must handle INCREMENT_COOKIES_DISMISSED action');
  });

  test('content.js contains valid cookie banner and decline button selectors', () => {
    // Banner selectors
    const bannerMatch = contentJs.match(/const\s+COOKIE_BANNER_SELECTORS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(bannerMatch, 'COOKIE_BANNER_SELECTORS array must be in content.js');
    const bannerSelectors = bannerMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);
    assert.ok(bannerSelectors.length >= 10, 'Must have at least 10 cookie banner selectors');

    // Button selectors
    const buttonMatch = contentJs.match(/const\s+COOKIE_DECLINE_BUTTON_SELECTORS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(buttonMatch, 'COOKIE_DECLINE_BUTTON_SELECTORS array must be in content.js');
    const buttonSelectors = buttonMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);
    assert.ok(buttonSelectors.length >= 10, 'Must have at least 10 decline button selectors');

    // Verify selector brackets balance
    [...bannerSelectors, ...buttonSelectors].forEach((sel) => {
      const openBrackets = (sel.match(/\[/g) || []).length;
      const closeBrackets = (sel.match(/\]/g) || []).length;
      assert.strictEqual(openBrackets, closeBrackets, `Unbalanced brackets in selector: ${sel}`);
    });
  });

  test('content.js implements cookie auto-dismiss functions and retry logic', () => {
    assert.ok(contentJs.includes('attemptCookieDismiss'), 'Must define attemptCookieDismiss');
    assert.ok(contentJs.includes('startCookieAutoDismiss'), 'Must define startCookieAutoDismiss');
    assert.ok(contentJs.includes('COOKIE_DECLINE_TEXT_PATTERNS'), 'Must define regex patterns for decline text');
  });

  test('popup.html and options.html provide user toggle controls for cookie declining', () => {
    assert.ok(popupHtml.includes('id="cookieToggle"'), 'Popup must have cookieToggle input');
    assert.ok(optionsHtml.includes('id="settingCookieEngine"'), 'Options must have settingCookieEngine input');
    assert.ok(optionsHtml.includes('id="dashCookiesDismissed"'), 'Options must display cookies dismissed count');
  });

  test('options.js binds cookie UI controls and storage', () => {
    const optionsJsPath = path.join(rootDir, 'options', 'options.js');
    const optionsJs = fs.readFileSync(optionsJsPath, 'utf-8');
    assert.ok(optionsJs.includes('dashCookiesDismissed'), 'options.js must reference dashCookiesDismissed');
    assert.ok(optionsJs.includes('settingCookieEngine'), 'options.js must reference settingCookieEngine');
    assert.ok(optionsJs.includes('autoDismissCookies'), 'options.js must track autoDismissCookies');
  });

  test('content.js protects against document-wide false positive clicks and checks visibility', () => {
    assert.ok(contentJs.includes('SPECIFIC_COOKIE_BUTTON_SELECTORS'), 'content.js must define SPECIFIC_COOKIE_BUTTON_SELECTORS');
    assert.ok(contentJs.includes('isElementVisible'), 'content.js must define isElementVisible helper');
    assert.ok(contentJs.includes('usercentricsRoot'), 'content.js must support shadow DOM CMPs like usercentrics');
  });

  test('manifest.json runs content script in all frames for iframe-based CMPs', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf-8'));
    const cs = manifest.content_scripts[0];
    assert.strictEqual(cs.all_frames, true, 'content_scripts must have all_frames: true to handle iframe cookie banners');
  });
});
