const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../package.json');

test('extension entrypoint and Activity Bar icon exist', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, manifest.main)));
  for (const container of manifest.contributes.viewsContainers.activitybar) {
    assert.ok(fs.existsSync(path.join(root, container.icon)));
    assert.ok(manifest.contributes.views[container.id].length);
  }
});

test('sidebar activation and refresh contributions match implemented commands', () => {
  assert.ok(manifest.activationEvents.includes('onView:wordpressDebugging.files'));
  const commands = manifest.contributes.commands.map((command) => command.command);
  assert.ok(commands.includes('wordpressDebugging.openFile'));
  for (const action of manifest.contributes.menus['view/title']) {
    assert.ok(commands.includes(action.command));
    assert.equal(action.when, 'view == wordpressDebugging.files');
  }
});
