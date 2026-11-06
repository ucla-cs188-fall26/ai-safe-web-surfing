const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreWebsite } = require('../website-score');
const fs = require('node:fs');
const vm = require('node:vm');

const scan = (url, extra = {}) => ({ url, ready: true, ...extra });

test('HTTPS without detected risks scores 100 with limited coverage', () => {
  assert.deepEqual(scoreWebsite('https://example.com/', scan('https://example.com/')), {
    score: 100, reasons: [], coverage: 'local-page'
  });
});

test('penalties combine once per category and stay within bounds', () => {
  const url = 'http://example.com/';
  const result = scoreWebsite(url, scan(url, { hasPasswordField: true, hasHttpForm: true }));
  assert.equal(result.score, 5);
  assert.deepEqual(result.reasons.map((r) => r.points), [25, 40, 30]);
  assert.equal(scoreWebsite(url, scan(url)).score, 75);
});

test('HTTPS passwords are not penalized; HTTP resource and form references are', () => {
  const url = 'https://example.com/';
  assert.equal(scoreWebsite(url, scan(url, { hasPasswordField: true })).score, 100);
  assert.equal(scoreWebsite(url, scan(url, { hasHttpResource: true, hasHttpForm: true })).score, 55);
});

test('unsupported URLs, incomplete scans, and mismatched navigation are unavailable', () => {
  for (const url of ['chrome://settings/', 'file:///tmp/test.html', 'invalid']) {
    assert.equal(scoreWebsite(url, scan(url)).score, null);
  }
  const url = 'https://example.com/';
  for (const signals of [null, { url, ready: false }, scan('https://other.example/')]) {
    assert.equal(scoreWebsite(url, signals).score, null);
  }
});

test('ad counts and protection preferences never affect the score', () => {
  const url = 'https://example.com/';
  assert.equal(scoreWebsite(url, scan(url, {
    networkBlocked: 500, cosmeticBlocked: 100, isEnabled: false, isWhitelisted: true
  })).score, 100);
});

test('worker rejects navigation changes and unavailable content scripts', async () => {
  let listener;
  let activeUrl = 'https://example.com/';
  let fail = false;
  const event = { addListener() {} };
  const chrome = {
    runtime: { onInstalled: event, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: {
      onRemoved: event, onUpdated: event,
      async sendMessage() { if (fail) throw new Error('No receiver'); return scan('https://example.com/'); },
      async get() { return { url: activeUrl, status: 'complete' }; }
    },
    storage: { local: { async get() { return {}; } } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), {
    chrome, importScripts() {}, scoreWebsite, URL, console
  });
  const request = () => new Promise((resolve) => listener({
    action: 'GET_PAGE_STATUS', payload: { tabId: 1, url: 'https://example.com/' }
  }, {}, resolve));
  assert.equal((await request()).safety.score, 100);
  activeUrl = 'https://other.example/';
  assert.equal((await request()).safety.score, null);
  fail = true;
  assert.equal((await request()).safety.score, null);
});
