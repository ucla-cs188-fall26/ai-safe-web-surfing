const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

describe('Manifest V3 Specification Tests', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  test('Manifest version must be 3', () => {
    assert.strictEqual(manifest.manifest_version, 3, 'Extension must use Manifest V3');
  });

  test('Has valid basic metadata (name, version, description)', () => {
    assert.ok(typeof manifest.name === 'string' && manifest.name.length > 0, 'Name must be non-empty');
    assert.ok(typeof manifest.version === 'string' && /^\d+\.\d+(\.\d+)?$/.test(manifest.version), 'Version must be semver formatted');
    assert.ok(typeof manifest.description === 'string' && manifest.description.length > 0, 'Description must be non-empty');
  });

  test('Background service worker is configured and exists', () => {
    assert.ok(manifest.background, 'Background property must exist');
    assert.ok(manifest.background.service_worker, 'service_worker must be defined');
    const swPath = path.join(rootDir, manifest.background.service_worker);
    assert.ok(fs.existsSync(swPath), `Service worker file ${swPath} must exist`);
  });

  test('Content scripts are configured and referenced files exist', () => {
    assert.ok(Array.isArray(manifest.content_scripts), 'content_scripts must be an array');
    assert.ok(manifest.content_scripts.length > 0, 'Must have at least one content script');

    for (const cs of manifest.content_scripts) {
      assert.ok(Array.isArray(cs.matches), 'Content script matches must be array');
      if (cs.js) {
        for (const jsFile of cs.js) {
          assert.ok(fs.existsSync(path.join(rootDir, jsFile)), `Content script JS ${jsFile} must exist`);
        }
      }
      if (cs.css) {
        for (const cssFile of cs.css) {
          assert.ok(fs.existsSync(path.join(rootDir, cssFile)), `Content script CSS ${cssFile} must exist`);
        }
      }
    }
  });

  test('Declarative Net Request ruleset is configured and file exists', () => {
    assert.ok(manifest.declarative_net_request, 'declarative_net_request property must exist');
    assert.ok(Array.isArray(manifest.declarative_net_request.rule_resources), 'rule_resources must be array');
    
    for (const res of manifest.declarative_net_request.rule_resources) {
      assert.ok(res.id, 'Ruleset ID must be present');
      assert.ok(res.path, 'Ruleset path must be present');
      assert.ok(fs.existsSync(path.join(rootDir, res.path)), `Ruleset file ${res.path} must exist`);
    }
  });

  test('Action popup and icons exist', () => {
    assert.ok(manifest.action, 'Action property must exist');
    assert.ok(manifest.action.default_popup, 'default_popup must be defined');
    assert.ok(fs.existsSync(path.join(rootDir, manifest.action.default_popup)), 'Popup HTML must exist');

    if (manifest.icons) {
      for (const [size, iconPath] of Object.entries(manifest.icons)) {
        const fullIconPath = path.join(rootDir, iconPath);
        assert.ok(fs.existsSync(fullIconPath), `Icon (${size}) at ${fullIconPath} must exist`);
        const stats = fs.statSync(fullIconPath);
        assert.ok(stats.size > 0, `Icon (${size}) file must not be empty`);
      }
    }
  });

  test('Contains required permissions', () => {
    const permissions = manifest.permissions || [];
    assert.ok(permissions.includes('declarativeNetRequest'), 'Requires declarativeNetRequest');
    assert.ok(permissions.includes('storage'), 'Requires storage permission');
  });
});
