/* Local heuristics only: this score does not assess factual accuracy or reputation. */
(function (root) {
  function scoreWebsite(url, signals) {
    const unavailable = { score: null, reasons: [], coverage: 'unavailable' };
    let parsed;
    try { parsed = new URL(url); } catch { return unavailable; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return unavailable;
    if (!signals || signals.ready !== true || signals.url !== url) return unavailable;

    const reasons = [];
    const deduct = (points, message) => reasons.push({ points, message });
    if (parsed.protocol === 'http:') {
      deduct(25, 'The page uses an unencrypted HTTP connection.');
      if (signals.hasPasswordField === true) deduct(40, 'A password field appears on an HTTP page.');
    }
    if (signals.hasHttpForm === true) deduct(30, 'A form submits to an unencrypted HTTP destination.');
    if (parsed.protocol === 'https:' && signals.hasHttpResource === true) {
      deduct(15, 'The HTTPS page references an HTTP script or iframe.');
    }
    return {
      score: Math.max(0, 100 - reasons.reduce((sum, reason) => sum + reason.points, 0)),
      reasons,
      coverage: 'local-page'
    };
  }
  root.scoreWebsite = scoreWebsite;
  if (typeof module !== 'undefined') module.exports = { scoreWebsite };
})(globalThis);
