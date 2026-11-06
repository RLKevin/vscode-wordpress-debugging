const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const wordpress = require('../src/wordpress');

class Uri {
  constructor(path) { this.path = path; }
  with({ path }) { return new Uri(path); }
  get fsPath() { return this.path; }
}

function setup(entries = {}, folders = []) {
  const commands = new Map();
  const errors = [];
  const opened = [];
  const shown = [];
  let provider;
  let folderChanged;
  const disposable = { dispose() {} };
  const vscode = {
    Uri,
    FileType: { File: 1, Directory: 2 },
    TreeItemCollapsibleState: { Expanded: 2 },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    EventEmitter: class {
      constructor() { this.event = () => disposable; this.count = 0; }
      fire() { this.count++; }
      dispose() {}
    },
    workspace: {
      workspaceFolders: folders.map((folder) => ({ name: path.basename(folder), uri: new Uri(folder) })),
      fs: {
        async stat(uri) {
          const entry = entries[uri.path];
          if (entry instanceof Error) { throw entry; }
          if (!entry) { throw Object.assign(new Error('Missing'), { code: 'FileNotFound' }); }
          return { type: entry };
        }
      },
      onDidChangeWorkspaceFolders(callback) { folderChanged = callback; return disposable; },
      async openTextDocument(uri) { opened.push(uri.path); return { uri }; }
    },
    window: {
      registerTreeDataProvider(id, value) {
        assert.equal(id, 'wordpressDebugging.files');
        provider = value;
        return disposable;
      },
      showErrorMessage(message) { errors.push(message); },
      async showTextDocument(document, options) { shown.push({ document, options }); }
    },
    commands: {
      registerCommand(id, callback) { commands.set(id, callback); return disposable; }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8'),
    {
      module,
      require(name) {
        if (name === 'vscode') { return vscode; }
        if (name === './wordpress') { return wordpress; }
        throw new Error(`Unexpected import: ${name}`);
      }
    }
  );
  const context = { subscriptions: [] };
  module.exports.activate(context);
  return { provider, commands, errors, opened, shown, folderChanged, context };
}

test('sidebar exposes both files and opens each exact URI without preview', async () => {
  const app = setup({
    '/site/wp-content': 2,
    '/site/wp-config.php': 1,
    '/site/wp-content/debug.log': 1
  }, ['/site/wp-content/themes/theme']);
  const roots = await app.provider.getChildren();
  const files = await app.provider.getChildren(roots[0]);
  assert.deepEqual(Array.from(files, (item) => item.label), ['wp-config.php', 'wp-content/debug.log']);
  for (const file of files) {
    assert.equal(file.description, undefined);
    await app.commands.get(file.command.command)(...file.command.arguments);
    assert.equal((await app.provider.getChildren(file)).length, 0);
  }
  assert.deepEqual(app.opened, ['/site/wp-config.php', '/site/wp-content/debug.log']);
  assert.ok(app.shown.every((call) => call.options.preview === false));
  assert.deepEqual(app.errors, []);
});

test('missing files and directories report errors without opening or creating files', async () => {
  const app = setup({ '/site/wp-content': 2, '/site/wp-config.php': 2 }, ['/site']);
  const [root] = await app.provider.getChildren();
  const files = await app.provider.getChildren(root);
  for (const file of files) {
    assert.equal(file.description, 'not found');
    await app.commands.get(file.command.command)(...file.command.arguments);
  }
  assert.equal(app.errors.length, 2);
  assert.ok(app.errors.every((message) => message.includes('No file was created')));
  assert.deepEqual(app.opened, []);
});

test('empty and standalone workspaces show explanatory messages', async () => {
  const empty = setup();
  assert.match((await empty.provider.getChildren())[0].label, /Open a WordPress theme/);
  const standalone = setup({}, ['/theme']);
  assert.match((await standalone.provider.getChildren())[0].label, /installation not found/);
});

test('multiple workspace folders resolve independently', async () => {
  const app = setup({ '/a/wp-content': 2, '/b/wp-content': 2 }, [
    '/a/wp-content/themes/one', '/b/wp-content/themes/two'
  ]);
  const roots = await app.provider.getChildren();
  assert.deepEqual(Array.from(roots, (root) => root.root.path), ['/a', '/b']);
});

test('refresh and workspace changes invalidate sidebar data', () => {
  const app = setup();
  app.commands.get('wordpressDebugging.refresh')();
  app.folderChanged();
  assert.equal(app.provider.changed.count, 2);
  for (const subscription of app.context.subscriptions) { subscription.dispose(); }
});

test('filesystem failures are surfaced during discovery and opening', async () => {
  const error = Object.assign(new Error('Access denied'), { code: 'NoPermissions' });
  const discovery = setup({ '/site/wp-content': error }, ['/site']);
  await assert.rejects(discovery.provider.getChildren(), error);
  assert.match(discovery.errors[0], /Access denied/);
  const opening = setup({ '/site/wp-config.php': error });
  await opening.commands.get('wordpressDebugging.openFile')(new Uri('/site/wp-config.php'));
  assert.match(opening.errors[0], /Access denied/);
  assert.deepEqual(opening.opened, []);
});

test('invalid open command input is surfaced', async () => {
  const app = setup();
  await app.commands.get('wordpressDebugging.openFile')();
  assert.match(app.errors[0], /Select a debug file/);
});
