const path = require('node:path').posix;

function childUri(root, relativePath) {
  return root.with({ path: path.join(root.path, relativePath) });
}

async function statIfExists(fs, uri) {
  try {
    return await fs.stat(uri);
  } catch (error) {
    if (error.code === 'FileNotFound' || error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function findWordPressRoot(folder, fs, fileType) {
  let current = folder;
  while (true) {
    const content = await statIfExists(fs, childUri(current, 'wp-content'));
    if (content && (content.type & fileType.Directory)) {
      return current;
    }
    for (const marker of ['wp-config.php', 'wp-load.php']) {
      const stat = await statIfExists(fs, childUri(current, marker));
      if (stat && (stat.type & fileType.File)) {
        return current;
      }
    }
    const parentPath = path.dirname(current.path);
    if (parentPath === current.path || /^\/[a-z]:\/?$/i.test(current.path)) {
      return undefined;
    }
    current = current.with({ path: parentPath });
  }
}

module.exports = { childUri, statIfExists, findWordPressRoot };
