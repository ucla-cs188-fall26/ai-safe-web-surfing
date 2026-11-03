/**
 * Fast zero-dependency syntax linter for JavaScript and JSON files
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_FILES = [
  'background.js',
  'content.js',
  'popup/popup.js',
  'options/options.js'
];

const JSON_FILES = [
  'manifest.json',
  'rules.json',
  'package.json'
];

let hasErrors = false;

console.log('🔍 Checking JavaScript Syntax...');
JS_FILES.forEach((file) => {
  const filePath = path.resolve(__dirname, '..', file);
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    new vm.Script(code);
    console.log(`  ✓ ${file} syntax valid`);
  } catch (err) {
    console.error(`  ✗ Syntax error in ${file}:`, err.message);
    hasErrors = true;
  }
});

console.log('\n🔍 Validating JSON files...');
JSON_FILES.forEach((file) => {
  const filePath = path.resolve(__dirname, '..', file);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    console.log(`  ✓ ${file} valid JSON`);
  } catch (err) {
    console.error(`  ✗ JSON parse error in ${file}:`, err.message);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error('\n❌ Linting failed with errors.');
  process.exit(1);
} else {
  console.log('\n✅ All syntax checks passed successfully!');
}
