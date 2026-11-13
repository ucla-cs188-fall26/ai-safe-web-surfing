const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { shouldWarnWebsite } = require('../safety-warning');
const { scoreWebsite } = require('../website-score');

test('warning threshold is strictly below 70; missing scores never warn', () => {
  for (const score of [0, 35, 69]) assert.equal(shouldWarnWebsite({ score }), true);
  for (const score of [70, 75, 100, null, undefined, NaN]) {
    assert.equal(shouldWarnWebsite({ score }), false);
  }
  assert.equal(shouldWarnWebsite(null), false);
});

test('HTTP password page warns; plain HTTP and mixed form at 70 do not', () => {
  const assess = (url, extra) => scoreWebsite(url, { url, ready: true, ...extra });
  assert.equal(shouldWarnWebsite(assess('http://example.com/', { hasPasswordField: true })), true);
  assert.equal(shouldWarnWebsite(assess('http://example.com/', {})), false);
  assert.equal(shouldWarnWebsite(assess('https://example.com/', { hasHttpForm: true })), false);
});

test('warning renders reasons as text and provides a dismiss action without stealing focus', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.style = { setProperty() {} }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...elements) { this.children.push(...elements); }
    appendChild(element) { this.children.push(element); }
    attachShadow() { this.shadow = new Element('shadow'); return this.shadow; }
    addEventListener(name, fn) { this[name] = fn; }
  }
  const context = { document: { createElement: (tag) => new Element(tag) }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../safety-warning'), 'utf8'), context);
  let dismissed = false;
  const host = context.module.exports.createSafetyWarning({ score: 35, reasons: [{ message: '<unsafe>' }] }, () => { dismissed = true; });
  const card = host.shadow.children[1];
  assert.equal(card.attributes.role, 'alert');
  assert.match(card.children[1].textContent, /35\/100/);
  assert.equal(card.children[2].children[0].textContent, '<unsafe>');
  card.children.at(-1).click();
  assert.equal(dismissed, true);
});
