const assert = require('node:assert/strict');
const { test } = require('node:test');
const { childUri, statIfExists, findWordPressRoot } = require('../src/wordpress');

const FileType = { File: 1, Directory: 2 };

class Uri {
  constructor(path, scheme = 'file', authority = '') {
    this.path = path;
    this.scheme = scheme;
    this.authority = authority;
  }

  with({ path }) {
    return new Uri(path, this.scheme, this.authority);
  }

  get fsPath() {
    return this.path;
  }
}

function filesystem(entries) {
  return {
    async stat(uri) {
      if (!Object.hasOwn(entries, uri.path)) {
        throw Object.assign(new Error('Missing file'), { code: 'FileNotFound' });
      }
      return { type: entries[uri.path] };
    }
  };
}

test('discovers installation above an open theme and builds exact file paths', async () => {
  const fs = filesystem({ '/site/wp-content': FileType.Directory });
  const root = await findWordPressRoot(new Uri('/site/wp-content/themes/theme'), fs, FileType);
  assert.equal(root.path, '/site');
  assert.equal(childUri(root, 'wp-config.php').path, '/site/wp-config.php');
  assert.equal(childUri(root, 'wp-content/debug.log').path, '/site/wp-content/debug.log');
});

test('discovers a root workspace and both PHP markers', async () => {
  for (const marker of ['wp-config.php', 'wp-load.php']) {
    const root = await findWordPressRoot(
      new Uri('/site'),
      filesystem({ [`/site/${marker}`]: FileType.File }),
      FileType
    );
    assert.equal(root.path, '/site');
  }
});

test('selects the nearest installation', async () => {
  const root = await findWordPressRoot(
    new Uri('/site/nested/wp-content/themes/theme'),
    filesystem({ '/site/wp-content': 2, '/site/nested/wp-content': 2 }),
    FileType
  );
  assert.equal(root.path, '/site/nested');
});

test('returns no root for standalone themes and rejects incorrect marker types', async () => {
  const root = await findWordPressRoot(
    new Uri('/themes/theme'),
    filesystem({ '/themes/wp-content': 1, '/themes/wp-config.php': 2 }),
    FileType
  );
  assert.equal(root, undefined);
});

test('preserves remote scheme and authority', async () => {
  const root = await findWordPressRoot(
    new Uri('/site/wp-content/themes/theme', 'vscode-remote', 'ssh-remote+host'),
    filesystem({ '/site/wp-content': 2 }),
    FileType
  );
  const log = childUri(root, 'wp-content/debug.log');
  assert.equal(log.scheme, 'vscode-remote');
  assert.equal(log.authority, 'ssh-remote+host');
});

test('supports Windows drive URI paths', async () => {
  const root = await findWordPressRoot(
    new Uri('/c:/site/wp-content/themes/theme'),
    filesystem({ '/c:/site/wp-content': 2 }),
    FileType
  );
  assert.equal(root.path, '/c:/site');
});

test('does not walk above a Windows drive root', async () => {
  const fs = {
    async stat(uri) {
      assert.match(uri.path, /^\/c:\//);
      throw Object.assign(new Error('Missing file'), { code: 'FileNotFound' });
    }
  };
  assert.equal(await findWordPressRoot(new Uri('/c:/theme'), fs, FileType), undefined);
});

test('missing files are distinguished from permission and filesystem errors', async () => {
  assert.equal(await statIfExists(filesystem({}), new Uri('/missing')), undefined);
  const error = Object.assign(new Error('Access denied'), { code: 'NoPermissions' });
  const fs = { async stat() { throw error; } };
  await assert.rejects(statIfExists(fs, new Uri('/private')), error);
  await assert.rejects(findWordPressRoot(new Uri('/private'), fs, FileType), error);
});
