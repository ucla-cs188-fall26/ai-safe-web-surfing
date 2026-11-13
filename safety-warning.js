/* A non-modal, dismissible warning. Shadow DOM isolates it from page styling. */
function shouldWarnWebsite(safety) {
  return Number.isFinite(safety?.score) && safety.score < 70;
}

function createSafetyWarning(safety, onDismiss) {
  const host = document.createElement('div');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('top', '16px', 'important');
  host.style.setProperty('right', '16px', 'important');
  host.style.setProperty('width', 'min(380px, calc(100vw - 32px))', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    section { box-sizing: border-box; padding: 20px; background: #21190b; color: #fff7ed;
      border: 2px solid #fbbf24; border-radius: 12px; box-shadow: 0 8px 32px #0008;
      font: 14px/1.5 system-ui, sans-serif; max-height: calc(100vh - 32px); overflow: auto; }
    h2 { margin: 0 0 10px; font-size: 19px; } p { margin: 10px 0; }
    ul { padding-left: 20px; } li { margin: 6px 0; }
    button { font: inherit; font-weight: 700; background: #fbbf24; color: #21190b;
      border: 0; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
    button:focus-visible { outline: 3px solid white; outline-offset: 3px; }
    small { display: block; margin: 12px 0; color: #fde4c4; }
  `;
  const card = document.createElement('section');
  card.setAttribute('role', 'alert');
  card.setAttribute('aria-label', 'ShieldBlock safety warning');
  const title = document.createElement('h2');
  title.textContent = 'ShieldBlock: Potential dangers detected';
  const score = document.createElement('p');
  score.textContent = `Local safety score: ${safety.score}/100 (below 70)`;
  const reasons = document.createElement('ul');
  for (const reason of safety.reasons) {
    const item = document.createElement('li');
    item.textContent = reason.message;
    reasons.appendChild(item);
  }
  const advice = document.createElement('p');
  advice.textContent = 'Avoid entering passwords or personal information while these risks are present.';
  const coverage = document.createElement('small');
  coverage.textContent = 'Based on local connection and form checks. Content reliability is not assessed.';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss warning';
  dismiss.addEventListener('click', onDismiss);
  card.append(title, score, reasons, advice, coverage, dismiss);
  shadow.append(style, card);
  return host;
}

if (typeof module !== 'undefined') module.exports = { shouldWarnWebsite, createSafetyWarning };
