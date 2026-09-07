import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('THEME configuration contains obsidian neo-fintech tokens', () => {
  const configContent = fs.readFileSync('mobile/src/config.ts', 'utf8');
  assert.ok(configContent.includes('#080B11'), 'Must include obsidian background');
  assert.ok(configContent.includes('#0E131F'), 'Must include titanium card surface');
  assert.ok(configContent.includes('#10B981'), 'Must include emerald green');
  assert.ok(configContent.includes('#3B82F6'), 'Must include sapphire blue');
  assert.ok(configContent.includes('TELEPOINT_BRAND'), 'Must include brand constants');
  assert.ok(configContent.includes('SPRING_CONFIG'), 'Must include fluid spring animation config');
});
