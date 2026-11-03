const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cssPath = path.resolve(__dirname, '..', 'content.css');
const jsPath = path.resolve(__dirname, '..', 'content.js');

describe('Cosmetic Filtering & Selector Integrity Tests', () => {
  test('content.css exists and has non-empty rules', () => {
    assert.ok(fs.existsSync(cssPath), 'content.css must exist');
    const css = fs.readFileSync(cssPath, 'utf-8');
    assert.ok(css.length > 50, 'content.css must contain rules');
    assert.ok(css.includes('display: none !important'), 'content.css must hide targeted elements');
  });

  test('content.js selectors are syntactically valid', () => {
    assert.ok(fs.existsSync(jsPath), 'content.js must exist');
    const js = fs.readFileSync(jsPath, 'utf-8');

    // Extract AD_SELECTORS array from content.js
    const match = js.match(/const\s+AD_SELECTORS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'AD_SELECTORS array must be present in content.js');

    // Parse selector strings
    const rawSelectors = match[1];
    const selectors = rawSelectors
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);

    assert.ok(selectors.length >= 10, 'Must have at least 10 cosmetic selectors');

    // Check basic selector syntax rules
    selectors.forEach((sel) => {
      assert.ok(sel.length > 0, 'Selector string must not be empty');
      assert.ok(!sel.includes('undefined') && !sel.includes('null'), `Malformed selector: ${sel}`);
      // Check balanced brackets
      const openBrackets = (sel.match(/\[/g) || []).length;
      const closeBrackets = (sel.match(/\]/g) || []).length;
      assert.strictEqual(openBrackets, closeBrackets, `Unbalanced brackets in selector: ${sel}`);
    });
  });
});
