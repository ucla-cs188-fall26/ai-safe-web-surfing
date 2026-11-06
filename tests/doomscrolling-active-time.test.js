const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function detector(threshold = 1) {
  let time = 0;
  let focused = true;
  const listeners = {};
  const timers = new Map();
  const cards = [];
  const document = {
    visibilityState: 'visible', hasFocus: () => focused,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    createElement: () => ({ setAttribute() {}, addEventListener(name, fn) { this[name] = fn; },
      remove() { this.removed = true; } }),
    body: { appendChild: (el) => cards.push(el) }
  };
  const window = {
    location: { href: 'https://example.com/' }, scrollY: 0,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    setInterval: (fn, delay) => { timers.set(delay, fn); return timers.size; },
    setTimeout() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../content.js'), 'utf8'), {
    window, document, performance: { now: () => time }, Date: { now: () => time },
    chrome: { runtime: { sendMessage(message, callback) {
      callback({ isEnabled: true, cosmeticFiltering: false, doomscrollingThresholdMinutes: threshold });
    } } }
  });
  return {
    cards,
    advance(ms) { time += ms; timers.get(1000)(); },
    check() { timers.get(threshold === 1 ? 5000 : 30000)(); },
    scroll() { window.scrollY += 150; listeners.scroll(); },
    input() { listeners.pointerdown(); },
    view(visible, focus = visible) {
      document.visibilityState = visible ? 'visible' : 'hidden';
      focused = focus;
      listeners.visibilitychange();
      listeners[focus ? 'focus' : 'blur']();
    },
    seed() { for (let i = 0; i < 5; i++) this.scroll(); }
  };
}

test('continuous foreground activity qualifies after one active minute', () => {
  const d = detector();
  d.seed();
  d.advance(59000); d.check(); assert.equal(d.cards.length, 0);
  d.advance(1000); d.check(); assert.equal(d.cards.length, 1);
});

test('hidden and unfocused time are excluded, including return transitions', () => {
  for (const visible of [false, true]) {
    const d = detector(); d.seed(); d.advance(20000);
    d.view(visible, false); d.advance(60000);
    d.view(true); d.input(); d.check(); assert.equal(d.cards.length, 0);
    d.advance(40000); d.check(); assert.equal(d.cards.length, 1);
  }
});

test('idle gaps do not become active time when input resumes', () => {
  const d = detector(3);
  for (let i = 0; i < 40; i++) d.scroll();
  d.advance(240000); d.input(); d.check();
  assert.equal(d.cards.length, 0); // Only two minutes counted before idle cutoff.
  d.advance(60000); d.check(); assert.equal(d.cards.length, 1);
});

test('five-minute inactivity resets time and scroll totals', () => {
  const d = detector(); d.seed(); d.advance(300000); d.input(); d.check();
  assert.equal(d.cards.length, 0);
  d.advance(60000); d.check(); assert.equal(d.cards.length, 0);
  d.seed(); d.check(); assert.equal(d.cards.length, 1);
});

test('session reset preserves a dismissed reminder cooldown', () => {
  const d = detector(2);
  for (let i = 0; i < 40; i++) d.scroll();
  d.advance(60000); d.input(); d.advance(60000); d.check();
  assert.equal(d.cards.length, 1);
  d.cards[0].click({ target: { closest: () => ({ dataset: { action: 'dismiss' } }) } });
  d.advance(300000);
  for (let i = 0; i < 40; i++) d.scroll();
  d.advance(60000); d.input(); d.advance(60000);
  d.check(); assert.equal(d.cards.length, 1);
});
