const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rulesPath = path.resolve(__dirname, '..', 'rules.json');

describe('Declarative Net Request (DNR) Ruleset Tests', () => {
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

  test('Ruleset is a non-empty array', () => {
    assert.ok(Array.isArray(rules), 'rules.json must be a JSON array');
    assert.ok(rules.length >= 10, 'Must have at least 10 rules for baseline protection');
  });

  test('All rule IDs are unique positive integers', () => {
    const seenIds = new Set();
    rules.forEach((rule, idx) => {
      assert.ok(Number.isInteger(rule.id), `Rule at index ${idx} must have integer id`);
      assert.ok(rule.id > 0, `Rule ID ${rule.id} must be strictly positive`);
      assert.ok(!seenIds.has(rule.id), `Duplicate rule ID found: ${rule.id}`);
      seenIds.add(rule.id);
    });
  });

  test('All rules have valid actions', () => {
    const validActions = new Set(['block', 'allow', 'allowAllRequests', 'upgradeScheme', 'redirect']);
    rules.forEach((rule) => {
      assert.ok(rule.action, `Rule ${rule.id} must have action`);
      assert.ok(validActions.has(rule.action.type), `Rule ${rule.id} has invalid action type: ${rule.action.type}`);
    });
  });

  test('All rules have valid condition with urlFilter or regexFilter', () => {
    rules.forEach((rule) => {
      assert.ok(rule.condition, `Rule ${rule.id} must have condition`);
      assert.ok(
        rule.condition.urlFilter || rule.condition.regexFilter,
        `Rule ${rule.id} condition must specify urlFilter or regexFilter`
      );

      if (rule.condition.resourceTypes) {
        assert.ok(Array.isArray(rule.condition.resourceTypes), `resourceTypes for rule ${rule.id} must be an array`);
        const validResources = new Set([
          'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
          'font', 'object', 'xmlhttprequest', 'ping', 'media',
          'websocket', 'webtransport', 'webbundle', 'other'
        ]);
        rule.condition.resourceTypes.forEach((rt) => {
          assert.ok(validResources.has(rt), `Invalid resourceType "${rt}" in rule ${rule.id}`);
        });
      }
    });
  });

  test('High-profile ad networks are covered in ruleset', () => {
    const filters = rules.map((r) => r.condition.urlFilter || '').join(' ');
    assert.ok(filters.includes('doubleclick.net'), 'Must block doubleclick.net');
    assert.ok(filters.includes('googlesyndication.com'), 'Must block googlesyndication.com');
    assert.ok(filters.includes('adnxs.com'), 'Must block adnxs.com');
    assert.ok(filters.includes('criteo.com'), 'Must block criteo.com');
  });
});
